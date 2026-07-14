/**
 * [INPUT]: task-store 的 TaskEvent、core 的 Tool/ToolResult
 * [OUTPUT]: 上下文预算四件套 —— resolveContextWindow(窗口解析)/ estimateWatermark(水位)/
 *           isContextOverflowError(超窗识别)/ planCompaction+buildCompactionPreamble(确定性压缩)/
 *           withResultPersist(大结果落盘)
 * [POS]: §存储层策略纯函数。方案 B(owner 拍板 2026-07-14):零 LLM 摘要 ——
 *        对话原文永不被模型转述;压缩=给模型换一个确定性视图,压缩计划自己也是一条事件,
 *        事件流只增不减;细节兜底靠"文件即记忆"(全文落盘,随时 read_file 读回)。
 */
import type { TaskEvent } from './task-store.ts'
import type { Tool, ToolContext, ToolResult } from '../core/tool.ts'

// ---- 窗口解析 ----

/** 默认窗口:DeepSeek 1M 为 2026-07-14 真机实测(官方 API 400 报文自称 1048565);未知模型 128K 保守。profile.contextWindow 可覆盖 */
const WINDOW_PATTERNS: Array<[RegExp, number]> = [
  [/fable|opus-4-8|sonnet-5/i, 1_000_000],
  [/claude|haiku|opus|sonnet/i, 200_000],
  [/deepseek/i, 1_000_000],
  [/kimi|moonshot|glm|qwen/i, 128_000],
]

export function resolveContextWindow(model: string, override?: number): number {
  if (override && override > 0) return override
  for (const [re, win] of WINDOW_PATTERNS) if (re.test(model)) return win
  return 128_000
}

// ---- 水位 ----

/** 混合中英按 2 字符/token 估算(中文 ~1.5-2、英文 ~4,取中间值;水位主锚是真实 usage,估算只覆盖增量) */
export function estimateTokensFromChars(chars: number): number {
  return Math.ceil(chars / 2)
}

function isMain(e: TaskEvent): boolean {
  return e.agent_role == null || e.agent_role === 'main'
}

function parse(e: TaskEvent): Record<string, unknown> {
  try {
    return JSON.parse(e.payload_json) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** 每张图按 ~1200 token(2400 字符当量)保守计入 —— 视觉 token 占位,真实值由下一轮 usage 锚点自动校正 */
const IMAGE_CHAR_EQUIV = 2_400

function contentChars(e: TaskEvent): number {
  const p = parse(e)
  if (e.kind === 'user' || e.kind === 'model_step') {
    const images = Array.isArray(p.images) ? p.images.length : 0
    return String(p.content ?? '').length + images * IMAGE_CHAR_EQUIV
  }
  if (e.kind === 'tool_result') return String(p.llmContent ?? '').length
  return 0
}

export interface Watermark {
  /** 上次模型调用的真实 promptTokens(0 = 还没有过带 usage 的成功调用) */
  promptTokens: number
  /** promptTokens + 其后新增内容的估算 */
  estimatedTotal: number
}

/** 水位 = 最近一次真实 usage 锚点 + 其后新增内容估算。零额外 API 成本 */
export function estimateWatermark(events: TaskEvent[], systemPromptChars = 0): Watermark {
  const ordered = [...events].sort((a, b) => a.seq - b.seq)
  let anchor = 0
  let anchorIndex = -1
  for (let i = ordered.length - 1; i >= 0; i--) {
    const e = ordered[i]
    if (!isMain(e) || e.kind !== 'model_step') continue
    const usage = parse(e).usage as { promptTokens?: number } | undefined
    if (usage?.promptTokens) {
      anchor = usage.promptTokens
      anchorIndex = i
      break
    }
  }
  let tailChars = anchorIndex < 0 ? systemPromptChars : 0
  for (let i = anchorIndex + 1; i < ordered.length; i++) {
    if (isMain(ordered[i])) tailChars += contentChars(ordered[i])
  }
  return { promptTokens: anchor, estimatedTotal: anchor + estimateTokensFromChars(tailChars) }
}

// ---- 超窗错误识别 ----

/** 识别各家"prompt 超窗"错误文案(Anthropic / OpenAI 兼容 / DeepSeek / 中转);宁可漏认不可错认 */
export function isContextOverflowError(message: string): boolean {
  return /prompt is too long|context[_ ](length|window)|maximum context length|context_length_exceeded|exceeds? (the )?(model'?s? )?(maximum )?(context|input)|too many tokens|input (is )?too (long|large)/i.test(
    message,
  )
}

// ---- 确定性压缩 ----

export interface CompactionOptions {
  /** 压缩后保留的近期完整对话预算(估算 token) */
  keepRecentTokens: number
  /** 历史用户原话逐字保留预算(估算 token) */
  userVerbatimTokens: number
}

export const DEFAULT_COMPACTION: CompactionOptions = { keepRecentTokens: 20_000, userVerbatimTokens: 12_000 }

export interface CompactionPlan {
  /** 从这个 seq 起(含)的事件按原样重放;更早的进入确定性归档 */
  cutFromSeq: number
  /** 逐字保留的历史用户消息(时间顺序;放不下的最老一条被截断并标注) */
  verbatimUsers: string[]
  /** 被归档的主线程事件数 */
  archivedEvents: number
}

/**
 * 制定确定性压缩计划:切点永远落在 user 事件上(整轮保留,绝不拆 tool_call/tool_result 配对)。
 * 最新一轮无条件保留;更早的轮次按 keepRecentTokens 预算从新到旧装入。
 * 返回 null = 没什么可压(不足两轮,或切点已在第一轮)。
 */
export function planCompaction(events: TaskEvent[], opts: CompactionOptions = DEFAULT_COMPACTION): CompactionPlan | null {
  const ordered = [...events].sort((a, b) => a.seq - b.seq).filter(isMain)
  const userIdx: number[] = []
  for (let i = 0; i < ordered.length; i++) if (ordered[i].kind === 'user') userIdx.push(i)
  if (userIdx.length < 2) return null

  // 从最新一轮往回装,超预算即停;至少保最新一轮
  let keepFrom = userIdx[userIdx.length - 1]
  let acc = 0
  for (let t = userIdx.length - 1; t >= 0; t--) {
    const start = userIdx[t]
    const end = t + 1 < userIdx.length ? userIdx[t + 1] : ordered.length
    let turnChars = 0
    for (let i = start; i < end; i++) turnChars += contentChars(ordered[i])
    const turnTokens = estimateTokensFromChars(turnChars)
    if (t < userIdx.length - 1 && acc + turnTokens > opts.keepRecentTokens) break
    acc += turnTokens
    keepFrom = start
  }
  if (keepFrom === userIdx[0]) return null

  // 历史用户原话:切点之前的 user 事件,从新到旧按预算装,再翻回时间顺序
  const verbatim: string[] = []
  let budget = opts.userVerbatimTokens
  for (let t = userIdx.length - 1; t >= 0; t--) {
    const i = userIdx[t]
    if (i >= keepFrom) continue
    if (budget <= 0) break
    const text = String(parse(ordered[i]).content ?? '')
    const tokens = estimateTokensFromChars(text.length)
    if (tokens <= budget) {
      verbatim.push(text)
      budget -= tokens
    } else {
      verbatim.push(`${text.slice(0, Math.max(200, budget * 2))}\n[此消息过长已截断,完整原文在历史记录中]`)
      break
    }
  }
  verbatim.reverse()

  return { cutFromSeq: ordered[keepFrom].seq, verbatimUsers: verbatim, archivedEvents: keepFrom }
}

/** 压缩事件 payload:自包含 —— 重建线程只需要它 + cutFromSeq 起的事件 */
export interface CompactionPayload {
  cutFromSeq: number
  manifest: string
  verbatimUsers: string[]
  archivedEvents: number
  estTokensBefore: number
}

/** 检查点渲染成一条 user 消息 —— 全部内容确定性拼装,零模型转述 */
export function buildCompactionPreamble(p: CompactionPayload): string {
  const users = p.verbatimUsers.length ? p.verbatimUsers.map((u, i) => `${i + 1}. ${u}`).join('\n') : '(无)'
  return [
    '[上下文检查点 · 系统自动整理]',
    '为控制上下文体积,更早的过程细节(模型步骤与工具输出)已从当前视图归档。归档不等于丢失:研究产物与超大工具输出都是工作区里的真实文件,可用 read_file / list_dir 直接读取;对话原始记录在应用的事件库里 —— 你没有读取它的工具,不要尝试去找,用户界面可完整回看。',
    '以下信息为逐字保留,不是摘要:',
    '',
    '## 工作区文件',
    p.manifest || '(空)',
    '',
    '## 此前的用户消息(逐字)',
    users,
    '',
    '(以上是背景;请自然衔接下方最近对话,不要向用户复述本检查点。)',
  ].join('\n')
}

// ---- 大结果落盘 ----

interface PersistFs {
  writeBytes(path: string, bytes: Uint8Array): Promise<void>
}

export const PERSIST_TOOL_RESULT_CHARS = 16_000
const PERSIST_PREVIEW_CHARS = 2_000
const PERSIST_DIR = 'cache/tool-results'

let persistSeq = 0

/**
 * 包装工具:超限输出全文落盘到会话 cache/tool-results/,线程与事件里只留预览+路径。
 * 学 Claude Code 的"大结果落盘"层:内容永不真丢,模型需要时 read_file 读回;
 * 落盘失败宁可占上下文也不丢内容。
 */
export function withResultPersist(tool: Tool, fs: PersistFs, maxChars = PERSIST_TOOL_RESULT_CHARS): Tool {
  return {
    spec: tool.spec,
    async run(args: Record<string, unknown>, ctx: ToolContext, signal?: AbortSignal): Promise<ToolResult> {
      const result = await tool.run(args, ctx, signal)
      const content = result.llmContent
      if (typeof content !== 'string' || content.length <= maxChars) return result
      // read_file 读回落盘文件本身时不再二次落盘
      if (tool.spec.name === 'read_file' && String((args as { path?: unknown }).path ?? '').startsWith(`${PERSIST_DIR}/`)) {
        return result
      }
      persistSeq += 1
      const file = `${PERSIST_DIR}/${Date.now().toString(36)}-${persistSeq}-${tool.spec.name}.txt`
      try {
        await fs.writeBytes(file, new TextEncoder().encode(content))
      } catch {
        return result
      }
      return {
        ...result,
        llmContent: `[输出过大(${content.length} 字符),全文已存 ${file} —— 需要完整内容请用 read_file 读该路径]\n\n预览(前 ${PERSIST_PREVIEW_CHARS} 字符):\n${content.slice(0, PERSIST_PREVIEW_CHARS)}`,
      }
    },
  }
}

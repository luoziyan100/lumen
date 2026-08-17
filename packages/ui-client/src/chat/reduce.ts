/**
 * [INPUT]: TaskEvent + payload;ChatItem 前态;sourceCite / activePath 的纯解析
 * [OUTPUT]: reduceUserFacingItems / reduceChatItems / reduceEvidenceItems;
 *           sealRunningProcesses / sealOpenTodos / coalesceTurnThoughts;
 *           parseAskUserQuestions / isLiveTaskEvent / safeParse
 * [POS]: 事件→界面状态的纯函数核(宪法:UI 状态是事件流的纯函数);
 *        useAgent hook 只订阅/投影,不内嵌归约分支
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { ImageData, TaskEvent, UploadRef } from '../agent-client'
import { pathFromToolArgs } from '../activePath.ts'
import {
  mergeSources,
  sourcesFromTool,
  urlFromToolArgs,
  titleFromUrl,
  type SourceCite,
} from '../sourceCite.ts'
import type {
  AskUserOption,
  AskUserQuestion,
  ChatItem,
  ChatMsg,
  ProcessItem,
  ProcStep,
  ThoughtItem,
} from './types.ts'
import {
  isTodoTool,
  safeParse,
  todoFromLlmContent,
  todoFromToolArgs,
  upsertTodo,
} from './todo.ts'

export { safeParse } from './todo.ts'

const VERB: Record<string, string> = {
  search_papers: '检索文献', openalex_search: '检索文献', web_search: '网页搜索', search_web: '网页搜索',
  extract_pdf: '读取 PDF', fetch_url: '抓取网页', read_url: '抓取网页',
  write_file: '写入文件', read_file: '读取文件', list_files: '浏览工作区', list_dir: '列目录', grep: '检索内文',
  run_code: '运行代码', todo_write: '更新进度', update_plan: '更新进度', ask_user: '询问用户',
  spawn_subagent: '子代理', wait_subagents: '等待子代理', get_subagent_output: '读子代理结果',
  kill_subagent: '中止子代理',
}
const verb = (name: string): string => VERB[name] ?? name

/** 从 tool_call.args 解析 ask_user 题目(UI 侧宽松校验) */
export function parseAskUserQuestions(args: unknown): AskUserQuestion[] | null {
  const raw = typeof args === 'string' ? safeParse(args) : (args && typeof args === 'object' ? args as Record<string, unknown> : null)
  if (!raw || !Array.isArray(raw.questions) || raw.questions.length === 0) return null
  const out: AskUserQuestion[] = []
  for (let i = 0; i < raw.questions.length && i < 4; i++) {
    const q = raw.questions[i]
    if (!q || typeof q !== 'object') continue
    const row = q as { id?: unknown; header?: unknown; question?: unknown; options?: unknown }
    const question = String(row.question ?? '').trim()
    if (!question || !Array.isArray(row.options) || row.options.length < 2) continue
    const options: AskUserOption[] = []
    for (const opt of row.options) {
      if (!opt || typeof opt !== 'object') continue
      const orow = opt as { label?: unknown; description?: unknown }
      const label = String(orow.label ?? '').trim()
      if (!label) continue
      const description = orow.description != null ? String(orow.description).trim() : ''
      options.push(description ? { label, description } : { label })
    }
    if (options.length < 2) continue
    const header = row.header != null ? String(row.header).trim() : ''
    out.push({
      id: String(row.id ?? `q${i + 1}`).trim() || `q${i + 1}`,
      question,
      options,
      ...(header ? { header } : {}),
    })
  }
  return out.length ? out : null
}

/** 事件是否仍归属当前视图。切会话后在途 setState 必须丢弃,否则空草稿会串出旧「研究过程」。 */
export function isLiveTaskEvent(
  eventTaskId: string,
  activeTaskId: string | null,
  eventEpoch: number,
  activeEpoch: number,
): boolean {
  return eventEpoch === activeEpoch && activeTaskId != null && eventTaskId === activeTaskId
}
/** 助手开口或轮次终态:把所有还在跑的过程块封口(避免旧块永远 running→虚线圈 breathing) */
export function sealRunningProcesses(items: ChatItem[]): ChatItem[] {
  if (!items.some((it) => it.kind === 'process' && it.running)) return items
  return items.map((it) => (it.kind === 'process' && it.running ? { ...it, running: false } : it))
}

/**
 * 轮次终态收口 Todo:模型常忘最后一次 todo_write 把 in_progress→completed,
 * 右轨会假「正在…」(HDD task-5bacbbc0 V2)。
 * done/reply 路径:未完成项一律 completed(交付已结束,清单对齐事实)。
 */
export function sealOpenTodos(items: ChatItem[]): ChatItem[] {
  let changed = false
  const next = items.map((it) => {
    if (it.kind !== 'todo') return it
    if (!it.todos.some((t) => t.status !== 'completed')) return it
    changed = true
    return {
      ...it,
      todos: it.todos.map((t) => (t.status === 'completed' ? t : { ...t, status: 'completed' as const })),
    }
  })
  return changed ? next : items
}

/** 终局组合:卸过程 + 收 Thought + 收口 Todo */
function sealTurnEnd(items: ChatItem[], at?: string): ChatItem[] {
  const finalized = finalizeProvisional(items)
  return sealOpenTodos(markThoughtsDone(stripProcessItems(finalized), at))
}

function markThoughtsDone(prev: ChatItem[], at?: string): ChatItem[] {
  if (!prev.some((it) => it.kind === 'thought' && !it.done)) return prev
  const endedAt = at ?? new Date().toISOString()
  return prev.map((it) => (
    it.kind === 'thought' && !it.done ? { ...it, done: true, endedAt } : it
  ))
}

function lastUserIndex(prev: ChatItem[]): number {
  for (let i = prev.length - 1; i >= 0; i -= 1) {
    if (prev[i]?.kind === 'msg' && (prev[i] as ChatMsg).role === 'user') return i
  }
  return -1
}

/**
 * 本 turn 的 thought 下标(最后一个 user 之后,不论 done)。
 * 同 turn 新 reasoning 必须续写同一块——子代理/思考 hop 会把 thought 标 done 再开口。
 * 跨 turn 不得拼进上一轮。
 */
function findTurnThoughtIdx(prev: ChatItem[]): number {
  const lastUser = lastUserIndex(prev)
  for (let i = prev.length - 1; i > lastUser; i -= 1) {
    if (prev[i]?.kind === 'thought') return i
  }
  return -1
}

/**
 * 新 thought 插入点:本 turn 内、最终/流式答案气泡之前。
 * 合同顺序 user → thought → process → answer(Claude 档)。
 * 旧实现 [...prev, thought] 在 text_delta 已占坑后会变成 answer→thought 倒置。
 */
function thoughtInsertIndex(prev: ChatItem[]): number {
  const lastUser = lastUserIndex(prev)
  // 从尾部往 user 扫:答案气泡(含 provisional)应在 thought 之后,故插入点取最靠前的答案位
  for (let i = lastUser + 1; i < prev.length; i += 1) {
    const it = prev[i]
    if (it?.kind === 'msg' && it.role === 'assistant') return i
  }
  return prev.length
}

function upsertThought(
  prev: ChatItem[],
  eventId: string,
  chunk: string,
  done = false,
  at?: string,
): ChatItem[] {
  const text = chunk.trim()
  if (!text && !done) return prev
  const idx = findTurnThoughtIdx(prev)
  if (idx >= 0) {
    const cur = prev[idx] as ThoughtItem
    const nextContent = text
      ? (cur.content ? `${cur.content}\n\n${text}` : text)
      : cur.content
    const reopened = Boolean(text)
    const next: ThoughtItem = {
      ...cur,
      content: nextContent,
      done: reopened ? false : (done || cur.done),
      startedAt: cur.startedAt ?? at,
      endedAt: reopened ? undefined : (done ? (at ?? cur.endedAt) : cur.endedAt),
    }
    return prev.map((it, i) => (i === idx ? next : it))
  }
  if (!text) return prev
  const insertAt = thoughtInsertIndex(prev)
  const item: ThoughtItem = {
    kind: 'thought',
    id: `thought-${eventId}`,
    content: text,
    done,
    startedAt: at,
    ...(done && at ? { endedAt: at } : {}),
  }
  return [...prev.slice(0, insertAt), item, ...prev.slice(insertAt)]
}

function mergeThoughts(thoughts: ThoughtItem[]): ThoughtItem {
  if (thoughts.length === 1) return thoughts[0]!
  const contents: string[] = []
  for (const t of thoughts) {
    const body = t.content.trim()
    if (body && !contents.includes(body)) contents.push(body)
  }
  const allDone = thoughts.every((t) => t.done)
  return {
    kind: 'thought',
    id: thoughts[0]!.id,
    content: contents.join('\n\n'),
    done: allDone,
    startedAt: thoughts.find((t) => t.startedAt)?.startedAt,
    endedAt: allDone ? thoughts[thoughts.length - 1]?.endedAt : undefined,
  }
}

/** 同 turn 多段 Thought(子代理 hop / 历史回放)收成一块,插在本轮答案之前 */
export function coalesceTurnThoughts(items: ChatItem[]): ChatItem[] {
  const out: ChatItem[] = []
  let i = 0
  while (i < items.length) {
    const leadingUser = items[i]?.kind === 'msg' && (items[i] as ChatMsg).role === 'user'
      ? items[i]
      : null
    if (leadingUser) i += 1
    const thoughts: ThoughtItem[] = []
    const rest: ChatItem[] = []
    while (i < items.length) {
      const cur = items[i]
      if (cur?.kind === 'msg' && cur.role === 'user') break
      if (cur?.kind === 'thought') thoughts.push(cur)
      else if (cur) rest.push(cur)
      i += 1
    }
    if (leadingUser) out.push(leadingUser)
    if (thoughts.length) {
      const merged = mergeThoughts(thoughts)
      const ansAt = rest.findIndex((x) => x.kind === 'msg' && x.role === 'assistant')
      if (ansAt >= 0) rest.splice(ansAt, 0, merged)
      else rest.unshift(merged)
    }
    out.push(...rest)
  }
  return out
}

function dropStreamingAssistant(prev: ChatItem[]): ChatItem[] {
  const last = prev[prev.length - 1]
  if (last?.kind === 'msg' && last.role === 'assistant' && last.streaming) {
    return prev.slice(0, -1)
  }
  return prev
}

/**
 * 中间旁白 → Thought：工具出现前模型常把「下一步打算」流进 content。
 * 若直接当大气泡会像终稿（静默 + 停发），转接工具时又硬切。
 */
function demoteProvisionalAssistantToThought(prev: ChatItem[], eventId: string): ChatItem[] {
  let idx = -1
  for (let i = prev.length - 1; i >= 0; i -= 1) {
    const it = prev[i]
    if (it?.kind === 'msg' && it.role === 'assistant' && (it.streaming || it.provisional)) {
      idx = i
      break
    }
  }
  if (idx < 0) return prev
  const msg = prev[idx] as ChatMsg
  const body = msg.content.trim()
  let next = prev.filter((_, i) => i !== idx)
  if (body) next = upsertThought(next, eventId, body, false)
  return next
}

/** 终局：过程块从用户面消失（非折叠，而是整块卸下） */
function stripProcessItems(prev: ChatItem[]): ChatItem[] {
  if (!prev.some((it) => it.kind === 'process')) return prev
  const sources = collectTurnSources(prev)
  return decorateLastAssistant(prev.filter((it) => it.kind !== 'process'), sources)
}

/**
 * H1 Turn-scoped ToolGroup：本 user turn 内至多一块 process。
 * 在最后一个 user 之后找最后一条 process（不论 running）。
 */
function findTurnProcessIndex(prev: ChatItem[]): number {
  let lastUser = -1
  for (let i = prev.length - 1; i >= 0; i -= 1) {
    const it = prev[i]
    if (it?.kind === 'msg' && it.role === 'user') {
      lastUser = i
      break
    }
  }
  for (let i = prev.length - 1; i > lastUser; i -= 1) {
    if (prev[i]?.kind === 'process') return i
  }
  return -1
}

/**
 * 追加/复活本 turn 唯一过程块：running=false 后新工具仍续写，不 new 第二张卡。
 * 更新后把块挪到列表末尾，贴近「思考中」与当前焦点。
 */
function appendProcessStep(prev: ChatItem[], step: ProcStep, at?: string, extraSources?: SourceCite[]): ChatItem[] {
  const idx = findTurnProcessIndex(prev)
  if (idx < 0) {
    return [...prev, {
      kind: 'process',
      id: `proc-${step.id}`,
      steps: [step],
      running: true,
      startedAt: at,
      ...(extraSources?.length ? { sources: extraSources } : {}),
    }]
  }
  const proc = prev[idx] as ProcessItem
  const steps = proc.steps.some((s) => s.id === step.id)
    ? proc.steps.map((s) => (s.id === step.id ? { ...s, ...step, done: false } : s))
    : [...proc.steps, step]
  const sources = extraSources?.length ? mergeSources(proc.sources ?? [], extraSources) : proc.sources
  const without = prev.filter((_, i) => i !== idx)
  return [...without, { ...proc, steps, running: true, startedAt: proc.startedAt ?? at, ...(sources?.length ? { sources } : {}) }]
}

function collectTurnSources(prev: ChatItem[]): SourceCite[] {
  const idx = findTurnProcessIndex(prev)
  if (idx < 0) return []
  const proc = prev[idx]
  return proc?.kind === 'process' ? (proc.sources ?? []) : []
}

function finishAssistant(id: string, content: string, extra: SourceCite[] = []): ChatMsg {
  const sources = mergeSources(extra)
  return {
    kind: 'msg',
    id,
    role: 'assistant',
    content,
    ...(sources.length ? { sources } : {}),
  }
}

function decorateLastAssistant(items: ChatItem[], extra: SourceCite[]): ChatItem[] {
  if (!extra.length && !items.some((it) => it.kind === 'msg' && it.role === 'assistant')) return items
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const it = items[i]
    if (it?.kind === 'msg' && it.role === 'user') break
    if (it?.kind === 'msg' && it.role === 'assistant') {
      const next = finishAssistant(it.id, it.content, mergeSources(it.sources ?? [], extra))
      if (next.content === it.content && (next.sources?.length ?? 0) === (it.sources?.length ?? 0)) return items
      const out = items.slice()
      out[i] = { ...it, content: next.content, ...(next.sources?.length ? { sources: next.sources } : {}) }
      return out
    }
  }
  return items
}

/**
 * 用户面归约（H1 = Claude 两阶段 × Turn-scoped ToolGroup）：
 * - **进行中**：本 turn **至多一块** process（steps 续写，含 running=false 后复活）
 * - 中间 content 旁白 → Thought；text_delta 标 provisional，不卸过程
 * - **终局**（无工具定稿 / reply）：过程卸下，Thought 收起，只留最终答案
 * - todo 仍展示
 */
export function reduceUserFacingItems(prev: ChatItem[], event: TaskEvent, p: Record<string, unknown>): ChatItem[] {
  return coalesceTurnThoughts(reduceUserFacingInner(prev, event, p))
}

function reduceUserFacingInner(prev: ChatItem[], event: TaskEvent, p: Record<string, unknown>): ChatItem[] {
  switch (event.kind) {
    case 'user': {
      const images = Array.isArray(p.images) ? (p.images as ImageData[]) : undefined
      const uploads = parseUploadRefs(p.uploads)
      // 新 user turn：上一轮 thought 标 done；清残留 process
      const base = markThoughtsDone(stripProcessItems(prev), event.created_at)
      return [...base, {
        kind: 'msg',
        id: event.id,
        role: 'user',
        content: String(p.content ?? ''),
        ...(images?.length ? { images } : {}),
        ...(uploads.length ? { uploads } : {}),
      }]
    }
    case 'text_delta': {
      const text = String(p.text ?? '')
      if (!text) return prev
      // 已有过程 = 工具轮中途：旁白与过程并存，不卸过程（否则像终稿+停发割裂）
      // 尚无过程：也先 provisional 流式，等 model_step 再决定升格/折进 Thought
      const last = prev[prev.length - 1]
      if (last?.kind === 'msg' && last.role === 'assistant' && last.streaming) {
        return [...prev.slice(0, -1), {
          ...last,
          content: last.content + text,
          provisional: true,
        }]
      }
      return [...prev, {
        kind: 'msg',
        id: event.id,
        role: 'assistant',
        content: text,
        streaming: true,
        provisional: true,
      }]
    }
    // 进行中：过程可见；若有流式旁白先折进 Thought，避免正文→工具硬切
    case 'tool_call_start':
    case 'subagent_started': {
      const demoted = demoteProvisionalAssistantToThought(prev, event.id)
      return reduceChatItems(demoted, event, p)
    }
    case 'subagent_completed':
    case 'subagent_interrupted':
    case 'subagent_demoted':
      return reduceChatItems(prev, event, p)
    case 'model_step': {
      const content = typeof p.content === 'string' ? p.content.trim() : ''
      const tools = Array.isArray(p.toolCalls) ? p.toolCalls : []
      const reasoning = typeof p.reasoningContent === 'string' ? p.reasoningContent.trim() : ''
      let next = prev
      // 先收 reasoning:upsertThought 会插到本 turn 答案气泡之前(防 text_delta 倒置)
      if (reasoning) next = upsertThought(next, event.id, reasoning, false, event.created_at)

      if (tools.length > 0) {
        // 工具轮：旁白进 Thought；过程保持（进行中可见）
        next = demoteProvisionalAssistantToThought(next, event.id)
        // model_step 的 content 若没走过 text_delta，也并入 Thought
        if (content) {
          const open = findTurnThoughtIdx(next)
          const lastThought = open >= 0 ? (next[open] as ThoughtItem) : undefined
          if (!lastThought || !lastThought.content.includes(content.slice(0, Math.min(40, content.length)))) {
            next = upsertThought(next, event.id, content, false, event.created_at)
          }
        }
        return next
      }

      // 纯 reasoning、无正文、无工具 = 思考 hop(子代理/思考模型),不是终局
      if (!content) return next

      // —— 终局：无工具定稿 —— 过程消失，只留 Thought + 答案
      const toolSources = collectTurnSources(next)
      next = stripProcessItems(next)

      // thought 插入后下标可能变,须重扫 provisional
      let streamingIdx = -1
      for (let i = next.length - 1; i >= 0; i -= 1) {
        const it = next[i]
        if (it?.kind === 'msg' && it.role === 'assistant' && (it.streaming || it.provisional)) {
          streamingIdx = i
          break
        }
      }
      if (streamingIdx >= 0) {
        const out = next.slice()
        if (content) {
          const carried = out[streamingIdx]?.kind === 'msg' ? (out[streamingIdx] as ChatMsg).sources : undefined
          out[streamingIdx] = finishAssistant(event.id, content, mergeSources(toolSources, carried ?? []))
          return markThoughtsDone(out, event.created_at)
        }
        out.splice(streamingIdx, 1)
        if (!content && !reasoning) {
          return [...markThoughtsDone(out, event.created_at), {
            kind: 'msg',
            id: event.id,
            role: 'error',
            content: '模型返回了空回复（常见于思考模式耗尽输出额度）。请重试，或在设置中换模型。',
          }]
        }
        return markThoughtsDone(out, event.created_at)
      }
      if (content) {
        return markThoughtsDone([...next, finishAssistant(event.id, content, toolSources)], event.created_at)
      }
      if (!reasoning) {
        return [...next, {
          kind: 'msg',
          id: event.id,
          role: 'error',
          content: '模型返回了空回复（常见于思考模式耗尽输出额度）。请重试，或在设置中换模型。',
        }]
      }
      return markThoughtsDone(next, event.created_at)
    }
    case 'tool_call': {
      const name = String(p.name ?? 'tool')
      if (isTodoTool(name)) {
        const list = todoFromToolArgs(p.args)
        return list ? upsertTodo(prev, event.id, list) : prev
      }
      const demoted = demoteProvisionalAssistantToThought(prev, event.id)
      return reduceChatItems(demoted, event, p)
    }
    case 'tool_result': {
      const name = String(p.name ?? '')
      if (isTodoTool(name)) {
        const list = todoFromLlmContent(typeof p.llmContent === 'string' ? p.llmContent : '')
        return list ? upsertTodo(prev, event.id, list) : prev
      }
      return reduceChatItems(prev, event, p)
    }
    case 'reply':
      // 终局：卸过程 + 收 Thought + 收口 Todo；残留 provisional 升格为定稿
      return sealTurnEnd(prev, event.created_at)
    case 'status_change': {
      const to = String(p.to ?? '')
      if (!['canceled', 'failed', 'done', 'interrupted'].includes(to)) return prev
      return sealTurnEnd(prev, event.created_at)
    }
    case 'compaction':
      return [...prev, { kind: 'compaction', id: event.id }]
    case 'error':
      return sealOpenTodos(markThoughtsDone(stripProcessItems([
        ...finalizeProvisional(prev),
        { kind: 'msg', id: event.id, role: 'error', content: String(p.error ?? '出错了') },
      ]), event.created_at))
    default:
      return prev
  }
}

/** reply/error 时把未升格的 provisional 定成普通助手泡（避免内容蒸发） */
function finalizeProvisional(prev: ChatItem[]): ChatItem[] {
  return prev.map((it) => {
    if (it.kind === 'msg' && it.role === 'assistant' && (it.streaming || it.provisional)) {
      return { kind: 'msg', id: it.id, role: 'assistant', content: it.content }
    }
    return it
  })
}

/** 证据面归约:同一个 event 进来,prev → next。完整 process/subagent。 */
export function reduceChatItems(prev: ChatItem[], event: TaskEvent, p: Record<string, unknown>): ChatItem[] {
  switch (event.kind) {
    case 'user': {
      const images = Array.isArray(p.images) ? (p.images as ImageData[]) : undefined
      const uploads = parseUploadRefs(p.uploads)
      return [...prev, {
        kind: 'msg',
        id: event.id,
        role: 'user',
        content: String(p.content ?? ''),
        ...(images?.length ? { images } : {}),
        ...(uploads.length ? { uploads } : {}),
      }]
    }
    case 'text_delta': {
      const text = String(p.text ?? '')
      if (!text) return prev
      // 正文开始 = 上一截工具叙事结束;封口后才挂 streaming 泡
      const sealed = sealRunningProcesses(prev)
      const last = sealed[sealed.length - 1]
      if (last?.kind === 'msg' && last.role === 'assistant' && last.streaming) {
        return [...sealed.slice(0, -1), { ...last, content: last.content + text }]
      }
      return [...sealed, { kind: 'msg', id: event.id, role: 'assistant', content: text, streaming: true }]
    }
    case 'tool_call_start': {
      const name = String(p.name ?? 'tool')
      if (isTodoTool(name)) return prev // Todo 等完整 tool_call
      const id = String(p.id ?? event.id)
      const step: ProcStep = { id, name, done: false, label: `${verb(name)}…` }
      const fromUrl = urlFromToolArgs(p.args ?? p)
      const extra = fromUrl ? [{ url: fromUrl, title: titleFromUrl(fromUrl) }] : []
      return appendProcessStep(prev, step, event.created_at, extra)
    }
    case 'model_step': {
      const content = typeof p.content === 'string' ? p.content.trim() : ''
      const tools = Array.isArray(p.toolCalls) ? p.toolCalls : []
      // 有正文才封口过程块;纯工具轮保持 running 以便续挂 steps
      const base = content ? sealRunningProcesses(prev) : prev
      let streamingIdx = -1
      for (let i = base.length - 1; i >= 0; i -= 1) {
        const it = base[i]
        if (it?.kind === 'msg' && it.role === 'assistant' && it.streaming) {
          streamingIdx = i
          break
        }
      }
      if (streamingIdx >= 0) {
        const next = base.slice()
        if (content) {
          next[streamingIdx] = { kind: 'msg', id: event.id, role: 'assistant', content }
        } else if (tools.length === 0) {
          next[streamingIdx] = {
            kind: 'msg',
            id: event.id,
            role: 'error',
            content: '模型返回了空回复（常见于思考模式耗尽输出额度）。请重试，或在设置中换模型。',
          }
        } else {
          next.splice(streamingIdx, 1) // 纯工具轮:丢掉半成品泡
        }
        return next
      }
      if (content) return [...base, { kind: 'msg', id: event.id, role: 'assistant', content }]
      // 空正文且无工具:历史上会被静默丢掉 → 用户只看见自己的气泡(DeepSeek V4 思考烧光额度)
      if (tools.length === 0) {
        return [...base, {
          kind: 'msg',
          id: event.id,
          role: 'error',
          content: '模型返回了空回复（常见于思考模式耗尽输出额度）。请重试，或在设置中换模型。',
        }]
      }
      return base
    }
    case 'tool_call': {
      const name = String(p.name ?? 'tool')
      if (isTodoTool(name)) {
        const list = todoFromToolArgs(p.args)
        return list ? upsertTodo(prev, event.id, list) : prev
      }
      const id = String(p.id ?? event.id)
      const path = pathFromToolArgs(p.args) ?? undefined
      const step: ProcStep = {
        id,
        name,
        done: false,
        label: `${verb(name)}…`,
        ...(path ? { path } : {}),
      }
      const fromUrl = urlFromToolArgs(p.args)
      const extra = fromUrl ? [{ url: fromUrl, title: titleFromUrl(fromUrl) }] : []
      return appendProcessStep(prev, step, event.created_at, extra)
    }
    case 'tool_result': {
      const name = String(p.name ?? '')
      if (isTodoTool(name)) {
        const list = todoFromLlmContent(typeof p.llmContent === 'string' ? p.llmContent : '')
        return list ? upsertTodo(prev, event.id, list) : prev
      }
      const id = String(p.id ?? '')
      const payloadPath = typeof p.path === 'string' && p.path.trim() ? p.path.trim() : null
      let fallbackPath: string | undefined
      for (const it of prev) {
        if (it.kind !== 'process') continue
        const s = it.steps.find((x) => x.id === id)
        if (s?.path) { fallbackPath = s.path; break }
      }
      const path = payloadPath ?? fallbackPath
      const llm = typeof p.llmContent === 'string' ? p.llmContent : ''
      const label = summarize(name, llm, path)
      const extra = sourcesFromTool(name, p.args, llm)
      return prev.map((it) => {
        if (it.kind !== 'process') return it
        const steps = it.steps.map((s) => (s.id === id
          ? { ...s, done: true, label, ...(path ? { path } : {}) }
          : s))
        const sources = extra.length ? mergeSources(it.sources ?? [], extra) : it.sources
        // 全部完成 → running=false：球冻结 + 让出「思考中」指示（避免假 running 堵死动效）
        return { ...it, steps, running: steps.some((s) => !s.done), ...(sources?.length ? { sources } : {}) }
      })
    }
    case 'reply':
      return sealOpenTodos(sealRunningProcesses(prev))
    case 'status_change': {
      // 取消/失败等终态:过程块 + 未勾 Todo 一并收口
      const to = String(p.to ?? '')
      if (!['canceled', 'failed', 'done', 'interrupted'].includes(to)) return prev
      return sealOpenTodos(sealRunningProcesses(prev))
    }
    case 'compaction':
      // 确定性压缩标记(方案 B):旧细节归档,给一条弱分隔线
      return [...prev, { kind: 'compaction', id: event.id }]
    case 'subagent_started': {
      const sid = String(p.subagent_id ?? event.id)
      const stype = String(p.subagent_type ?? 'subagent')
      const desc = String(p.description ?? stype)
      const step: ProcStep = {
        id: `sub-${sid}`,
        name: 'spawn_subagent',
        done: false,
        label: `子代理 ${stype}：${desc}`,
      }
      return appendProcessStep(prev, step, event.created_at)
    }
    case 'subagent_completed':
    case 'subagent_interrupted':
    case 'subagent_demoted': {
      const sid = String(p.subagent_id ?? '')
      const status = String(p.status ?? event.kind.replace('subagent_', ''))
      const summary = typeof p.summary === 'string' ? p.summary
        : typeof p.completion_summary === 'string' ? p.completion_summary
          : status
      const label = event.kind === 'subagent_demoted'
        ? '子代理已转后台继续'
        : `子代理 ${status}${summary && summary !== status ? ` · ${summary.slice(0, 80)}` : ''}`
      return prev.map((it) => {
        if (it.kind !== 'process') return it
        const steps = it.steps.map((s) => (
          s.id === `sub-${sid}`
            ? { ...s, done: event.kind !== 'subagent_demoted', label }
            : s
        ))
        const stillRun = event.kind === 'subagent_demoted'
          ? it.running
          : steps.some((s) => !s.done) ? it.running : false
        return { ...it, steps, running: stillRun && steps.some((s) => !s.done) }
      })
    }
    case 'error':
      return [...prev, { kind: 'msg', id: event.id, role: 'error', content: String(p.error ?? '出错了') }]
    default:
      return prev
  }
}

/** 证据面别名（与 reduceChatItems 相同） */
export function reduceEvidenceItems(prev: ChatItem[], event: TaskEvent, p: Record<string, unknown>): ChatItem[] {
  return reduceChatItems(prev, event, p)
}

/** 完成态摘要:write/edit 优先展示 path;旧事件无 path 时「完成(无 path)」 */
function summarize(name: string, llmContent: string, path?: string): string {
  const v = verb(name)
  if (name === 'ask_user') {
    if (llmContent.includes('跳过')) return `${v} · 已跳过`
    return `${v} · 已回答`
  }
  if (name === 'write_file' || name === 'edit_file') {
    if (path) return `${v} · ${path}`
    // 从 llmContent 兜底:ok: 已写入 notes/a.md
    const m = llmContent.match(/已(?:写入|编辑)\s+(\S+)/)
    if (m?.[1]) return `${v} · ${m[1]}`
    return `${v} · 完成(无 path)`
  }
  if (name === 'extract_pdf') {
    const n = llmContent.length
    return `读取 PDF · ${n >= 1000 ? `${Math.round(n / 1000)}k 字` : `${n} 字`}`
  }
  const hits = countHits(llmContent)
  if (/search|papers/.test(name)) return hits ? `${v} · 命中 ${hits}` : `${v} · 完成`
  return `${v} · 完成`
}

function countHits(s: string): number {
  const t = s.trim()
  try {
    const j = JSON.parse(t) as unknown
    if (Array.isArray(j)) return j.length
    if (j && typeof j === 'object' && Array.isArray((j as { results?: unknown[] }).results)) {
      return (j as { results: unknown[] }).results.length
    }
  } catch { /* 非 JSON,放弃计数 */ }
  return 0
}

/** 从 user 事件 payload 解析 uploads(与 service parseUploads 同构) */
function parseUploadRefs(raw: unknown): UploadRef[] {
  if (!Array.isArray(raw)) return []
  const out: UploadRef[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const path = typeof o.path === 'string' ? o.path : ''
    if (!path) continue
    const name = typeof o.name === 'string' && o.name ? o.name : (path.split('/').pop() ?? path)
    const extractPath = typeof o.extractPath === 'string' ? o.extractPath : undefined
    out.push({ name, path, ...(extractPath ? { extractPath } : {}) })
  }
  return out
}

/**
 * [INPUT]: core Tool / ctx.toolCallId;waiter 构造注入(不再走 ToolContext)
 * [OUTPUT]: createAskUserTools({ waiter }) —— ask_user(挂起 turn 等用户结构化作答)
 * [POS]: §5.2 环境工具旁支;答案以 tool_result 回灌线程(见 doc/ask-user.md);
 *        同一次可批问多题(QUESTIONS_MAX=4,对齐 Claude);须由 registry 构造注入 waiter,勿套 withGuard 150s
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { Tool, ToolResult } from '../../core/tool.ts'

export const ASK_USER_TOOL = 'ask_user'
export const QUESTIONS_MIN = 1
/** 单次挂起批问上限(对齐 Claude AskUserQuestion 1–4) */
export const QUESTIONS_MAX = 4
export const OPTIONS_MIN = 2
export const OPTIONS_MAX = 6
const HEADER_MAX = 40
const QUESTION_MAX = 200
const LABEL_MAX = 80
const DESC_MAX = 160

export interface AskUserOption {
  label: string
  description?: string
}

export interface AskUserQuestion {
  id: string
  header?: string
  question: string
  options: AskUserOption[]
}

export interface AskUserAnswerEntry {
  selected: string[]
  note?: string
}

export interface AskUserAnswer {
  answers: Record<string, AskUserAnswerEntry>
  skipped?: boolean
}

/** runtime 注入:挂起直到 UI 经 answer_user 解开或 signal abort */
export type AskUserWaiter = (
  toolCallId: string,
  questions: AskUserQuestion[],
  signal?: AbortSignal,
) => Promise<AskUserAnswer>

function bad(msg: string): ToolResult {
  return { llmContent: `error: ${msg}` }
}

function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, Math.max(1, max - 1))}…`
}

/** 规范化模型入参;非法返回错误文案字符串 */
export function normalizeAskUserArgs(raw: unknown): AskUserQuestion[] | string {
  if (!raw || typeof raw !== 'object') return '参数必须是对象'
  const o = raw as { questions?: unknown }
  if (!Array.isArray(o.questions)) return 'questions 必须是数组'
  if (o.questions.length < QUESTIONS_MIN || o.questions.length > QUESTIONS_MAX) {
    return `questions 须为 ${QUESTIONS_MIN}–${QUESTIONS_MAX} 题`
  }
  const out: AskUserQuestion[] = []
  const seen = new Set<string>()
  for (let i = 0; i < o.questions.length; i++) {
    const q = o.questions[i]
    if (!q || typeof q !== 'object') return `questions[${i}] 非法`
    const row = q as {
      id?: unknown
      header?: unknown
      question?: unknown
      options?: unknown
    }
    let id = String(row.id ?? '').trim() || `q${i + 1}`
    if (seen.has(id)) id = `${id}_${i + 1}`
    seen.add(id)
    const question = clip(String(row.question ?? ''), QUESTION_MAX)
    if (!question) return `questions[${i}].question 不能为空`
    const headerRaw = row.header != null ? clip(String(row.header), HEADER_MAX) : ''
    if (!Array.isArray(row.options)) return `questions[${i}].options 必须是数组`
    if (row.options.length < OPTIONS_MIN || row.options.length > OPTIONS_MAX) {
      return `questions[${i}].options 须为 ${OPTIONS_MIN}–${OPTIONS_MAX} 项`
    }
    const options: AskUserOption[] = []
    for (let j = 0; j < row.options.length; j++) {
      const opt = row.options[j]
      if (!opt || typeof opt !== 'object') return `questions[${i}].options[${j}] 非法`
      const orow = opt as { label?: unknown; description?: unknown }
      const label = clip(String(orow.label ?? ''), LABEL_MAX)
      if (!label) return `questions[${i}].options[${j}].label 不能为空`
      const description = orow.description != null
        ? clip(String(orow.description), DESC_MAX)
        : undefined
      options.push(description ? { label, description } : { label })
    }
    out.push({
      id,
      question,
      options,
      ...(headerRaw ? { header: headerRaw } : {}),
    })
  }
  return out
}

/** 把用户作答序列化进线程(模型下一轮必见) */
export function formatAskUserResult(
  answer: AskUserAnswer,
  questions: AskUserQuestion[],
): string {
  if (answer.skipped) return '用户跳过了提问。'
  const lines = ['用户回答:']
  for (const q of questions) {
    const a = answer.answers[q.id]
    if (!a || (!a.selected.length && !a.note?.trim())) {
      lines.push(`- ${q.question} (${q.id}): (未答)`)
      continue
    }
    const sel = a.selected.length ? a.selected.join('；') : '(未选选项)'
    lines.push(`- ${q.question} (${q.id}): ${sel}`)
    if (a.note?.trim()) lines.push(`  备注: ${a.note.trim()}`)
  }
  return lines.join('\n')
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function createAskUserTools(opts: { waiter: AskUserWaiter }): Tool[] {
  const waiter = opts.waiter
  return [
    {
      spec: {
        name: ASK_USER_TOOL,
        description:
          '向用户提出结构化选择题以澄清歧义或关键决策。同一次可问多题(questions 数组至多 4 题;每题 ≥2 选项)。' +
          '多处歧义时请在同一次调用里一并给出,不要为每个问题单独调用。' +
          '调用后暂停当前回合直至用户作答或跳过。仅在不可自行拍板时使用;简单问题自己决定。',
        parameters: {
          type: 'object',
          properties: {
            questions: {
              type: 'array',
              description: '本回合要问的题(可多题;长度 1–4)。多歧义时一次填满,勿拆成多次 ask_user',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: '稳定题 id' },
                  header: { type: 'string', description: '短标题(可选)' },
                  question: { type: 'string', description: '题干' },
                  options: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        label: { type: 'string' },
                        description: { type: 'string' },
                      },
                      required: ['label'],
                    },
                  },
                },
                required: ['question', 'options'],
              },
            },
          },
          required: ['questions'],
        },
      },
      async run(args, ctx, signal): Promise<ToolResult> {
        const normalized = normalizeAskUserArgs(args)
        if (typeof normalized === 'string') return bad(normalized)
        const toolCallId = ctx.toolCallId
        if (!toolCallId) return bad('缺少 toolCallId')
        try {
          const answer = await waiter(toolCallId, normalized, signal)
          return {
            llmContent: formatAskUserResult(answer, normalized),
            data: { questions: normalized, answer },
          }
        } catch (error) {
          if (isAbort(error)) throw error
          return bad(error instanceof Error ? error.message : String(error))
        }
      },
    },
  ]
}

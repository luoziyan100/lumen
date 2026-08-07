/**
 * [INPUT]: TaskEvent 流;ModelPort
 * [OUTPUT]: 从事件抽摘要素材 + 生成/清洗短会话标题(≠ goal)
 * [POS]: runtime 侧栏 title 生成;空 reply 跳过;失败返回 null 不挡主循环
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { ModelPort } from '../core/model-port.ts'
import type { TaskEvent } from '../storage/task-store.ts'

const TITLE_MAX = 16
const TITLE_MIN = 4
const USER_BUDGET = 400
const ASSISTANT_BUDGET = 600

export function displayTaskTitle(task: { title?: string | null; goal: string }): string {
  const t = task.title?.trim()
  return t || task.goal
}

/** 首条 user + 首条非空 reply(或非空 model_step 正文) */
export function extractTitleSource(events: TaskEvent[]): { user: string; assistant: string } | null {
  let user = ''
  let assistant = ''
  for (const ev of events) {
    let payload: Record<string, unknown> = {}
    try {
      payload = JSON.parse(ev.payload_json) as Record<string, unknown>
    } catch {
      continue
    }
    if (!user && ev.kind === 'user' && typeof payload.content === 'string') {
      user = payload.content.trim()
    }
    if (!assistant && ev.kind === 'reply' && typeof payload.reply === 'string' && payload.reply.trim()) {
      assistant = payload.reply.trim()
    }
    if (!assistant && ev.kind === 'model_step' && typeof payload.content === 'string' && payload.content.trim()) {
      assistant = payload.content.trim()
    }
    if (user && assistant) break
  }
  if (!user || !assistant) return null
  return {
    user: user.slice(0, USER_BUDGET),
    assistant: assistant.slice(0, ASSISTANT_BUDGET),
  }
}

/** 清洗模型输出为侧栏短名;不合格返回 null */
export function sanitizeGeneratedTitle(raw: string, goal: string): string | null {
  let t = raw.trim()
  t = t.replace(/^["「『]|["」』]$/g, '').trim()
  t = t.split(/[\n\r]/)[0]?.trim() ?? ''
  t = t.replace(/[。.!！?？；;]+$/g, '').trim()
  if (t.length < TITLE_MIN) return null
  if (t.length > TITLE_MAX) t = t.slice(0, TITLE_MAX)
  // 几乎整句复读 goal → 拒绝
  if (goal.trim().startsWith(t) && goal.trim().length > TITLE_MAX + 4) {
    /* 短标题是长 goal 前缀时仍可用 */
  }
  const fluff = /^(请问|帮我|你帮|我想|有一个问题)/
  if (fluff.test(t)) return null
  return t
}

export async function generateTaskTitle(
  model: ModelPort,
  source: { user: string; assistant: string },
  goal: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const prompt =
    '根据对话为侧栏起一个短标题。规则:只用中文名词短语;8到16个字;不要标点、引号、口语套话(请问/帮我);不要复述整句用户原话。只输出标题本身。\n\n' +
    `用户:\n${source.user}\n\n助手:\n${source.assistant}`
  try {
    const res = await model.chat(
      [{ role: 'user', content: prompt }],
      [],
      signal,
    )
    const raw = typeof res.message.content === 'string' ? res.message.content : ''
    return sanitizeGeneratedTitle(raw, goal)
  } catch {
    return null
  }
}

/** list 懒补:尚无 title,且 goal 偏长(短句本身可当标题) */
export function shouldBackfillTitle(task: { title?: string | null; goal: string }): boolean {
  if (task.title != null && String(task.title).trim() !== '') return false
  return task.goal.trim().length >= 16
}

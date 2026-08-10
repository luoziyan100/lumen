/**
 * [INPUT]: TaskEvent 流 + subagent_id
 * [OUTPUT]: rebuildChildThread —— 子 session 续跑线程
 * [POS]: subagent T6；只回放 payload.subagent_id 匹配的步进
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { Thread } from '../core/thread.ts'
import type { Message, ToolCall } from '../core/types.ts'
import type { TaskEvent } from '../storage/task-store.ts'
import { INTERRUPTED_TOOL_RESULT } from '../storage/resume.ts'

function repairDangling(messages: Message[]): Message[] {
  const repaired: Message[] = []
  let pending: ToolCall[] = []
  const flush = (): void => {
    for (const call of pending) {
      repaired.push({ role: 'tool_result', toolCallId: call.id, content: INTERRUPTED_TOOL_RESULT })
    }
    pending = []
  }
  for (const message of messages) {
    if (message.role === 'tool_result') {
      pending = pending.filter((c) => c.id !== message.toolCallId)
      repaired.push(message)
      continue
    }
    flush()
    repaired.push(message)
    if (message.role === 'assistant') pending = [...(message.toolCalls ?? [])]
  }
  flush()
  return repaired
}

export interface RebuildChildOptions {
  systemPrompt: string
  subagentId: string
  /** 首轮任务正文（事件里通常没有独立 user）；续跑时作为历史锚点 */
  originalPrompt?: string | null
  /** 本次 resume 追加的用户话 */
  resumePrompt: string
  /** 源 completion_summary，作上下文备份 */
  priorSummary?: string | null
}

/**
 * 从 parent task 事件流重建 child 线程，再 append resume 用户消息。
 */
export function rebuildChildThread(events: TaskEvent[], opts: RebuildChildOptions): Thread {
  const body: Message[] = [{ role: 'system', content: opts.systemPrompt }]

  if (opts.originalPrompt?.trim()) {
    body.push({ role: 'user', content: opts.originalPrompt.trim() })
  } else if (opts.priorSummary?.trim()) {
    body.push({
      role: 'user',
      content: `(prior session summary)\n${opts.priorSummary.trim()}`,
    })
  }

  const ordered = [...events].sort((a, b) => a.seq - b.seq)
  for (const event of ordered) {
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(event.payload_json) as Record<string, unknown>
    } catch {
      continue
    }
    if (payload.subagent_id !== opts.subagentId) continue

    if (event.kind === 'model_step') {
      const content = typeof payload.content === 'string' ? payload.content : ''
      const toolCalls = Array.isArray(payload.toolCalls)
        ? (payload.toolCalls as ToolCall[])
        : []
      const msg: Message = {
        role: 'assistant',
        content,
        toolCalls: toolCalls.length ? toolCalls : undefined,
      }
      if (typeof payload.reasoningContent === 'string' && payload.reasoningContent) {
        msg.reasoningContent = payload.reasoningContent
      }
      body.push(msg)
      continue
    }
    if (event.kind === 'tool_result') {
      const id = typeof payload.id === 'string' ? payload.id : ''
      const llm = typeof payload.llmContent === 'string' ? payload.llmContent : ''
      if (!id) continue
      body.push({ role: 'tool_result', toolCallId: id, content: llm })
    }
  }

  const repaired = repairDangling(body)
  repaired.push({
    role: 'user',
    content: opts.resumePrompt.trim() || '(continue)',
  })
  return new Thread(repaired)
}

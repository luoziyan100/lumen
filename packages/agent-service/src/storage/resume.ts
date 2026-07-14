/**
 * [INPUT]: core 的 Thread/Message、task-store 的 TaskEvent
 * [OUTPUT]: rebuildThread —— 从持久化事件重建可续跑的线程
 * [POS]: §存储层。task_events 是 SoT，恢复时用它重放出 [system, user, ...assistant/tool_result]
 *
 * system 在运行时重新生成（不持久化派生物）；user = task.goal；其余从 model_step / tool_result 重放。
 * 两条恢复纪律：
 * 1. 只回放主线程事件（agent_role 为 'main' 或 NULL=老数据）。worker 的内部步骤不属于主线程——
 *    父 agent 当时只看到 spawn 的压缩返回，重建也必须如此，否则隔离被资料性重放打破。
 * 2. 修补悬空 tool_use：中断可能落在"assistant 已落库、部分 tool_result 未落库"的窗口，
 *    给缺配对的调用合成"已中断"结果——铁律的延伸：模型必须看见"动作被打断"这个后果，
 *    而且 provider（Anthropic/OpenAI）要求每个 tool_use 必有配对 tool_result，否则拒绝请求。
 */
import { Thread } from '../core/thread.ts'
import type { ImageData, Message, ToolCall } from '../core/types.ts'
import type { TaskEvent } from './task-store.ts'
import { buildCompactionPreamble, type CompactionPayload } from './context-budget.ts'

export interface RebuildOptions {
  systemPrompt: string
  userText: string
}

export const INTERRUPTED_TOOL_RESULT =
  '(该工具调用在服务中断/取消时未完成，结果不可用。若仍需要这份信息，请重新调用工具。)'

function isMainEvent(event: TaskEvent): boolean {
  return event.agent_role == null || event.agent_role === 'main'
}

/** 给缺配对 tool_result 的 tool_use 合成"已中断"结果，保证线程对 provider 合法 */
function repairDanglingToolCalls(messages: Message[]): Message[] {
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
      pending = pending.filter((call) => call.id !== message.toolCallId)
      repaired.push(message)
      continue
    }
    flush() // 新的一轮开始前，结清上一轮的悬空调用
    repaired.push(message)
    if (message.role === 'assistant') pending = [...(message.toolCalls ?? [])]
  }
  flush()
  return repaired
}

export function rebuildThread(events: TaskEvent[], options: RebuildOptions): Thread {
  const messages: Message[] = [{ role: 'system', content: options.systemPrompt }]

  const ordered = [...events].sort((a, b) => a.seq - b.seq)

  // 确定性压缩检查点(方案 B):有 compaction 事件时,更早的事件换成自包含检查点消息,
  // 其后事件照常重放。事件库只增不减 —— 压缩只发生在"给模型的视图"这一层。
  let replayFromSeq = -1
  for (let i = ordered.length - 1; i >= 0; i--) {
    const e = ordered[i]
    if (e.kind !== 'compaction' || !isMainEvent(e)) continue
    try {
      const p = JSON.parse(e.payload_json) as CompactionPayload
      messages.push({ role: 'user', content: buildCompactionPreamble(p) })
      replayFromSeq = p.cutFromSeq
    } catch { /* 损坏的压缩事件视同不存在 */ }
    break
  }

  let sawUser = false
  for (const event of ordered) {
    if (!isMainEvent(event)) continue
    if (replayFromSeq >= 0 && event.seq < replayFromSeq) continue
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(event.payload_json) as Record<string, unknown>
    } catch {
      continue
    }

    if (event.kind === 'user') {
      const images = Array.isArray(payload.images)
        ? (payload.images as ImageData[]).filter((im) => im && typeof im.base64 === 'string' && typeof im.mediaType === 'string')
        : []
      messages.push({
        role: 'user',
        content: typeof payload.content === 'string' ? payload.content : '',
        ...(images.length ? { images } : {}),
      })
      sawUser = true
    } else if (event.kind === 'model_step') {
      const toolCalls = payload.toolCalls as ToolCall[] | undefined
      messages.push({
        role: 'assistant',
        content: typeof payload.content === 'string' ? payload.content : '',
        ...(toolCalls && toolCalls.length ? { toolCalls } : {}),
      })
    } else if (event.kind === 'tool_result') {
      messages.push({
        role: 'tool_result',
        toolCallId: typeof payload.id === 'string' ? payload.id : undefined,
        content: typeof payload.llmContent === 'string' ? payload.llmContent : '',
      })
    }
  }

  // 兼容无 user 事件的旧 task:用 task.goal 作首句
  if (!sawUser && options.userText) messages.splice(1, 0, { role: 'user', content: options.userText })

  return new Thread(repairDanglingToolCalls(messages))
}

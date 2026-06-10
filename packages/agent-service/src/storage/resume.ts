/**
 * [INPUT]: core 的 Thread/Message、task-store 的 TaskEvent
 * [OUTPUT]: rebuildThread —— 从持久化事件重建可续跑的线程
 * [POS]: §存储层。task_events 是 SoT，恢复时用它重放出 [system, user, ...assistant/tool_result]
 *
 * system 在运行时重新生成（不持久化派生物）；user = task.goal；其余从 model_step / tool_result 重放。
 */
import { Thread } from '../core/thread.ts'
import type { Message, ToolCall } from '../core/types.ts'
import type { TaskEvent } from './task-store.ts'

export interface RebuildOptions {
  systemPrompt: string
  userText: string
}

export function rebuildThread(events: TaskEvent[], options: RebuildOptions): Thread {
  const messages: Message[] = [
    { role: 'system', content: options.systemPrompt },
    { role: 'user', content: options.userText },
  ]

  const ordered = [...events].sort((a, b) => a.seq - b.seq)
  for (const event of ordered) {
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(event.payload_json) as Record<string, unknown>
    } catch {
      continue
    }

    if (event.kind === 'model_step') {
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

  return new Thread(messages)
}

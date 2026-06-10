/**
 * [INPUT]: Thread / ModelPort / Tool / Limits / ToolContext
 * [OUTPUT]: runAgent —— 唯一的 agent 循环
 * [POS]: agent-core 的内核。main 与 worker（spawn 递归）共用同一份实现
 *
 * 铁律：每个 tool_call 的结果必回灌进同一条线程，再连同完整线程喂回模型。
 * 模型每一轮都从 thread.forModel() 取最新线程——所以上一轮的 tool_result 必然被看见。
 */
import type { Thread } from './thread.ts'
import type { ModelPort } from './model-port.ts'
import type { Tool, ToolContext, ToolResult } from './tool.ts'
import type { Limits } from './limits.ts'
import type { AgentEvent, ToolCall } from './types.ts'

export type RunStatus = 'done' | 'aborted' | 'exhausted' | 'error'

export interface RunAgentInput {
  thread: Thread
  model: ModelPort
  tools: Tool[]
  limits: Limits
  ctx: ToolContext
  signal?: AbortSignal
  /** 折叠超长 tool_result 的阈值（传给 thread.forModel） */
  forModelMaxToolResultChars?: number
}

export interface RunAgentResult {
  status: RunStatus
  reply: string
  thread: Thread
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function runAgent(input: RunAgentInput): Promise<RunAgentResult> {
  const { thread, model, tools, limits, ctx, signal } = input
  const toolByName = new Map(tools.map((tool) => [tool.spec.name, tool]))
  const specs = tools.map((tool) => tool.spec)
  const emit = (event: AgentEvent): void | Promise<void> => ctx.emit(event)

  let steps = 0
  while (true) {
    if (signal?.aborted) return { status: 'aborted', reply: '', thread }
    if (steps >= limits.maxSteps) return { status: 'exhausted', reply: '', thread }
    steps += 1

    let response
    try {
      response = await model.chat(
        thread.forModel({ maxToolResultChars: input.forModelMaxToolResultChars }),
        specs,
        signal,
      )
    } catch (error) {
      if (isAbort(error)) return { status: 'aborted', reply: '', thread }
      await emit({ kind: 'error', agentRole: ctx.agentRole, payload: { error: errorMessage(error) } })
      return { status: 'error', reply: errorMessage(error), thread }
    }

    thread.append(response.message) // ← assistant 动作进线程
    await emit({
      kind: 'model_step',
      agentRole: ctx.agentRole,
      payload: { content: response.message.content, toolCalls: response.toolCalls, usage: response.usage },
    })

    const calls: ToolCall[] = response.toolCalls.length
      ? response.toolCalls
      : (response.message.toolCalls ?? [])

    if (calls.length === 0) {
      await emit({ kind: 'reply', agentRole: ctx.agentRole, payload: { reply: response.message.content } })
      return { status: 'done', reply: response.message.content, thread }
    }

    for (const call of calls) {
      if (signal?.aborted) return { status: 'aborted', reply: '', thread }
      await emit({ kind: 'tool_call', agentRole: ctx.agentRole, payload: { id: call.id, name: call.name, args: call.arguments } })

      let result: ToolResult
      const tool = toolByName.get(call.name)
      if (!tool) {
        result = { llmContent: `error: unknown tool "${call.name}"` }
      } else {
        try {
          result = await tool.run(call.arguments, ctx, signal)
        } catch (error) {
          if (isAbort(error)) return { status: 'aborted', reply: '', thread }
          result = { llmContent: `error: ${errorMessage(error)}` } // recovery：错误进线程，循环继续
        }
      }

      thread.append({ role: 'tool_result', toolCallId: call.id, content: result.llmContent }) // ← 铁律
      await emit({ kind: 'tool_result', agentRole: ctx.agentRole, payload: { id: call.id, name: call.name, llmContent: result.llmContent } })
    }
    // 不 return —— 下一轮 model.chat 取到的 thread 就包含了这些 tool_result
  }
}

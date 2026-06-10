/**
 * 测试替身：放在 ModelPort 边界上（正确的缝），而非注入假循环。
 * ScriptedModel 记录每次被调用时收到的 messages —— 这正是验证"tool_result 回灌"的钩子。
 * 这是 old_lumen 测试结构上做不到的事（它把替身注入到了循环内部，绕过了真实内核）。
 */
import type { ModelPort, ModelResponse } from '../../src/core/model-port.ts'
import type { Message, ToolCall } from '../../src/core/types.ts'
import type { Tool, ToolContext } from '../../src/core/tool.ts'

export class ScriptedModel implements ModelPort {
  /** 每次 chat 调用收到的 messages 快照（按调用顺序） */
  readonly calls: Message[][] = []
  private readonly script: ModelResponse[]
  private index = 0

  constructor(script: ModelResponse[]) {
    this.script = script
  }

  async chat(messages: Message[]): Promise<ModelResponse> {
    this.calls.push(messages.map((m) => ({ ...m })))
    const response = this.script[this.index]
    this.index += 1
    if (!response) throw new Error(`ScriptedModel: 第 #${this.index} 次调用没有脚本响应`)
    return response
  }
}

export function assistantToolCall(
  id: string,
  name: string,
  args: Record<string, unknown> = {},
): ModelResponse {
  const toolCalls: ToolCall[] = [{ id, name, arguments: args }]
  return { message: { role: 'assistant', content: '', toolCalls }, toolCalls }
}

export function assistantReply(text: string): ModelResponse {
  return { message: { role: 'assistant', content: text }, toolCalls: [] }
}

/** 返回固定 llmContent 的内存工具 */
export function fixedTool(name: string, llmContent: string): Tool {
  return {
    spec: { name, description: name, parameters: { type: 'object', properties: {} } },
    run: async () => ({ llmContent }),
  }
}

/** 总是抛错的内存工具（测 recovery） */
export function throwingTool(name: string, message: string): Tool {
  return {
    spec: { name, description: name, parameters: { type: 'object', properties: {} } },
    run: async () => {
      throw new Error(message)
    },
  }
}

export function noopCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    taskId: 'test-task',
    agentRole: 'main',
    depth: 0,
    spawn: async () => ({ llmContent: 'no spawn configured' }),
    emit: () => {},
    deps: {},
    ...overrides,
  }
}

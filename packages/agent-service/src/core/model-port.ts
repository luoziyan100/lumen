/**
 * [INPUT]: types.ts 的 Message / ToolCall / ToolSpec / Usage
 * [OUTPUT]: ModelPort —— 内核唯一认识的"模型"接口
 * [POS]: agent-core 与 LLM 之间的端口；真实 adapter（Claude/OpenAI/ReAct）适配成它
 */
import type { Message, ToolCall, ToolSpec, Usage } from './types.ts'

export interface ModelResponse {
  message: Message
  toolCalls: ToolCall[]
  usage?: Usage
}

export interface ModelPort {
  chat(messages: Message[], tools: ToolSpec[], signal?: AbortSignal): Promise<ModelResponse>
}

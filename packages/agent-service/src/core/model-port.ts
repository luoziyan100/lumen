/**
 * [INPUT]: types.ts 的 Message / ToolCall / ToolSpec / Usage
 * [OUTPUT]: ModelPort / ModelResponse / ChatHandlers —— 内核唯一认识的"模型"接口
 * [POS]: agent-core 与 LLM 之间的端口；真实 adapter（Claude/OpenAI）适配成它;
 *        handlers 可选:有则边生成边回调 text/tool 名,无则整包(录制重放零改语义)
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { Message, ToolCall, ToolSpec, Usage } from './types.ts'

export interface ModelResponse {
  message: Message
  toolCalls: ToolCall[]
  usage?: Usage
}

/** 流式回调:适配器 coalesce 后再调,避免 WS 洪水 */
export interface ChatHandlers {
  onTextDelta?: (text: string) => void
  onToolCallStart?: (id: string, name: string) => void
}

export interface ModelPort {
  chat(
    messages: Message[],
    tools: ToolSpec[],
    signal?: AbortSignal,
    handlers?: ChatHandlers,
  ): Promise<ModelResponse>
}

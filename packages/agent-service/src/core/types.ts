/**
 * [OUTPUT]: 内核公共类型——消息 / 工具调用 / 用量 / 工具 schema / 事件
 * [POS]: agent-core 的类型基座；含 ephemeral text_delta / tool_call_start
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

export type Role = 'system' | 'user' | 'assistant' | 'tool_result'

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

/** 多模态图片:粘贴/上传进对话,adapter 负责映射成各 provider 的图片块 */
export interface ImageData {
  mediaType: string // image/png 等
  base64: string
}

export interface Message {
  role: Role
  content: string
  toolCalls?: ToolCall[] // 仅 assistant 轮
  toolCallId?: string // 仅 tool_result 轮
  images?: ImageData[] // 仅 user 轮
}

export interface Usage {
  promptTokens?: number
  completionTokens?: number
  costUsd?: number
}

export interface ToolSpec {
  name: string
  description: string
  parameters: Record<string, unknown> // JSON schema
}

export type AgentEventKind =
  | 'text_delta' // ephemeral:正文增量,不入库
  | 'tool_call_start' // ephemeral:工具名尽早露出,不入库
  | 'model_step'
  | 'tool_call'
  | 'tool_result'
  | 'spawn'
  | 'reply'
  | 'error'

export interface AgentEvent {
  kind: AgentEventKind
  agentRole: string
  payload: unknown
}

/**
 * [INPUT]: core 的 Message / ToolSpec / ModelPort / ModelResponse
 * [OUTPUT]: buildClaudeRequest / parseClaudeResponse / createFetchTransport / createClaudeAdapter
 * [POS]: ModelPort 的 Anthropic 实现。解析逻辑搬自 old_lumen 并核实；网络层换成 Node fetch + 可注入 transport
 *
 * 拆分原则：请求构造与响应解析是纯函数，网络是可注入的 transport。
 * 这样录制-重放能复用真实的构造 + 解析路径，只把网络字节换成录制内容（见 record-replay.ts）。
 */
import type { ModelPort, ModelResponse } from '../core/model-port.ts'
import type { Message, ToolCall, ToolSpec } from '../core/types.ts'
import { postJsonWithRetry, type RetryOptions } from './retry.ts'

// ---- Anthropic Messages API 线格式 ----
type ClaudeRole = 'user' | 'assistant'
type ClaudeTextBlock = { type: 'text'; text: string }
type ClaudeToolUseBlock = { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
type ClaudeToolResultBlock = { type: 'tool_result'; tool_use_id: string; content: string }
type ClaudeContentBlock = ClaudeTextBlock | ClaudeToolUseBlock | ClaudeToolResultBlock
type ClaudeMessage = { role: ClaudeRole; content: string | ClaudeContentBlock[] }

export interface ClaudeTool {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface ClaudeRequest {
  model: string
  max_tokens: number
  system?: string
  tools: ClaudeTool[]
  messages: ClaudeMessage[]
}

export interface ClaudeResponseBody {
  model?: string
  usage?: { input_tokens?: number; output_tokens?: number }
  content?: Array<{ type?: string; text?: string; id?: string; name?: string; input?: unknown }>
}

/** transport 只负责"发请求收原始 body"，是唯一可被替换的网络缝 */
export type ClaudeTransport = (request: ClaudeRequest, signal?: AbortSignal) => Promise<ClaudeResponseBody>

function objectFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function appendToolResult(messages: ClaudeMessage[], block: ClaudeToolResultBlock): void {
  const last = messages[messages.length - 1]
  if (last?.role === 'user' && Array.isArray(last.content) && last.content.every((item) => item.type === 'tool_result')) {
    last.content.push(block)
    return
  }
  messages.push({ role: 'user', content: [block] })
}

function contentForMessage(message: Message): string | ClaudeContentBlock[] {
  if (!message.toolCalls?.length) return message.content
  const blocks: ClaudeContentBlock[] = []
  if (message.content.trim()) blocks.push({ type: 'text', text: message.content })
  for (const toolCall of message.toolCalls) {
    blocks.push({ type: 'tool_use', id: toolCall.id, name: toolCall.name, input: toolCall.arguments })
  }
  return blocks.length ? blocks : message.content
}

export function buildClaudeRequest(
  messages: Message[],
  tools: ToolSpec[],
  model: string,
  maxTokens = 4096,
): ClaudeRequest {
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join('\n\n')

  const claudeMessages: ClaudeMessage[] = []
  for (const message of messages) {
    if (message.role === 'system') continue
    if (message.role === 'tool_result') {
      appendToolResult(claudeMessages, { type: 'tool_result', tool_use_id: message.toolCallId ?? '', content: message.content })
      continue
    }
    claudeMessages.push({ role: message.role, content: contentForMessage(message) })
  }

  return {
    model,
    max_tokens: maxTokens,
    system: system || undefined,
    tools: tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.parameters })),
    messages: claudeMessages,
  }
}

export function parseClaudeResponse(body: ClaudeResponseBody): ModelResponse {
  const textBlocks: string[] = []
  const toolCalls: ToolCall[] = []

  for (const block of body.content ?? []) {
    if (block.type === 'text' && typeof block.text === 'string') textBlocks.push(block.text)
    if (block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string') {
      toolCalls.push({ id: block.id, name: block.name, arguments: objectFromUnknown(block.input) })
    }
  }

  const text = textBlocks.join('\n').trim()
  const response: ModelResponse = {
    message: { role: 'assistant', content: text, ...(toolCalls.length ? { toolCalls } : {}) },
    toolCalls,
  }
  if (body.usage) {
    response.usage = {
      promptTokens: body.usage.input_tokens ?? 0,
      completionTokens: body.usage.output_tokens ?? 0,
    }
  }
  return response
}

export interface FetchTransportOptions {
  apiKey: string
  baseUrl?: string
  version?: string
  retry?: RetryOptions
}

/** 生产用：直连 Anthropic（Node 侧无需浏览器的 dangerous-direct-browser-access header）。瞬时错误自动退避重试 */
export function createFetchTransport(options: FetchTransportOptions): ClaudeTransport {
  const baseUrl = options.baseUrl ?? 'https://api.anthropic.com'
  return async (request, signal) =>
    (await postJsonWithRetry(
      `${baseUrl}/v1/messages`,
      {
        'content-type': 'application/json',
        'x-api-key': options.apiKey,
        'anthropic-version': options.version ?? '2023-06-01',
      },
      request,
      'Claude request',
      options.retry,
      signal,
    )) as ClaudeResponseBody
}

export interface ClaudeAdapterOptions {
  transport: ClaudeTransport
  model?: string
  maxTokens?: number
}

export function createClaudeAdapter(options: ClaudeAdapterOptions): ModelPort {
  const model = options.model ?? 'claude-sonnet-4-6'
  const maxTokens = options.maxTokens ?? 4096
  return {
    async chat(messages: Message[], tools: ToolSpec[], signal?: AbortSignal): Promise<ModelResponse> {
      const request = buildClaudeRequest(messages, tools, model, maxTokens)
      const body = await options.transport(request, signal)
      return parseClaudeResponse(body)
    },
  }
}

/**
 * [INPUT]: core 的 Message / ToolSpec / ModelPort / ModelResponse
 * [OUTPUT]: buildOpenAIRequest / parseOpenAIResponse / createOpenAIFetchTransport / createOpenAIAdapter + 录制重放
 * [POS]: ModelPort 的 OpenAI-Chat-Completions 实现（兼容第三方代理）
 *
 * 同 claude.ts：请求构造与响应解析是纯函数，网络是可注入 transport，录制-重放走真实解析路径。
 */
import type { ModelPort, ModelResponse } from '../core/model-port.ts'
import type { Message, ToolCall, ToolSpec } from '../core/types.ts'
import { postJsonWithRetry, type RetryOptions } from './retry.ts'

type OAToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }
type OAContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
type OAMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null | OAContentPart[]
  tool_calls?: OAToolCall[]
  tool_call_id?: string
}
export interface OpenAITool {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}
export interface OpenAIRequest {
  model: string
  max_tokens?: number
  messages: OAMessage[]
  tools?: OpenAITool[]
  tool_choice?: 'auto'
}
export interface OpenAIResponseBody {
  model?: string
  choices?: Array<{ message?: { content?: string | null; tool_calls?: OAToolCall[] }; finish_reason?: string }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

export type OpenAITransport = (request: OpenAIRequest, signal?: AbortSignal) => Promise<OpenAIResponseBody>

function asObject(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** 扫出所有顶层平衡的 {...} 子串（正确处理字符串内的括号与转义） */
function extractObjects(raw: string): string[] {
  const objects: string[] = []
  let depth = 0
  let start = -1
  let inStr = false
  let esc = false
  for (let i = 0; i < raw.length; i += 1) {
    const c = raw[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') {
      if (depth === 0) start = i
      depth += 1
    } else if (c === '}') {
      depth -= 1
      if (depth === 0 && start >= 0) {
        objects.push(raw.slice(start, i + 1))
        start = -1
      }
    }
  }
  return objects
}

/**
 * 容忍真实代理的畸形 arguments：
 * 有的"Claude 转 OpenAI"代理会发 "{}{\"path\":...}"（真 JSON 前多个空 {}）。
 * 先直接 parse；失败则取第一个非空的平衡对象。
 */
function safeParseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {}
  const direct = asObject(raw)
  if (direct) return direct
  for (const candidate of extractObjects(raw)) {
    const parsed = asObject(candidate)
    if (parsed && Object.keys(parsed).length) return parsed
  }
  return {}
}

export function buildOpenAIRequest(messages: Message[], tools: ToolSpec[], model: string, maxTokens = 4096): OpenAIRequest {
  const oaMessages: OAMessage[] = messages.map((message): OAMessage => {
    if (message.role === 'tool_result') {
      return { role: 'tool', tool_call_id: message.toolCallId ?? '', content: message.content }
    }
    if (message.role === 'assistant' && message.toolCalls?.length) {
      return {
        role: 'assistant',
        content: message.content ? message.content : null,
        tool_calls: message.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments ?? {}) },
        })),
      }
    }
    if (message.images?.length) {
      // 带图消息:OpenAI 多模态 content parts(data URI)
      const parts: OAContentPart[] = message.images.map((img) => ({
        type: 'image_url',
        image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
      }))
      if (message.content.trim()) parts.push({ type: 'text', text: message.content })
      return { role: message.role, content: parts }
    }
    return { role: message.role, content: message.content }
  })

  const request: OpenAIRequest = { model, max_tokens: maxTokens, messages: oaMessages }
  if (tools.length) {
    request.tools = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }))
    request.tool_choice = 'auto'
  }
  return request
}

export function parseOpenAIResponse(body: OpenAIResponseBody): ModelResponse {
  const message = body.choices?.[0]?.message
  const toolCalls: ToolCall[] = (message?.tool_calls ?? []).map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: safeParseArgs(tc.function.arguments),
  }))
  const content = message?.content ?? ''
  const response: ModelResponse = {
    message: { role: 'assistant', content, ...(toolCalls.length ? { toolCalls } : {}) },
    toolCalls,
  }
  if (body.usage) {
    response.usage = { promptTokens: body.usage.prompt_tokens ?? 0, completionTokens: body.usage.completion_tokens ?? 0 }
  }
  return response
}

export interface OpenAIFetchTransportOptions {
  apiKey: string
  baseUrl: string // OpenAI-compatible base URL
  path?: string // 默认 /v1/chat/completions
  retry?: RetryOptions
}

export function createOpenAIFetchTransport(options: OpenAIFetchTransportOptions): OpenAITransport {
  const url = `${options.baseUrl.replace(/\/$/, '')}${options.path ?? '/v1/chat/completions'}`
  return async (request, signal) =>
    (await postJsonWithRetry(
      url,
      { 'content-type': 'application/json', authorization: `Bearer ${options.apiKey}` },
      request,
      'OpenAI request',
      options.retry,
      signal,
    )) as OpenAIResponseBody
}

export interface OpenAIAdapterOptions {
  transport: OpenAITransport
  model?: string
  maxTokens?: number
}

export function createOpenAIAdapter(options: OpenAIAdapterOptions): ModelPort {
  const model = options.model ?? 'claude-sonnet-4-6'
  const maxTokens = options.maxTokens ?? 4096
  return {
    async chat(messages: Message[], tools: ToolSpec[], signal?: AbortSignal): Promise<ModelResponse> {
      const request = buildOpenAIRequest(messages, tools, model, maxTokens)
      const body = await options.transport(request, signal)
      return parseOpenAIResponse(body)
    },
  }
}

// ---- 录制 / 重放（走真实 build/parse，只换网络字节）----
export interface OpenAIReplay {
  transport: OpenAITransport
  requests: OpenAIRequest[]
}

export function createOpenAIReplayTransport(bodies: OpenAIResponseBody[]): OpenAIReplay {
  const requests: OpenAIRequest[] = []
  let i = 0
  const transport: OpenAITransport = async (request) => {
    requests.push(request)
    const body = bodies[i]
    i += 1
    if (!body) throw new Error(`replay: 第 #${i} 次调用无录制 body`)
    return body
  }
  return { transport, requests }
}

export function createOpenAIRecordingTransport(inner: OpenAITransport, sink: OpenAIResponseBody[]): OpenAITransport {
  return async (request, signal) => {
    const body = await inner(request, signal)
    sink.push(body)
    return body
  }
}

/**
 * [INPUT]: core 的 Message / ToolSpec / ModelPort / ModelResponse / ChatHandlers
 * [OUTPUT]: buildOpenAIRequest / parseOpenAIResponse / resolveOpenAIMaxTokens /
 *           createOpenAIFetchTransport / createOpenAIStreamFetchTransport / createOpenAIAdapter + 录制重放
 * [POS]: ModelPort 的 OpenAI-Chat-Completions 实现（兼容第三方代理）
 *
 * 同 claude.ts：请求构造与响应解析是纯函数，网络是可注入 transport，录制-重放走真实解析路径。
 * 有 ChatHandlers 时走 SSE(streamTransport);无则整包(重放零改语义)。
 * DeepSeek V4 默认开启 thinking：推理与正文共享 max_tokens；额度被隐式推理烧光时
 * HTTP 200 + content="" + finish_reason=length——适配器必须抬高额度、关掉 agent 环上的思考，并把空回复变成可观测错误。
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { ChatHandlers, ModelPort, ModelResponse } from '../core/model-port.ts'
import type { Message, ToolCall, ToolSpec } from '../core/types.ts'
import { postJsonWithRetry, type RetryOptions } from './retry.ts'
import { createTextDeltaCoalescer } from './stream-coalesce.ts'
import {
  applyOpenAISseData,
  consumeSseDataStream,
  createOpenAIStreamAccum,
  finalizeOpenAIStreamAccum,
} from './openai-sse.ts'

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
  /** DeepSeek V4:启用/关闭思考模式(默认 provider 侧为 enabled) */
  thinking?: { type: 'enabled' | 'disabled' }
}
export interface OpenAIResponseBody {
  model?: string
  choices?: Array<{
    message?: {
      content?: string | null
      reasoning_content?: string | null
      tool_calls?: OAToolCall[]
    }
    finish_reason?: string
  }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

/** DeepSeek 系(含 V3/V4):API 不接受 content part 的 image_url */
export function isDeepSeekModel(model: string): boolean {
  return /deepseek/i.test(model)
}

/** DeepSeek V4 系列:思考与正文抢同一份 completion 预算 */
export function isDeepSeekV4(model: string): boolean {
  return /deepseek-v4/i.test(model)
}

/** V4 思考模式下 4096 极易烧光;抬到 16k 给正文留余地(调用方更大值则保留) */
export function resolveOpenAIMaxTokens(model: string, requested = 4096): number {
  if (isDeepSeekV4(model)) return Math.max(requested, 16_384)
  return requested
}

export type OpenAITransport = (request: OpenAIRequest, signal?: AbortSignal) => Promise<OpenAIResponseBody>

/** 流式 transport:边收边调 handlers(已 coalesce),返回与整包同构的 body */
export type OpenAIStreamTransport = (
  request: OpenAIRequest,
  signal: AbortSignal | undefined,
  handlers: ChatHandlers | undefined,
) => Promise<OpenAIResponseBody>

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
      // DeepSeek 最后防线:绝不发 image_url(正常应由 runtime withImageSanitize 先去图插桩)
      if (isDeepSeekModel(model)) {
        const text = message.content.includes('[[image:')
          ? message.content
          : [
              ...message.images.map((_, i) =>
                `[[image:img-${i + 1}]] 用户输入了一张图片。你看不到像素；请调用工具 look_at_image(image_id="img-${i + 1}") 识图后再回答。`),
              message.content.trim(),
            ].filter(Boolean).join('\n\n')
        return { role: message.role, content: text }
      }
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
  // Agent 环要工具调用 + 可见正文;V4 默认 thinking 会把额度先花在 reasoning_content 上
  if (isDeepSeekV4(model)) request.thinking = { type: 'disabled' }
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

/** 生产流式:stream:true + SSE;瞬时失败不重试首包后字节(避免重复 delta) */
export function createOpenAIStreamFetchTransport(options: OpenAIFetchTransportOptions): OpenAIStreamTransport {
  const url = `${options.baseUrl.replace(/\/$/, '')}${options.path ?? '/v1/chat/completions'}`
  const doFetch = options.retry?.fetchImpl ?? fetch
  const timeoutMs = options.retry?.timeoutMs ?? 600_000
  return async (request, signal, handlers) => {
    if (signal?.aborted) throw new DOMException('This operation was aborted', 'AbortError')
    const attemptSignal = AbortSignal.any([
      ...(signal ? [signal] : []),
      AbortSignal.timeout(timeoutMs),
    ])
    const response = await doFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${options.apiKey}` },
      body: JSON.stringify({ ...request, stream: true }),
      signal: attemptSignal,
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`OpenAI stream failed (${response.status}): ${text}`)
    }
    if (!response.body) throw new Error('OpenAI stream: empty body')

    const accum = createOpenAIStreamAccum()
    const coalesce = createTextDeltaCoalescer(handlers)
    const streamHandlers: ChatHandlers = {
      onTextDelta: coalesce.push,
      onToolCallStart: handlers?.onToolCallStart,
    }
    await consumeSseDataStream(
      response.body,
      (data) => applyOpenAISseData(accum, data, streamHandlers),
      attemptSignal,
    )
    coalesce.flush()
    return finalizeOpenAIStreamAccum(accum)
  }
}

export interface OpenAIAdapterOptions {
  transport: OpenAITransport
  /** 有 handlers 时优先;缺省则 handlers 被忽略、走整包 */
  streamTransport?: OpenAIStreamTransport
  model?: string
  maxTokens?: number
}

function assertNonEmptyOpenAI(parsed: ModelResponse, body: OpenAIResponseBody): void {
  const content = (parsed.message.content ?? '').trim()
  const finish = body.choices?.[0]?.finish_reason
  if (!content && parsed.toolCalls.length === 0) {
    const hint = finish === 'length'
      ? '模型把输出额度花在了隐式思考上，没有留下正文（finish_reason=length）。请重试；若仍空，在设置里换模型。'
      : '模型返回了空回复（无正文、无工具调用）。请重试或在设置里换模型。'
    throw new Error(hint)
  }
}

export function createOpenAIAdapter(options: OpenAIAdapterOptions): ModelPort {
  const model = options.model ?? 'claude-sonnet-4-6'
  const maxTokens = resolveOpenAIMaxTokens(model, options.maxTokens ?? 4096)
  return {
    async chat(
      messages: Message[],
      tools: ToolSpec[],
      signal?: AbortSignal,
      handlers?: ChatHandlers,
    ): Promise<ModelResponse> {
      const request = buildOpenAIRequest(messages, tools, model, maxTokens)
      const body =
        handlers && options.streamTransport
          ? await options.streamTransport(request, signal, handlers)
          : await options.transport(request, signal)
      const parsed = parseOpenAIResponse(body)
      assertNonEmptyOpenAI(parsed, body)
      return parsed
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

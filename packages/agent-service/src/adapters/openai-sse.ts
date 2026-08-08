/**
 * [INPUT]: OpenAI Chat Completions SSE data 行(JSON)
 * [OUTPUT]: OpenAIStreamAccum / applyOpenAISseData / finalizeOpenAIStreamAccum —— 纯函数拼装
 * [POS]: openai 流式路径的可测核;拼 content + reasoning_content + tool_calls;不碰网络
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { ChatHandlers } from '../core/model-port.ts'
import type { OpenAIResponseBody } from './openai.ts'

export interface OpenAIStreamAccum {
  content: string
  /** DeepSeek thinking CoT 增量 */
  reasoning: string
  /** index → 增量拼装中的 tool_call */
  tools: Map<number, { id: string; name: string; arguments: string }>
  /** 已对 handlers 打过 onToolCallStart 的 index */
  started: Set<number>
  finish_reason?: string
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

export function createOpenAIStreamAccum(): OpenAIStreamAccum {
  return { content: '', reasoning: '', tools: new Map(), started: new Set() }
}

type StreamChoiceDelta = {
  content?: string | null
  reasoning_content?: string | null
  tool_calls?: Array<{
    index?: number
    id?: string
    type?: string
    function?: { name?: string; arguments?: string }
  }>
}

/** 处理单条 `data:` 载荷(已去掉前缀);`[DONE]` 忽略 */
export function applyOpenAISseData(
  accum: OpenAIStreamAccum,
  data: string,
  handlers?: ChatHandlers,
): void {
  const trimmed = data.trim()
  if (!trimmed || trimmed === '[DONE]') return
  let chunk: {
    choices?: Array<{ delta?: StreamChoiceDelta; finish_reason?: string | null }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  try {
    chunk = JSON.parse(trimmed) as typeof chunk
  } catch {
    return
  }

  if (chunk.usage) accum.usage = chunk.usage
  const choice = chunk.choices?.[0]
  if (!choice) return
  if (choice.finish_reason) accum.finish_reason = choice.finish_reason

  const delta = choice.delta
  if (!delta) return

  if (typeof delta.content === 'string' && delta.content) {
    accum.content += delta.content
    handlers?.onTextDelta?.(delta.content)
  }
  if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
    accum.reasoning += delta.reasoning_content
  }

  for (const tc of delta.tool_calls ?? []) {
    const index = tc.index ?? 0
    let slot = accum.tools.get(index)
    if (!slot) {
      slot = { id: '', name: '', arguments: '' }
      accum.tools.set(index, slot)
    }
    if (tc.id) slot.id = tc.id
    if (tc.function?.name) slot.name = tc.function.name
    if (typeof tc.function?.arguments === 'string') slot.arguments += tc.function.arguments

    if (slot.id && slot.name && !accum.started.has(index)) {
      accum.started.add(index)
      handlers?.onToolCallStart?.(slot.id, slot.name)
    }
  }
}

/** 拼成与非流式 parseOpenAIResponse 同构的 body */
export function finalizeOpenAIStreamAccum(accum: OpenAIStreamAccum): OpenAIResponseBody {
  const tool_calls = [...accum.tools.entries()]
    .sort(([a], [b]) => a - b)
    .filter(([, t]) => t.id && t.name)
    .map(([, t]) => ({
      id: t.id,
      type: 'function' as const,
      function: { name: t.name, arguments: t.arguments || '{}' },
    }))

  return {
    choices: [
      {
        message: {
          content: accum.content,
          ...(accum.reasoning ? { reasoning_content: accum.reasoning } : {}),
          ...(tool_calls.length ? { tool_calls } : {}),
        },
        finish_reason: accum.finish_reason,
      },
    ],
    ...(accum.usage ? { usage: accum.usage } : {}),
  }
}

/**
 * 从 ReadableStream 读 SSE:`data:` 行交给 onData;空行分隔事件。
 * 返回值供调用方在结束后 flush coalesce。
 */
export async function consumeSseDataStream(
  body: ReadableStream<Uint8Array>,
  onData: (data: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('This operation was aborted', 'AbortError')
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // 按行切;保留最后不完整行
      for (;;) {
        const nl = buffer.indexOf('\n')
        if (nl < 0) break
        let line = buffer.slice(0, nl)
        buffer = buffer.slice(nl + 1)
        if (line.endsWith('\r')) line = line.slice(0, -1)
        if (line.startsWith('data:')) onData(line.slice(5).trimStart())
      }
    }
    if (buffer.startsWith('data:')) onData(buffer.slice(5).trimStart())
  } finally {
    reader.releaseLock()
  }
}

/**
 * [INPUT]: Anthropic Messages SSE data 行(JSON,含 type)
 * [OUTPUT]: ClaudeStreamAccum / applyClaudeSseData / finalizeClaudeStreamAccum —— 纯函数拼装
 * [POS]: claude 流式路径的可测核;与 openai-sse 对称
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { ChatHandlers } from '../core/model-port.ts'
import type { ClaudeResponseBody } from './claude.ts'

export interface ClaudeStreamAccum {
  /** index → text 块文本 */
  texts: Map<number, string>
  /** index → tool_use 拼装(input 为 partial JSON 字符串) */
  tools: Map<number, { id: string; name: string; inputJson: string }>
  started: Set<number>
  usage?: { input_tokens?: number; output_tokens?: number }
}

export function createClaudeStreamAccum(): ClaudeStreamAccum {
  return { texts: new Map(), tools: new Map(), started: new Set() }
}

type SseEvent = {
  type?: string
  index?: number
  content_block?: { type?: string; text?: string; id?: string; name?: string; input?: unknown }
  delta?: { type?: string; text?: string; partial_json?: string }
  usage?: { input_tokens?: number; output_tokens?: number }
  message?: { usage?: { input_tokens?: number; output_tokens?: number } }
}

export function applyClaudeSseData(
  accum: ClaudeStreamAccum,
  data: string,
  handlers?: ChatHandlers,
): void {
  const trimmed = data.trim()
  if (!trimmed) return
  let ev: SseEvent
  try {
    ev = JSON.parse(trimmed) as SseEvent
  } catch {
    return
  }

  switch (ev.type) {
    case 'message_start': {
      if (ev.message?.usage) accum.usage = { ...accum.usage, ...ev.message.usage }
      break
    }
    case 'content_block_start': {
      const index = ev.index ?? 0
      const block = ev.content_block
      if (!block) break
      if (block.type === 'text') {
        accum.texts.set(index, typeof block.text === 'string' ? block.text : '')
      } else if (block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string') {
        accum.tools.set(index, { id: block.id, name: block.name, inputJson: '' })
        if (!accum.started.has(index)) {
          accum.started.add(index)
          handlers?.onToolCallStart?.(block.id, block.name)
        }
      }
      break
    }
    case 'content_block_delta': {
      const index = ev.index ?? 0
      const delta = ev.delta
      if (!delta) break
      if (delta.type === 'text_delta' && typeof delta.text === 'string' && delta.text) {
        accum.texts.set(index, (accum.texts.get(index) ?? '') + delta.text)
        handlers?.onTextDelta?.(delta.text)
      } else if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
        const slot = accum.tools.get(index)
        if (slot) slot.inputJson += delta.partial_json
      }
      break
    }
    case 'message_delta': {
      if (ev.usage) accum.usage = { ...accum.usage, ...ev.usage }
      break
    }
    default:
      break
  }
}

export function finalizeClaudeStreamAccum(accum: ClaudeStreamAccum): ClaudeResponseBody {
  const content: Array<{ type?: string; text?: string; id?: string; name?: string; input?: unknown }> = []

  const indexes = new Set([...accum.texts.keys(), ...accum.tools.keys()])
  for (const index of [...indexes].sort((a, b) => a - b)) {
    if (accum.texts.has(index)) {
      content.push({ type: 'text', text: accum.texts.get(index) })
    }
    const tool = accum.tools.get(index)
    if (tool) {
      let input: unknown = {}
      if (tool.inputJson.trim()) {
        try {
          input = JSON.parse(tool.inputJson)
        } catch {
          input = {}
        }
      }
      content.push({ type: 'tool_use', id: tool.id, name: tool.name, input })
    }
  }

  return {
    content,
    ...(accum.usage ? { usage: accum.usage } : {}),
  }
}

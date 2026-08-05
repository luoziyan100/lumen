/**
 * [INPUT]: claude-sse 纯函数 + parseClaudeResponse
 * [OUTPUT]: Anthropic SSE 片段 → 文本/tool_use 拼装不变式
 * [POS]: adapters 流式验收;不碰真网
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyClaudeSseData,
  createClaudeStreamAccum,
  finalizeClaudeStreamAccum,
} from '../../src/adapters/claude-sse.ts'
import { parseClaudeResponse } from '../../src/adapters/claude.ts'

test('Claude SSE:text_delta 拼正文', () => {
  const accum = createClaudeStreamAccum()
  const deltas: string[] = []
  const handlers = { onTextDelta: (t: string) => deltas.push(t) }

  applyClaudeSseData(
    accum,
    JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
    handlers,
  )
  applyClaudeSseData(
    accum,
    JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hi' } }),
    handlers,
  )
  applyClaudeSseData(
    accum,
    JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '!' } }),
    handlers,
  )

  assert.deepEqual(deltas, ['Hi', '!'])
  const parsed = parseClaudeResponse(finalizeClaudeStreamAccum(accum))
  assert.equal(parsed.message.content, 'Hi!')
})

test('Claude SSE:tool_use 块启动即 onToolCallStart,input_json 拼 arguments', () => {
  const accum = createClaudeStreamAccum()
  const starts: string[] = []
  const handlers = { onToolCallStart: (id: string, name: string) => starts.push(`${id}:${name}`) }

  applyClaudeSseData(
    accum,
    JSON.stringify({
      type: 'content_block_start',
      index: 1,
      content_block: { type: 'tool_use', id: 'tu1', name: 'web_search', input: {} },
    }),
    handlers,
  )
  applyClaudeSseData(
    accum,
    JSON.stringify({
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'input_json_delta', partial_json: '{"query":' },
    }),
    handlers,
  )
  applyClaudeSseData(
    accum,
    JSON.stringify({
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'input_json_delta', partial_json: '"ai"}' },
    }),
    handlers,
  )

  assert.deepEqual(starts, ['tu1:web_search'])
  const parsed = parseClaudeResponse(finalizeClaudeStreamAccum(accum))
  assert.equal(parsed.toolCalls[0]?.name, 'web_search')
  assert.deepEqual(parsed.toolCalls[0]?.arguments, { query: 'ai' })
})

/**
 * [INPUT]: openai-sse 纯函数 + parseOpenAIResponse
 * [OUTPUT]: SSE 片段 → 文本/tool_call 拼装不变式
 * [POS]: adapters 流式验收;不碰真网
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyOpenAISseData,
  createOpenAIStreamAccum,
  finalizeOpenAIStreamAccum,
} from '../../src/adapters/openai-sse.ts'
import { parseOpenAIResponse } from '../../src/adapters/openai.ts'

test('OpenAI SSE:文本 delta 拼成完整 content', () => {
  const accum = createOpenAIStreamAccum()
  const deltas: string[] = []
  const handlers = { onTextDelta: (t: string) => deltas.push(t) }

  for (const data of [
    '{"choices":[{"delta":{"content":"你"}}]}',
    '{"choices":[{"delta":{"content":"好"}}]}',
    '{"choices":[{"delta":{},"finish_reason":"stop"}]}',
    '[DONE]',
  ]) {
    applyOpenAISseData(accum, data, handlers)
  }

  assert.deepEqual(deltas, ['你', '好'])
  const body = finalizeOpenAIStreamAccum(accum)
  const parsed = parseOpenAIResponse(body)
  assert.equal(parsed.message.content, '你好')
  assert.equal(parsed.toolCalls.length, 0)
})

test('OpenAI SSE:tool_calls 增量拼装 + onToolCallStart 仅一次', () => {
  const accum = createOpenAIStreamAccum()
  const starts: Array<{ id: string; name: string }> = []
  const handlers = {
    onToolCallStart: (id: string, name: string) => starts.push({ id, name }),
  }

  applyOpenAISseData(
    accum,
    JSON.stringify({
      choices: [{
        delta: {
          tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'search', arguments: '' } }],
        },
      }],
    }),
    handlers,
  )
  applyOpenAISseData(
    accum,
    JSON.stringify({
      choices: [{
        delta: { tool_calls: [{ index: 0, function: { arguments: '{"q":"x"}' } }] },
      }],
    }),
    handlers,
  )
  applyOpenAISseData(accum, '{"choices":[{"delta":{},"finish_reason":"tool_calls"}]}', handlers)

  assert.deepEqual(starts, [{ id: 'call_1', name: 'search' }])
  const parsed = parseOpenAIResponse(finalizeOpenAIStreamAccum(accum))
  assert.equal(parsed.toolCalls.length, 1)
  assert.equal(parsed.toolCalls[0]?.name, 'search')
  assert.deepEqual(parsed.toolCalls[0]?.arguments, { q: 'x' })
})

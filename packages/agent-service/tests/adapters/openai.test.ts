import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildOpenAIRequest,
  createOpenAIAdapter,
  parseOpenAIResponse,
  resolveOpenAIMaxTokens,
  type OpenAIResponseBody,
} from '../../src/adapters/openai.ts'

test('buildOpenAIRequest：tool_result→tool 角色，assistant.toolCalls→tool_calls', () => {
  const req = buildOpenAIRequest(
    [
      { role: 'system', content: 'sys' },
      { role: 'user', content: '今天有什么' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'search', arguments: { q: 'x' } }] },
      { role: 'tool_result', toolCallId: 'c1', content: 'RES' },
    ],
    [{ name: 'search', description: 'd', parameters: { type: 'object', properties: {} } }],
    'claude-sonnet-4-6',
  )
  assert.equal(req.messages[0].role, 'system')
  const asst = req.messages[2]
  assert.equal(asst.role, 'assistant')
  assert.equal(asst.tool_calls?.[0].function.name, 'search')
  assert.equal(asst.content, null) // 仅 tool_calls 时 content=null
  const toolMsg = req.messages[3]
  assert.equal(toolMsg.role, 'tool')
  assert.equal(toolMsg.tool_call_id, 'c1')
  assert.equal(req.tools?.[0].type, 'function')
})

test('parseOpenAIResponse：解出 content + tool_calls + usage', () => {
  const body: OpenAIResponseBody = {
    model: 'claude-sonnet-4-6',
    choices: [{ message: { content: '好的', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'write_file', arguments: '{"path":"a.md","content":"x"}' } }] }, finish_reason: 'tool_calls' }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  }
  const parsed = parseOpenAIResponse(body)
  assert.equal(parsed.toolCalls.length, 1)
  assert.deepEqual(parsed.toolCalls[0].arguments, { path: 'a.md', content: 'x' })
  assert.equal(parsed.usage?.promptTokens, 10)
})

test('容忍畸形 arguments：真实代理的 "{}{...}" 前缀（live e2e 实测发现）', () => {
  const body: OpenAIResponseBody = {
    choices: [{
      message: {
        content: '',
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'write_file', arguments: '{}{"path": "notes/line.md", "content": "研究是探索未知世界的钥匙。"}' } }],
      },
    }],
  }
  const parsed = parseOpenAIResponse(body)
  assert.deepEqual(parsed.toolCalls[0].arguments, { path: 'notes/line.md', content: '研究是探索未知世界的钥匙。' })
})

test('arguments 含字符串内括号也能正确平衡解析', () => {
  const body: OpenAIResponseBody = {
    choices: [{ message: { content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'x', arguments: '{}{"q": "a {nested} brace } here"}' } }] } }],
  }
  const parsed = parseOpenAIResponse(body)
  assert.equal(parsed.toolCalls[0].arguments.q, 'a {nested} brace } here')
})

test('DeepSeek V4:max_tokens 抬到 ≥16k,并默认关闭 thinking', () => {
  assert.equal(resolveOpenAIMaxTokens('deepseek-v4-flash', 4096), 16_384)
  assert.equal(resolveOpenAIMaxTokens('deepseek-v4-pro', 32_768), 32_768)
  assert.equal(resolveOpenAIMaxTokens('gpt-4o', 4096), 4096)
  const req = buildOpenAIRequest([{ role: 'user', content: 'hi' }], [], 'deepseek-v4-flash', 16_384)
  assert.deepEqual(req.thinking, { type: 'disabled' })
  assert.equal(req.max_tokens, 16_384)
})

test('DeepSeek V4 空 content+finish length → adapter 抛可观测错误(不静默 done)', async () => {
  const adapter = createOpenAIAdapter({
    model: 'deepseek-v4-flash',
    transport: async () => ({
      choices: [{ message: { content: '', reasoning_content: '思考…' }, finish_reason: 'length' }],
      usage: { prompt_tokens: 100, completion_tokens: 4096 },
    }),
  })
  await assert.rejects(
    () => adapter.chat([{ role: 'user', content: 'hi' }], []),
    /隐式思考|空回复/,
  )
})

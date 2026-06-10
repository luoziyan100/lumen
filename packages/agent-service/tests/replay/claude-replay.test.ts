import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Thread } from '../../src/core/thread.ts'
import { runAgent } from '../../src/core/loop.ts'
import { DEFAULT_LIMITS } from '../../src/core/limits.ts'
import {
  buildClaudeRequest,
  parseClaudeResponse,
  createClaudeAdapter,
  type ClaudeResponseBody,
} from '../../src/adapters/claude.ts'
import { createReplayTransport } from '../../src/adapters/record-replay.ts'
import { fixedTool, noopCtx } from '../helpers/scripted-model.ts'

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/journal-radar.claude.json', import.meta.url), 'utf8'),
) as ClaudeResponseBody[]

test('单元：parseClaudeResponse 正确解出 text + tool_use + usage', () => {
  const parsed = parseClaudeResponse(fixture[0])
  assert.equal(parsed.toolCalls.length, 1)
  assert.equal(parsed.toolCalls[0].name, 'search_papers')
  assert.equal(parsed.toolCalls[0].id, 'toolu_search_1')
  assert.deepEqual(parsed.toolCalls[0].arguments.journals, ['Nature'])
  assert.match(parsed.message.content, /我先检索/)
  assert.equal(parsed.usage?.promptTokens, 320)
})

test('单元：buildClaudeRequest 把 tool_result 映射成 user 里的 tool_result block', () => {
  const request = buildClaudeRequest(
    [
      { role: 'system', content: 'sys' },
      { role: 'user', content: '今天有什么论文' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'toolu_1', name: 'search_papers', arguments: {} }] },
      { role: 'tool_result', toolCallId: 'toolu_1', content: 'RESULT' },
    ],
    [{ name: 'search_papers', description: 'd', parameters: { type: 'object', properties: {} } }],
    'claude-sonnet-4-6',
  )
  assert.equal(request.system, 'sys')
  const toolResultMsg = request.messages.find(
    (m) => m.role === 'user' && Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_result'),
  )
  assert.ok(toolResultMsg, 'tool_result 必须映射进一条 user 消息')
  const block = (toolResultMsg!.content as Array<{ type: string; tool_use_id?: string; content?: string }>).find(
    (b) => b.type === 'tool_result',
  )
  assert.equal(block?.tool_use_id, 'toolu_1')
  assert.equal(block?.content, 'RESULT')
})

test('录制-重放 e2e：真实 adapter 解析 + 真实 runAgent，只把网络换成录制', async () => {
  const replay = createReplayTransport(fixture)
  const adapter = createClaudeAdapter({ transport: replay.transport, model: 'claude-sonnet-4-6' })

  const thread = new Thread([
    { role: 'system', content: '你是 Lumen 研究 agent' },
    { role: 'user', content: '今天有什么有意思的论文' },
  ])

  const result = await runAgent({
    thread,
    model: adapter,
    tools: [fixedTool('search_papers', JSON.stringify({ papers: [{ title: 'A study on X', doi: '10.1000/x' }] }))],
    limits: DEFAULT_LIMITS,
    ctx: noopCtx(),
  })

  // 1) 跑到真实收尾
  assert.equal(result.status, 'done')
  assert.match(result.reply, /Nature 有 1 篇/)
  assert.equal(replay.requests.length, 2, '应当两轮：搜 → 答')

  // 2) 不变式（经真实 buildClaudeRequest 验证）：第 2 轮请求里必须带回工具结果
  const secondRequest = replay.requests[1]
  const toolResultMsg = secondRequest.messages.find(
    (m) => m.role === 'user' && Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_result'),
  )
  assert.ok(toolResultMsg, '第 2 轮发给模型的请求必须包含第 1 轮的 tool_result')
  const block = (toolResultMsg!.content as Array<{ type: string; tool_use_id?: string; content?: string }>).find(
    (b) => b.type === 'tool_result',
  )
  assert.equal(block?.tool_use_id, 'toolu_search_1')
  assert.match(block?.content ?? '', /A study on X/, '回传的必须是工具的真实输出')
})

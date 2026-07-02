import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildClaudeRequest } from '../../src/adapters/claude.ts'
import { buildOpenAIRequest } from '../../src/adapters/openai.ts'
import type { Message } from '../../src/core/types.ts'

const IMG = { mediaType: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUg==' }
const MESSAGES: Message[] = [
  { role: 'system', content: 'sys' },
  { role: 'user', content: '这张图里是什么?', images: [IMG] },
]

test('Claude:带图 user 消息映射成 image + text 块', () => {
  const req = buildClaudeRequest(MESSAGES, [], 'claude-sonnet-4-6')
  const user = req.messages[0]
  assert.ok(Array.isArray(user.content), '带图消息应为 blocks 数组')
  const blocks = user.content as Array<{ type: string; source?: { media_type: string; data: string }; text?: string }>
  const image = blocks.find((b) => b.type === 'image')
  assert.equal(image?.source?.media_type, 'image/png')
  assert.equal(image?.source?.data, IMG.base64)
  assert.ok(blocks.some((b) => b.type === 'text' && b.text === '这张图里是什么?'))
})

test('OpenAI:带图 user 消息映射成 image_url(data URI)+ text parts', () => {
  const req = buildOpenAIRequest(MESSAGES, [], 'glm-5')
  const user = req.messages[1] // system 占位 [0]
  assert.ok(Array.isArray(user.content))
  const parts = user.content as Array<{ type: string; image_url?: { url: string }; text?: string }>
  const image = parts.find((p) => p.type === 'image_url')
  assert.equal(image?.image_url?.url, `data:image/png;base64,${IMG.base64}`)
  assert.ok(parts.some((p) => p.type === 'text' && p.text === '这张图里是什么?'))
})

test('无图消息保持字符串 content(不无谓改变请求形状)', () => {
  const req = buildOpenAIRequest([{ role: 'user', content: '你好' }], [], 'glm-5')
  assert.equal(req.messages[0].content, '你好')
})

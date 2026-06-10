import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Thread } from '../../src/core/thread.ts'

test('append 只增，messages 累积', () => {
  const thread = new Thread([{ role: 'system', content: 's' }])
  thread.append({ role: 'user', content: 'u' })
  thread.append({ role: 'assistant', content: 'a' })
  assert.equal(thread.messages.length, 3)
})

test('forModel 默认不折叠，原样返回副本', () => {
  const long = 'x'.repeat(100)
  const thread = new Thread([{ role: 'tool_result', toolCallId: 't1', content: long }])
  const view = thread.forModel()
  assert.equal(view[0].content, long)
  assert.notEqual(view[0], thread.messages[0]) // 是副本
})

test('forModel 折叠超长 tool_result，但保留其存在事实', () => {
  const long = 'x'.repeat(100)
  const thread = new Thread([
    { role: 'user', content: 'u' },
    { role: 'tool_result', toolCallId: 't1', content: long },
  ])
  const view = thread.forModel({ maxToolResultChars: 10 })
  const collapsed = view.find((m) => m.role === 'tool_result' && m.toolCallId === 't1')
  assert.ok(collapsed, '折叠后 tool_result 消息仍必须存在')
  assert.notEqual(collapsed?.content, long) // 内容被替换
  assert.match(collapsed?.content ?? '', /collapsed/) // 存在事实保留
  assert.equal(thread.messages[1].content, long) // 原始线程不被改动
})

test('forModel keepRecentToolResults：最近 N 条豁免折叠，模型先看到后果、老化后才折叠', () => {
  const long = (tag: string) => `${tag}:${'x'.repeat(100)}`
  const thread = new Thread([
    { role: 'user', content: 'u' },
    { role: 'tool_result', toolCallId: 't1', content: long('old') },
    { role: 'assistant', content: 'a1' },
    { role: 'tool_result', toolCallId: 't2', content: long('recent') },
  ])
  const view = thread.forModel({ maxToolResultChars: 10, keepRecentToolResults: 1 })
  const t1 = view.find((m) => m.toolCallId === 't1')
  const t2 = view.find((m) => m.toolCallId === 't2')
  assert.match(t1?.content ?? '', /collapsed/, '老的 tool_result 折叠')
  assert.equal(t2?.content, long('recent'), '最近 1 条豁免，模型必须看到刚返回的后果')
})

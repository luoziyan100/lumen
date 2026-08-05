/**
 * [INPUT]: reduceChatItems / sealRunningProcesses
 * [OUTPUT]: text_delta 累积 / model_step 定稿 / tool_call_start 过程块 / 正文封口 process
 * [POS]: ui-client 对话归约单测
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { reduceChatItems, sealRunningProcesses, type ChatItem } from '../src/useAgent.ts'
import type { TaskEvent } from '../src/agent-client.ts'

function ev(kind: string, id: string, payload: Record<string, unknown>): { event: TaskEvent; p: Record<string, unknown> } {
  return {
    event: {
      id,
      task_id: 't',
      seq: kind.startsWith('text') || kind === 'tool_call_start' ? -1 : 1,
      kind,
      payload_json: JSON.stringify(payload),
      created_at: new Date().toISOString(),
    },
    p: payload,
  }
}

describe('reduceChatItems streaming', () => {
  it('text_delta 累积同一 streaming 泡,model_step 定稿替换', () => {
    let items: ChatItem[] = []
    const d1 = ev('text_delta', 'd1', { text: '你' })
    items = reduceChatItems(items, d1.event, d1.p)
    const d2 = ev('text_delta', 'd2', { text: '好' })
    items = reduceChatItems(items, d2.event, d2.p)
    assert.equal(items.length, 1)
    assert.equal(items[0]?.kind, 'msg')
    if (items[0]?.kind === 'msg') {
      assert.equal(items[0].content, '你好')
      assert.equal(items[0].streaming, true)
    }

    const step = ev('model_step', 'm1', { content: '你好世界', toolCalls: [] })
    items = reduceChatItems(items, step.event, step.p)
    assert.equal(items.length, 1)
    if (items[0]?.kind === 'msg') {
      assert.equal(items[0].id, 'm1')
      assert.equal(items[0].content, '你好世界')
      assert.equal(items[0].streaming, undefined)
    }
  })

  it('无 streaming 时 model_step 仍整段追加(兼容旧服务)', () => {
    const step = ev('model_step', 'm2', { content: '整包', toolCalls: [] })
    const items = reduceChatItems([], step.event, step.p)
    assert.equal(items.length, 1)
    if (items[0]?.kind === 'msg') assert.equal(items[0].content, '整包')
  })

  it('tool_call_start 开 process,后续同 id tool_call 不重复', () => {
    let items: ChatItem[] = []
    const start = ev('tool_call_start', 's1', { id: 'c1', name: 'web_search' })
    items = reduceChatItems(items, start.event, start.p)
    assert.equal(items[0]?.kind, 'process')
    const call = ev('tool_call', 'tc1', { id: 'c1', name: 'web_search', args: {} })
    items = reduceChatItems(items, call.event, call.p)
    if (items[0]?.kind === 'process') {
      assert.equal(items[0].steps.length, 1)
      assert.equal(items[0].steps[0]?.id, 'c1')
    }
  })

  it('text_delta 封口此前 running 的过程块(含多块)', () => {
    let items: ChatItem[] = [
      {
        kind: 'process',
        id: 'proc-a',
        running: true,
        steps: [{ id: 'a', name: 'read_file', done: true, label: '读取文件 · 完成' }],
      },
      {
        kind: 'process',
        id: 'proc-b',
        running: true,
        steps: [{ id: 'b', name: 'grep', done: true, label: '检索内文 · 完成' }],
      },
    ]
    const d = ev('text_delta', 'd1', { text: '有意思' })
    items = reduceChatItems(items, d.event, d.p)
    assert.equal(items.length, 3)
    assert.equal(items[0]?.kind, 'process')
    assert.equal(items[1]?.kind, 'process')
    if (items[0]?.kind === 'process') assert.equal(items[0].running, false)
    if (items[1]?.kind === 'process') assert.equal(items[1].running, false)
    assert.equal(items[2]?.kind, 'msg')
  })

  it('reply / 终态 status_change 封口全部 running process', () => {
    const base: ChatItem[] = [
      {
        kind: 'process',
        id: 'proc-a',
        running: true,
        steps: [{ id: 'a', name: 'read_file', done: true, label: '读取文件 · 完成' }],
      },
      {
        kind: 'process',
        id: 'proc-b',
        running: true,
        steps: [{ id: 'b', name: 'grep', done: false, label: '检索内文…' }],
      },
    ]
    const afterReply = reduceChatItems(base, ev('reply', 'r1', {}).event, {})
    assert.ok(afterReply.every((it) => it.kind !== 'process' || !it.running))

    const afterFail = reduceChatItems(base, ev('status_change', 's1', { to: 'failed' }).event, { to: 'failed' })
    assert.ok(afterFail.every((it) => it.kind !== 'process' || !it.running))
  })
})

describe('sealRunningProcesses', () => {
  it('无 running 时返回同一引用', () => {
    const items: ChatItem[] = [
      { kind: 'process', id: 'p', running: false, steps: [] },
    ]
    assert.equal(sealRunningProcesses(items), items)
  })
})

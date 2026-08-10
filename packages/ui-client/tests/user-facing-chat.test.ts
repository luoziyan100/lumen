/**
 * [INPUT]: reduceUserFacingItems / reduceChatItems（证据面）
 * [OUTPUT]: Claude 档 AT：主列表无 process、Thought、最终答案；证据面仍有过程
 * [POS]: HDD AT1–AT6 回归
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  reduceUserFacingItems,
  reduceChatItems,
  type ChatItem,
} from '../src/useAgent.ts'
import type { TaskEvent } from '../src/agent-client.ts'

function ev(kind: string, id: string, payload: Record<string, unknown>): { event: TaskEvent; p: Record<string, unknown> } {
  return {
    event: {
      id,
      task_id: 't',
      seq: 1,
      kind,
      payload_json: JSON.stringify(payload),
      created_at: new Date().toISOString(),
    },
    p: payload,
  }
}

function applyUser(items: ChatItem[], kind: string, id: string, p: Record<string, unknown>): ChatItem[] {
  const { event, p: payload } = ev(kind, id, p)
  return reduceUserFacingItems(items, event, payload)
}
function applyEv(items: ChatItem[], kind: string, id: string, p: Record<string, unknown>): ChatItem[] {
  const { event, p: payload } = ev(kind, id, p)
  return reduceChatItems(items, event, payload)
}

describe('user-facing Claude 两阶段', () => {
  it('AT1 live: 工具进行中主列表有 process（可见）', () => {
    let u: ChatItem[] = []
    u = applyUser(u, 'user', 'u1', { content: '搜一下' })
    u = applyUser(u, 'tool_call_start', 's1', { id: 't1', name: 'fetch_url' })
    u = applyUser(u, 'tool_result', 'r1', { id: 't1', name: 'fetch_url', llmContent: 'ok' })
    assert.equal(u.filter((i) => i.kind === 'process').length, 1)
    const proc = u.find((i) => i.kind === 'process')
    if (proc?.kind === 'process') assert.equal(proc.running, true)
  })

  it('AT1 final: 定稿后 process 卸下，只留 Thought+最终答案', () => {
    let u: ChatItem[] = []
    u = applyUser(u, 'user', 'u1', { content: '搜一下' })
    u = applyUser(u, 'tool_call_start', 's1', { id: 't1', name: 'fetch_url' })
    u = applyUser(u, 'tool_result', 'r1', { id: 't1', name: 'fetch_url', llmContent: 'ok' })
    u = applyUser(u, 'model_step', 'm1', {
      content: '我再试 unpaywall…',
      toolCalls: [{ id: 't2', name: 'fetch_url', arguments: {} }],
      reasoningContent: 'Need another path for PDF',
    })
    // 中间工具轮仍应保留 process（且中间碎碎念不当最终气泡）
    assert.ok(u.some((i) => i.kind === 'process'))
    assert.ok(!u.some((i) => i.kind === 'msg' && i.role === 'assistant' && String(i.content).includes('unpaywall')))

    u = applyUser(u, 'tool_call_start', 's2', { id: 't2', name: 'fetch_url' })
    u = applyUser(u, 'tool_result', 'r2', { id: 't2', name: 'fetch_url', llmContent: 'pdf' })
    u = applyUser(u, 'model_step', 'm2', {
      content: '最终结论：论文有三条线索。',
      toolCalls: [],
      reasoningContent: 'Enough to answer',
    })

    assert.equal(u.filter((i) => i.kind === 'process').length, 0, '终局 process 应消失')
    assert.equal(u.filter((i) => i.kind === 'thought').length, 1)
    const answers = u.filter((i) => i.kind === 'msg' && i.role === 'assistant')
    assert.equal(answers.length, 1)
    if (answers[0]?.kind === 'msg') {
      assert.match(answers[0].content, /最终结论/)
      assert.ok(!answers[0].content.includes('unpaywall'))
    }
    const th = u.find((i) => i.kind === 'thought')
    if (th?.kind === 'thought') assert.equal(th.done, true)
  })

  it('text_delta 定稿流开始时也卸下 process', () => {
    let u: ChatItem[] = []
    u = applyUser(u, 'tool_call_start', 's1', { id: 't1', name: 'search_web' })
    assert.ok(u.some((i) => i.kind === 'process'))
    u = applyUser(u, 'text_delta', 'd1', { text: '结论' })
    assert.equal(u.filter((i) => i.kind === 'process').length, 0)
    assert.ok(u.some((i) => i.kind === 'msg' && i.role === 'assistant'))
  })

  it('AT2: reasoning → Thought 默认 done=false 直到最终答案', () => {
    let u: ChatItem[] = []
    u = applyUser(u, 'model_step', 'm0', {
      content: '',
      toolCalls: [{ id: 't1', name: 'grep', arguments: {} }],
      reasoningContent: 'Looking up',
    })
    const th = u.find((i) => i.kind === 'thought')
    assert.ok(th && th.kind === 'thought')
    if (th?.kind === 'thought') assert.equal(th.done, false)
    u = applyUser(u, 'model_step', 'm1', { content: '找到了。', toolCalls: [] })
    const th2 = u.find((i) => i.kind === 'thought')
    if (th2?.kind === 'thought') assert.equal(th2.done, true)
  })

  it('AT3: 证据面仍有 process 步骤', () => {
    let e: ChatItem[] = []
    e = applyEv(e, 'tool_call_start', 's1', { id: 'c1', name: 'search_web' })
    e = applyEv(e, 'tool_result', 'r1', { id: 'c1', name: 'search_web', llmContent: '[{"title":"a"}]' })
    e = applyEv(e, 'subagent_started', 'sa', {
      subagent_id: 'sub-1',
      subagent_type: 'searcher',
      description: '搜',
    })
    assert.ok(e.some((i) => i.kind === 'process'))
    const steps = e.flatMap((i) => (i.kind === 'process' ? i.steps.map((s) => s.name) : []))
    assert.ok(steps.includes('search_web') || steps.includes('spawn_subagent') || e.some((i) => i.kind === 'process' && i.steps.length >= 1))
  })

  it('AT6: 无工具纯问答只有 user+assistant', () => {
    let u: ChatItem[] = []
    u = applyUser(u, 'user', 'u1', { content: 'hi' })
    u = applyUser(u, 'model_step', 'm1', { content: '你好', toolCalls: [] })
    assert.equal(u.filter((i) => i.kind === 'process').length, 0)
    assert.equal(u.filter((i) => i.kind === 'msg').length, 2)
  })

  it('todo 仍进用户面', () => {
    let u: ChatItem[] = []
    u = applyUser(u, 'tool_call', 'tc', {
      id: 'x',
      name: 'todo_write',
      args: {
        todos: [{ id: '1', content: '写报告', status: 'in_progress', activeForm: '正在写报告' }],
      },
    })
    assert.ok(u.some((i) => i.kind === 'todo'))
  })
})

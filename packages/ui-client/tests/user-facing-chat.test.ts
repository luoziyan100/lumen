/**
 * [INPUT]: reduceUserFacingItems / reduceChatItems（证据面）
 * [OUTPUT]: H1 Turn-scoped ToolGroup + Claude 两阶段 AT
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
    assert.equal(u.filter((i) => i.kind === 'process').length, 1)
    let proc = u.find((i) => i.kind === 'process')
    if (proc?.kind === 'process') assert.equal(proc.running, true)
    u = applyUser(u, 'tool_result', 'r1', { id: 't1', name: 'fetch_url', llmContent: 'ok' })
    proc = u.find((i) => i.kind === 'process')
    // 完成后仍可见，但 running=false，把动效让给「思考中」
    if (proc?.kind === 'process') {
      assert.equal(proc.running, false)
      assert.ok(proc.steps[0]?.done)
    }
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
    // 中间工具轮仍应保留 process（且中间碎碎念不当最终气泡，进 Thought）
    assert.ok(u.some((i) => i.kind === 'process'))
    assert.ok(!u.some((i) => i.kind === 'msg' && i.role === 'assistant' && String(i.content).includes('unpaywall')))
    assert.ok(u.some((i) => i.kind === 'thought' && String((i as { content: string }).content).includes('unpaywall')))

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
      assert.ok(!answers[0].provisional)
    }
    const th = u.find((i) => i.kind === 'thought')
    if (th?.kind === 'thought') assert.equal(th.done, true)
  })

  it('text_delta 工具轮中不卸 process；旁白标 provisional', () => {
    let u: ChatItem[] = []
    u = applyUser(u, 'tool_call_start', 's1', { id: 't1', name: 'search_web' })
    assert.ok(u.some((i) => i.kind === 'process'))
    u = applyUser(u, 'tool_result', 'r1', { id: 't1', name: 'search_web', llmContent: 'ok' })
    const proc = u.find((i) => i.kind === 'process')
    if (proc?.kind === 'process') assert.equal(proc.running, false, '工具完成后 process 应收口')
    u = applyUser(u, 'text_delta', 'd1', { text: '我再算一下' })
    assert.ok(u.some((i) => i.kind === 'process'), '中间旁白不得卸掉过程')
    const draft = u.find((i) => i.kind === 'msg' && i.role === 'assistant')
    assert.ok(draft && draft.kind === 'msg' && draft.provisional && draft.streaming)
  })

  it('tool_call_start 把 provisional 旁白折进 Thought', () => {
    let u: ChatItem[] = []
    u = applyUser(u, 'text_delta', 'd1', { text: '沙箱没有 numpy，我改纯 Python 重写。' })
    u = applyUser(u, 'tool_call_start', 's1', { id: 't1', name: 'run_code' })
    assert.ok(!u.some((i) => i.kind === 'msg' && i.role === 'assistant'), '旁白不应再占大气泡')
    assert.ok(u.some((i) => i.kind === 'thought' && String((i as { content: string }).content).includes('numpy')))
    assert.ok(u.some((i) => i.kind === 'process' && i.kind === 'process'))
    const proc = u.find((i) => i.kind === 'process')
    if (proc?.kind === 'process') {
      assert.equal(proc.running, true)
      assert.match(proc.steps[0]!.label, /运行代码/)
    }
  })

  it('无工具 model_step 才卸 process 并升格终稿', () => {
    let u: ChatItem[] = []
    u = applyUser(u, 'tool_call_start', 's1', { id: 't1', name: 'search_web' })
    u = applyUser(u, 'text_delta', 'd1', { text: '结论是' })
    assert.ok(u.some((i) => i.kind === 'process'))
    u = applyUser(u, 'model_step', 'm1', { content: '结论是三条线索。', toolCalls: [] })
    assert.equal(u.filter((i) => i.kind === 'process').length, 0)
    const ans = u.find((i) => i.kind === 'msg' && i.role === 'assistant')
    assert.ok(ans && ans.kind === 'msg' && !ans.provisional && !ans.streaming)
    assert.match(ans!.content, /三条线索/)
  })

  it('Thought 在答案之前: text_delta 先流再带 reasoning 的 model_step 不得倒置', () => {
    let u: ChatItem[] = []
    u = applyUser(u, 'user', 'u1', { content: 'Workflow vs Agent?' })
    u = applyUser(u, 'text_delta', 'd1', { text: '诚实边界' })
    u = applyUser(u, 'model_step', 'm1', {
      content: '诚实边界\n\n控制权契约…',
      toolCalls: [],
      reasoningContent: 'User asks control structure difference',
    })
    const kinds = u.map((i) => (i.kind === 'msg' ? `msg:${i.role}` : i.kind))
    assert.deepEqual(kinds, ['msg:user', 'thought', 'msg:assistant'])
    const th = u.find((i) => i.kind === 'thought')
    if (th?.kind === 'thought') {
      assert.equal(th.done, true)
      assert.match(th.content, /control structure/i)
    }
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

  it('H1 AT1: 同 turn ≥5 次工具仍只有 1 块 process', () => {
    let u: ChatItem[] = []
    u = applyUser(u, 'user', 'u1', { content: '深挖' })
    for (let i = 1; i <= 5; i += 1) {
      const id = `t${i}`
      const name = i % 2 === 0 ? 'read_file' : 'run_code'
      u = applyUser(u, 'tool_call_start', `s${i}`, { id, name })
      u = applyUser(u, 'tool_result', `r${i}`, { id, name, llmContent: 'ok' })
    }
    assert.equal(u.filter((i) => i.kind === 'process').length, 1, '同 turn 不得堆多卡')
    const proc = u.find((i) => i.kind === 'process')
    assert.ok(proc && proc.kind === 'process')
    if (proc?.kind === 'process') {
      assert.equal(proc.steps.length, 5)
      assert.equal(proc.running, false)
      assert.ok(proc.steps.every((s) => s.done))
    }
  })

  it('H1 AT2: running=false 后新工具复活同一块而非新卡', () => {
    let u: ChatItem[] = []
    u = applyUser(u, 'user', 'u1', { content: 'x' })
    u = applyUser(u, 'tool_call_start', 's1', { id: 'a', name: 'run_code' })
    u = applyUser(u, 'tool_result', 'r1', { id: 'a', name: 'run_code', llmContent: '1' })
    let proc = u.find((i) => i.kind === 'process')
    if (proc?.kind === 'process') assert.equal(proc.running, false)
    u = applyUser(u, 'tool_call_start', 's2', { id: 'b', name: 'read_file' })
    assert.equal(u.filter((i) => i.kind === 'process').length, 1)
    proc = u.find((i) => i.kind === 'process')
    if (proc?.kind === 'process') {
      assert.equal(proc.running, true)
      assert.equal(proc.steps.length, 2)
      assert.equal(proc.steps[0]?.done, true)
      assert.equal(proc.steps[1]?.done, false)
    }
  })

  it('同 turn 多段 reasoning / 子代理 hop 只留 1 块 Thought', () => {
    let u: ChatItem[] = []
    u = applyUser(u, 'user', 'u1', { content: '深挖' })
    u = applyUser(u, 'model_step', 'm0', {
      content: '',
      toolCalls: [{ id: 't1', name: 'spawn_subagent', arguments: {} }],
      reasoningContent: '先派搜索子代理',
    })
    u = applyUser(u, 'tool_call_start', 's1', { id: 't1', name: 'spawn_subagent' })
    // 子代理收口式:纯 reasoning、无工具、无正文——旧逻辑会 markDone+卸过程
    u = applyUser(u, 'model_step', 'm1', {
      content: '',
      toolCalls: [],
      reasoningContent: '子代理甲想完了',
    })
    assert.equal(u.filter((i) => i.kind === 'process').length, 1, '思考 hop 不得卸过程')
    assert.equal(u.filter((i) => i.kind === 'thought').length, 1)
    const th1 = u.find((i) => i.kind === 'thought')
    if (th1?.kind === 'thought') assert.equal(th1.done, false)

    u = applyUser(u, 'model_step', 'm2', {
      content: '',
      toolCalls: [],
      reasoningContent: '子代理乙也想完了',
    })
    assert.equal(u.filter((i) => i.kind === 'thought').length, 1, '不得堆 Thought process × N')
    const th2 = u.find((i) => i.kind === 'thought')
    if (th2?.kind === 'thought') {
      assert.match(th2.content, /先派搜索子代理/)
      assert.match(th2.content, /子代理乙/)
      assert.equal(th2.done, false)
    }

    u = applyUser(u, 'model_step', 'm3', {
      content: '综合结论在这里。',
      toolCalls: [],
      reasoningContent: '可以作答了',
    })
    assert.equal(u.filter((i) => i.kind === 'thought').length, 1)
    assert.equal(u.filter((i) => i.kind === 'process').length, 0)
    const th3 = u.find((i) => i.kind === 'thought')
    if (th3?.kind === 'thought') assert.equal(th3.done, true)
  })

  it('H1 AT3: 新 user turn 开新过程块（上一轮已卸或隔离）', () => {
    let u: ChatItem[] = []
    u = applyUser(u, 'user', 'u1', { content: '第一轮' })
    u = applyUser(u, 'tool_call_start', 's1', { id: 'a', name: 'run_code' })
    u = applyUser(u, 'tool_result', 'r1', { id: 'a', name: 'run_code', llmContent: 'ok' })
    u = applyUser(u, 'model_step', 'm1', { content: '答一', toolCalls: [] })
    assert.equal(u.filter((i) => i.kind === 'process').length, 0, '终局卸过程')
    u = applyUser(u, 'user', 'u2', { content: '第二轮' })
    u = applyUser(u, 'tool_call_start', 's2', { id: 'b', name: 'read_file' })
    assert.equal(u.filter((i) => i.kind === 'process').length, 1)
    const proc = u.find((i) => i.kind === 'process')
    if (proc?.kind === 'process') assert.equal(proc.steps.length, 1)
  })
})

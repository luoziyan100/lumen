/**
 * [INPUT]: 原生Mastra消息parts和真实React过程组件
 * [OUTPUT]: 推理展示、按轮次工具去重、六步窗口及流式开合行为证据
 * [POS]: 仅验证公开数据的呈现，不构造或推断模型隐藏推理
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { createElement, act } from 'react'
import { JSDOM } from 'jsdom'
import type { MastraDBMessage } from '@mastra/client-js'
import type { DisplayState } from '../src/mastra/data/client.ts'
register('./helpers/tsx-loader.mjs', import.meta.url)
const { processTimeline, createConversationProjection } = await import('../src/mastra/views/conversation/process/project.ts')
const { ProcessRow, ThoughtRow } = await import('../src/mastra/views/conversation/process/Rows.tsx')
const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
for (const name of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle']) Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name as keyof typeof dom.window] })
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
Object.defineProperty(window, 'matchMedia', { value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) })
const { createRoot } = await import('react-dom/client')
const message = (id: string, parts: MastraDBMessage['content']['parts'], role: MastraDBMessage['role'] = 'assistant'): MastraDBMessage => ({ id, role, createdAt: new Date(), content: { format: 2, parts } })
const tool = (id: string, completed = false): MastraDBMessage['content']['parts'][number] => ({ type: 'tool-invocation', toolInvocation: { toolCallId: id, toolName: 'read_file', args: { path: `papers/${id}.md`, hidden: 'raw secret args' }, state: completed ? 'result' : 'call', ...(completed ? { result: { content: 'raw result should not be UI' } } : {}) } })
test('原生推理/工具/正文按来源顺序呈现，轮次合卡和callId去重，不显示redacted数据', () => {
  const items = [message('user', [{ type: 'text', text: '研究' }], 'user'), message('reason', [{ type: 'reasoning', reasoning: '公开的思考摘要', details: [{ type: 'text', text: '公开的思考摘要' }] }]), message('tool1', [tool('a')]), message('tool2', [tool('a', true), tool('b', true)]), message('answer', [{ type: 'text', text: '结论' }])]
  const rows = processTimeline(items.slice(0, -1), null)
  assert.deepEqual(rows.map(row => row.kind), ['message', 'thought', 'process'])
  const process = rows.find(row => row.kind === 'process')!
  assert.ok(!processTimeline(items, null).some(row => row.kind === 'process'))
  assert.equal(process.steps.length, 2); assert.equal(process.steps[0].status, 'completed')
  const chunks = processTimeline([message('chunks', [{ type: 'text', text: '**完整' }, { type: 'text', text: '正文**' }])], null)
  assert.equal(chunks.length, 1)
  assert.equal(chunks[0].kind === 'message' && chunks[0].message.content.parts.length, 2)
  const interrupted = processTimeline([items[0], message('unfinished', [tool('unfinished')]), items.at(-1)!], null)
  assert.ok(interrupted.some(row => row.kind === 'process' && row.steps[0].status === 'stopped'))
  const active = processTimeline([items[0]], { isRunning: true, activeTools: { early: { name: 'read_file', args: {}, status: 'streaming_input' } } } as DisplayState)
  assert.ok(active.some(row => row.kind === 'process' && row.running))
  assert.equal(processTimeline([message('redacted', [{ type: 'reasoning', reasoning: '', details: [{ type: 'redacted', data: 'not public' }] }])], null).length, 0)
})
test('工具卡运行首次展开、更新不推翻手动关闭，历史只显示最近六步；思考完成自动收口', async () => {
  const element = document.createElement('div'); document.body.append(element); const root = createRoot(element)
  const messages = [message('user', [{ type: 'text', text: '研究' }], 'user'), message('tools', Array.from({ length: 8 }, (_, index) => tool(String(index))))]
  const display = { isRunning: true, activeTools: {} } as DisplayState
  const row = processTimeline(messages, display).find(row => row.kind === 'process')!
  try {
    await act(async () => root.render(createElement(ProcessRow, { row })))
    assert.equal(element.querySelector('.proc-head')!.getAttribute('aria-expanded'), 'true')
    assert.equal(element.querySelectorAll('.proc-step-label').length, 6)
    assert.ok(!element.textContent!.includes('raw secret'))
    await act(async () => element.querySelector<HTMLButtonElement>('.proc-more')!.click())
    assert.equal(element.querySelectorAll('.proc-step-label').length, 8)
    await act(async () => element.querySelector<HTMLButtonElement>('.proc-head')!.click())
    await act(async () => root.render(createElement(ProcessRow, { row: { ...row, running: false } })))
    assert.equal(element.querySelector('.proc-head')!.getAttribute('aria-expanded'), 'false')
    const thought = { kind: 'thought' as const, id: 'thought', text: '服务提供的文本', startedAt: new Date(), running: true }
    await act(async () => root.render(createElement(ThoughtRow, { row: thought })))
    assert.equal(element.querySelector('.thought-head')!.getAttribute('aria-expanded'), 'false')
    await act(async () => element.querySelector<HTMLButtonElement>('.thought-head')!.click())
    await act(async () => root.render(createElement(ThoughtRow, { row: { ...thought, text: '服务提供的流式增量', running: true } })))
    assert.equal(element.querySelector('.thought-head')!.getAttribute('aria-expanded'), 'true')
    assert.match(element.querySelector('.thought-text')!.textContent!, /流式增量/)
    await act(async () => root.render(createElement(ThoughtRow, { row: { ...thought, running: false } })))
    assert.equal(element.querySelector('.thought-head')!.getAttribute('aria-expanded'), 'false')
    assert.match(element.textContent!, /Thought process/)
  } finally { await act(async () => root.unmount()); element.remove(); dom.window.close() }
})

test('会话投影复用稳定历史，只重算当前轮', () => {
  const project = createConversationProjection()
  const user = message('user-projection', [{ type: 'text', text: '研究' }], 'user')
  const answer = message('answer-projection', [{ type: 'text', text: '历史答案' }])
  const currentUser = message('current-user-projection', [{ type: 'text', text: '继续研究' }], 'user')
  const current = message('current-projection', [{ type: 'text', text: '当前答案' }])
  const first = project([user, answer, currentUser], null)
  const second = project([user, answer, currentUser, current], null)
  assert.equal(second.timeline[0], first.timeline[0])
  assert.equal(second.timeline[1], first.timeline[1])
  assert.notEqual(second.timeline[3], first.timeline[2])
})

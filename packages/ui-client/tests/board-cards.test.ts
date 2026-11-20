/**
 * [INPUT]: the conversation projection (processTimeline) over native Mastra message parts and the real BoardCardRow (React DOM + jsdom)
 * [OUTPUT]: board cards across the canvas change: history from before it (board_supersede, old-form board_draw/update with blocks) still renders as cards,
 *           without errors; canvas draws and erases render as cards (an erase has no element to jump to); board_view and board_look stay process steps;
 *           a card's click hands its id to the board, which says when the element is gone (board-delete.test.ts)
 * [POS]: R6 rendering evidence for conversations that span the old board and the canvas
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { createElement, act } from 'react'
import { JSDOM } from 'jsdom'
import type { MastraDBMessage } from '@mastra/client-js'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
for (const name of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'MutationObserver', 'getComputedStyle', 'navigator', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: typeof dom.window[name as keyof typeof dom.window] === 'function' && /AnimationFrame/.test(name) ? (dom.window[name as keyof typeof dom.window] as Function).bind(dom.window) : dom.window[name as keyof typeof dom.window] })
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
Object.defineProperty(window, 'matchMedia', { value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) })
register('./helpers/tsx-loader.mjs', import.meta.url)
const S = (await import('./helpers/zh.ts')).zh.studio
const { processTimeline } = await import('../src/mastra/views/conversation/process/project.ts')
const { BoardCardRow } = await import('../src/mastra/views/Conversation.tsx')
const { createRoot } = await import('react-dom/client')

const message = (id: string, parts: MastraDBMessage['content']['parts'], role: MastraDBMessage['role'] = 'assistant'): MastraDBMessage => ({ id, role, createdAt: new Date(), content: { format: 2, parts } })
const call = (id: string, toolName: string, args: Record<string, unknown>, result: Record<string, unknown>) =>
  ({ type: 'tool-invocation', toolInvocation: { toolCallId: id, toolName, args, state: 'result', result } }) as MastraDBMessage['content']['parts'][number]

test('跨新旧白板的对话：旧的 board_supersede 与旧形态 board_draw/update 照样成卡片，新的画与擦成卡片，看白板留在过程里', async () => {
  const history = [
    message('u1', [{ type: 'text', text: '画一下' }], 'user'),
    // Before the canvas: blocks with kind/content, and the retired supersede
    message('old', [
      call('o1', 'board_draw', { kind: 'text', title: '负反馈是什么', content: { markdown: '压住' } }, { blockId: 'b-old', title: '负反馈是什么' }),
      call('o2', 'board_update', { blockId: 'b-old', title: '负反馈', content: { markdown: '压住输入' } }, { blockId: 'b-old', title: '负反馈' }),
      call('o3', 'board_supersede', { blockId: 'b-old' }, { supersededBy: null }),
    ]),
    message('u2', [{ type: 'text', text: '在画布上再画' }], 'user'),
    message('new', [
      call('n1', 'board_view', {}, { elements: [] }),
      call('n2', 'board_draw', { title: '浮球与阀门', elements: [{ type: 'rectangle', x: 0, y: 0 }] }, { title: '浮球与阀门', ids: ['a1', 'a2'], blockId: 'a1', note: '' }),
      call('n3', 'board_erase', { ids: ['u7'], reason: '画废的一笔' }, { removed: [], recycled: ['u7'] }),
      call('n4', 'board_look', {}, { updated: true, note: '画面已更新，下一步可见' }),
    ]),
  ]
  const rows = processTimeline(history, null)
  const cards = rows.filter(row => row.kind === 'board')
  assert.deepEqual(cards.map(card => [card.action, card.title, card.blockId ?? null]), [
    ['draw', '负反馈是什么', 'b-old'], ['update', '负反馈', 'b-old'], ['supersede', '', 'b-old'],
    ['draw', '浮球与阀门', 'a1'], ['erase', '', null],
  ])
  const steps = rows.flatMap(row => row.kind === 'process' ? row.steps.map(step => step.name) : [])
  assert.deepEqual(steps.sort(), ['board_look', 'board_view'], '读白板的两个工具是过程步骤，不是卡片')

  const element = document.createElement('div'); document.body.append(element)
  const root = createRoot(element)
  const focused: string[] = []
  try {
    await act(async () => root.render(createElement('div', null, cards.map(card => createElement(BoardCardRow, { key: card.id, card, onFocus: (id: string) => focused.push(id) })))))
    const shown = [...element.querySelectorAll('.board-card')]
    assert.equal(shown.length, 5, '每张卡片都渲染了，没有一张让页面出错')
    assert.deepEqual(shown.map(node => node.querySelector('.board-card-verb')!.textContent), [S.card.done.draw, S.card.done.update, S.card.done.supersede, S.card.done.draw, S.card.done.erase])
    assert.equal(shown[4]!.querySelector('button'), null, '擦掉的那一笔没有地方可跳')
    for (const button of element.querySelectorAll<HTMLButtonElement>('.board-card button')) await act(async () => button.click())
    assert.deepEqual(focused, ['b-old', 'b-old', 'b-old', 'a1'], '旧卡片交出旧块 id，白板查不到就只说不在了')
  } finally { await act(async () => root.unmount()); element.remove() }
})

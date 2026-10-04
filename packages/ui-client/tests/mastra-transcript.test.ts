/**
 * [INPUT]: 真实 React 会话呈现组件、迁移消息形状与浏览器 DOM
 * [OUTPUT]: 附件边界、折叠、复制反馈与轮次导航的定向行为回归
 * [POS]: 不调用模型或修改正式会话；验证原生消息的 UI 投影和实际点击
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { createElement, act } from 'react'
import type { MastraDBMessage } from '@mastra/client-js'
import { JSDOM } from 'jsdom'
import { userContent, turnItems, messageAnchor } from '../src/mastra/views/conversation/transcript/content.ts'
import { MASTRA_COPY as C } from '../src/copy/mastraCopy.ts'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
for (const name of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'navigator']) Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name as keyof typeof dom.window] })
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window) })
register('./helpers/tsx-loader.mjs', import.meta.url)
const { createRoot } = await import('react-dom/client')
const { UserMessage, MessageCopy } = await import('../src/mastra/views/conversation/transcript/Message.tsx')
const { TurnRail } = await import('../src/mastra/views/conversation/transcript/TurnRail.tsx')

function message(id: string, text: string, role: 'user' | 'assistant' = 'user'): MastraDBMessage {
  return { id, role, createdAt: new Date(), content: { format: 2, parts: [{ type: 'text', text }] } }
}
function mounted() {
  const element = document.createElement('div'); document.body.append(element)
  const root = createRoot(element)
  return { element, root, async close() { await act(async () => root.unmount()); element.remove() } }
}

test('历史文件保持当前 task/shared 范围，拒绝越界和远程附件；新上传附言只在完整合法时隐藏', () => {
  const item = message('u', '读这些')
  item.content.metadata = { legacyUploads: [
    { name: '任务.pdf', path: 'papers/task.pdf' }, { name: '共享.pdf', path: 'shared/papers/shared.pdf' },
    ...['../private', 'shared/../private', 'shared/%2e%2e/private', '/etc/passwd', 'https://example.com/x', 'projects/other/file'].map(path => ({ name: '拒绝', path })),
  ] }
  item.content.experimental_attachments = [
    { url: 'data:image/png;base64,YQ==', name: '旧图' }, { url: 'https://example.com/image.png' }, { url: 'data:image/svg+xml;base64,YQ==' },
  ]
  const projected = userContent(item)
  assert.deepEqual(projected.files, [{ name: '任务.pdf', target: { path: 'papers/task.pdf', scope: 'task' } }, { name: '共享.pdf', target: { path: 'papers/shared.pdf', scope: 'shared' } }])
  assert.equal(projected.images.length, 1)
  const uploaded = userContent(message('new', `研究\n\n${C.uploadedMaterials}\n- 论文: library/paper.pdf`))
  assert.equal(uploaded.text, '研究'); assert.equal(uploaded.files[0]?.target.path, 'library/paper.pdf')
  const invalid = `研究\n\n${C.uploadedMaterials}\n- 文件: library/../secret`
  assert.equal(userContent(message('bad', invalid)).text, invalid)
})

test('长消息展开/收起不隐藏附件，点击历史文件保持其受控范围', async () => {
  const view = mounted(), opened: unknown[] = [], item = message('long', '长'.repeat(751))
  item.content.metadata = { legacyUploads: [{ name: '附件.pdf', path: 'shared/papers/a.pdf' }] }
  item.content.experimental_attachments = [{ name: '图片', url: 'data:image/png;base64,YQ==' }]
  try {
    await act(async () => view.root.render(createElement(UserMessage, { message: item, onOpenFile: target => opened.push(target) })))
    const toggle = view.element.querySelector<HTMLButtonElement>('.msg-fold-toggle')!
    assert.equal(toggle.getAttribute('aria-expanded'), 'false')
    assert.ok(view.element.querySelector('.msg-fold-body.is-collapsed'))
    assert.ok(view.element.querySelector('.mw-history-images img'))
    const dialog = view.element.querySelector<HTMLDialogElement>('dialog')!
    Object.defineProperty(dialog, 'showModal', { value: () => dialog.setAttribute('open', '') })
    Object.defineProperty(dialog, 'close', { value: () => dialog.removeAttribute('open') })
    await act(async () => view.element.querySelector<HTMLButtonElement>('.mw-history-image')!.click())
    assert.equal(dialog.open, true)
    await act(async () => dialog.querySelector<HTMLButtonElement>('button')!.click())
    assert.equal(dialog.open, false)
    await act(async () => view.element.querySelector<HTMLButtonElement>('.msg-file-chip')!.click())
    assert.deepEqual(opened, [{ path: 'papers/a.pdf', scope: 'shared' }])
    await act(async () => toggle.click())
    assert.equal(toggle.getAttribute('aria-expanded'), 'true'); assert.equal(view.element.querySelector('.is-collapsed'), null)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)) })
    const curtain = view.element.querySelector('.curtain-fold')!
    assert.equal(curtain.getAttribute('aria-hidden'), 'false')
    await act(async () => toggle.click())
    assert.equal(toggle.getAttribute('aria-expanded'), 'false')
    assert.equal(curtain.getAttribute('aria-hidden'), 'true'); assert.ok(curtain.hasAttribute('inert'))
    assert.equal(view.element.querySelector('.is-collapsed'), null, '收帘过程不提前插入摘要')
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 420)) })
    assert.ok(view.element.querySelector('.is-collapsed')); assert.ok(view.element.querySelector('.mw-history-images img'))
    await act(async () => toggle.click())
    await act(async () => toggle.click())
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)) })
    assert.equal(curtain.getAttribute('aria-hidden'), 'true', '快速收起撤销尚未执行的展开帧')
  } finally { await view.close() }
})

test('消息复制原文并显示成功；剪贴板失败时尝试原生复制且报告失败', async () => {
  const view = mounted(), copied: string[] = []
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { copied.push(text) } } })
  try {
    await act(async () => view.root.render(createElement(MessageCopy, { text: '# 回答\n原文', user: false })))
    await act(async () => view.element.querySelector<HTMLButtonElement>('button')!.click())
    assert.deepEqual(copied, ['# 回答\n原文']); assert.equal(view.element.querySelector('button')!.getAttribute('aria-label'), '已复制')
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied') } } })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: () => false })
    await act(async () => view.element.querySelector<HTMLButtonElement>('button')!.click())
    assert.match(view.element.querySelector('[role=alert]')!.textContent!, /复制失败/)
    assert.equal(document.querySelector('textarea'), null)
    Object.defineProperty(document, 'execCommand', { configurable: true, value: () => { copied.push(document.querySelector('textarea')!.value); return true } })
    await act(async () => view.element.querySelector<HTMLButtonElement>('button')!.click())
    assert.equal(copied.length, 2); assert.equal(view.element.querySelector('[role=alert]'), null)
    assert.equal(view.element.querySelector('button')!.getAttribute('aria-label'), '已复制')
  } finally { await view.close() }
})

test('四轮出现导航，悬停显示对应摘要，点击将消息锚点交给滚动宿主', async () => {
  const view = mounted(), selected: string[] = []
  const messages = [1, 2, 3, 4].flatMap(index => [message(`u${index}`, `第${index}个问题`), message(`a${index}`, `第${index}个回复`, 'assistant')])
  const turns = turnItems(messages), scroller = { current: document.createElement('div') }
  document.body.append(scroller.current)
  for (const turn of turns) { const node = document.createElement('article'); node.id = messageAnchor(turn.id); scroller.current.append(node) }
  try {
    await act(async () => view.root.render(createElement(TurnRail, { turns: turns.slice(0, 3), scroller, onSelect: id => selected.push(id) })))
    assert.equal(view.element.querySelector('nav'), null)
    await act(async () => view.root.render(createElement(TurnRail, { turns, scroller, onSelect: id => selected.push(id) })))
    const buttons = view.element.querySelectorAll<HTMLButtonElement>('nav button')
    assert.equal(buttons.length, 4)
    await act(async () => buttons[1]!.dispatchEvent(new dom.window.MouseEvent('pointerover', { bubbles: true })))
    assert.match(view.element.querySelector('.turn-rail-preview-desc')!.textContent!, /第2个回复/)
    await act(async () => buttons[1]!.click())
    assert.deepEqual(selected, ['u2']); assert.equal(buttons[1]!.getAttribute('aria-current'), 'step')
    await act(async () => buttons[1]!.dispatchEvent(new dom.window.MouseEvent('pointerout', { bubbles: true })))
    assert.equal(view.element.querySelector('.turn-rail-preview-desc'), null)
  } finally { await view.close(); scroller.current.remove() }
})

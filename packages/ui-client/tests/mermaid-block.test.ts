/**
 * [INPUT]: 真实 AssistantContent/Markdown/MermaidBlock 组件与真实 mermaid.parse(jsdom 宿主)
 * [OUTPUT]: 坏图显示源码与「请模型修正」,点击后经 onSendMessage 发出带原图与解析错误的普通消息且不重复发送;
 *           同会话同图(两处出现/重挂载)只发一次、换会话可再发;流式中与无会话出口时不出现该按钮;
 *           外层 figure 不吞掉按钮与 alert,role=img 只在 SVG 层;渲染缓存不超过 64 条
 * [POS]: 失败图修正链路的组件回归;成功渲染的像素由桌面实机核对(jsdom 无布局)
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { createElement, act } from 'react'
import { JSDOM } from 'jsdom'
import { setTimeout as delay } from 'node:timers/promises'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
for (const name of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'navigator', 'MutationObserver', 'getComputedStyle', 'DOMParser', 'SVGElement']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: (dom.window as unknown as Record<string, unknown>)[name] })
}
// jsdom 无布局:给出列宽,ResizeObserver 只需存在
Object.defineProperty(dom.window.HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 640 })
Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  ResizeObserver: class { observe() {} disconnect() {} },
})
register('./helpers/tsx-loader.mjs', import.meta.url)
const { createRoot } = await import('react-dom/client')
const { AssistantContent } = await import('../src/components/widget/AssistantContent.tsx')
const { MERMAID_COPY } = await import('../src/copy/appCopy.ts')
const { mermaidRenderCacheSize } = await import('../src/components/MermaidBlock.tsx')

const BROKEN = 'flowchart TD\n  A["开始"] --> B["处理\n  subgraph S\n'

async function mount(props: Parameters<typeof AssistantContent>[0]) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => { root.render(createElement(AssistantContent, props)) })
  return { host, unmount: () => act(async () => { root.unmount(); host.remove() }) }
}

async function until(check: () => boolean, why: string) {
  for (let i = 0; i < 300 && !check(); i++) await act(async () => { await delay(20) })
  assert.ok(check(), why)
}

test('坏图经真实 mermaid.parse 失败后可请模型修正,消息含原图与错误且只发一次', { timeout: 30000 }, async () => {
  const sent: string[] = []
  const view = await mount({ content: `结论如下。\n\n\`\`\`mermaid\n${BROKEN}\`\`\``, onSendMessage: text => { sent.push(text) }, fixScope: 'p:once' })
  try {
    await until(() => !!view.host.querySelector('.mermaid-ask-fix'), '没有出现修正按钮')
    assert.ok(view.host.querySelector('.mermaid-error')?.textContent)
    assert.match(view.host.querySelector('.mermaid-source')?.textContent ?? '', /A\["开始"\]/)
    const button = view.host.querySelector<HTMLButtonElement>('.mermaid-ask-fix')!
    assert.equal(button.textContent, MERMAID_COPY.askFix)
    await act(async () => { button.click() })
    await act(async () => { button.click() })
    assert.equal(sent.length, 1)
    assert.match(sent[0]!, /无法渲染/)
    assert.match(sent[0]!, /Parse error|Expecting|Lexical/i)
    assert.ok(sent[0]!.includes('```mermaid\n' + BROKEN.trim() + '\n```'))
    assert.equal(button.disabled, true)
    assert.equal(button.textContent, MERMAID_COPY.askedFix)
  } finally { await view.unmount() }
})

test('流式中或没有会话出口时不出现修正按钮', { timeout: 30000 }, async () => {
  const streaming = await mount({ content: `\`\`\`mermaid\n${BROKEN}\`\`\``, isStreaming: true, onSendMessage: () => {}, fixScope: 'p:stream' })
  try {
    assert.equal(streaming.host.querySelector('.mermaid-ask-fix'), null)
    assert.ok(streaming.host.querySelector('code.language-mermaid'))
  } finally { await streaming.unmount() }
  const reader = await mount({ content: `\`\`\`mermaid\n${BROKEN}\`\`\`` })
  try {
    await until(() => !!reader.host.querySelector('.mermaid-error'), '无出口时仍应显示失败与源码')
    assert.equal(reader.host.querySelector('.mermaid-ask-fix'), null)
  } finally { await reader.unmount() }
})

test('同会话同一张坏图出现两次或重挂载只发一次修正，换会话可再发', { timeout: 30000 }, async () => {
  const sent: string[] = []
  const twice = `复述前:\n\n\`\`\`mermaid\n${BROKEN}\`\`\`\n\n复述后:\n\n\`\`\`mermaid\n${BROKEN}\`\`\``
  const onSendMessage = (text: string) => { sent.push(text) }
  const first = await mount({ content: twice, onSendMessage, fixScope: 'p:dup' })
  try {
    await until(() => first.host.querySelectorAll('.mermaid-ask-fix').length === 2, '两处坏图都应出现修正按钮')
    const [a, b] = [...first.host.querySelectorAll<HTMLButtonElement>('.mermaid-ask-fix')]
    await act(async () => { a!.click() })
    await act(async () => { b!.click() })
    assert.equal(sent.length, 1, '同会话同图第二处不得再发')
  } finally { await first.unmount() }
  const again = await mount({ content: `\`\`\`mermaid\n${BROKEN}\`\`\``, onSendMessage, fixScope: 'p:dup' })
  try {
    await until(() => !!again.host.querySelector('.mermaid-ask-fix'), '重挂载后仍显示按钮')
    const button = again.host.querySelector<HTMLButtonElement>('.mermaid-ask-fix')!
    assert.equal(button.disabled, true, '重挂载后显示已请求')
    assert.equal(button.textContent, MERMAID_COPY.askedFix)
  } finally { await again.unmount() }
  const other = await mount({ content: `\`\`\`mermaid\n${BROKEN}\`\`\``, onSendMessage, fixScope: 'p:other' })
  try {
    await until(() => !!other.host.querySelector('.mermaid-ask-fix'), '另一会话显示按钮')
    await act(async () => { other.host.querySelector<HTMLButtonElement>('.mermaid-ask-fix')!.click() })
    assert.equal(sent.length, 2, '另一会话可以再请求')
  } finally { await other.unmount() }
})

test('失败卡的按钮与 alert 不在 role=img 之内', { timeout: 30000 }, async () => {
  const view = await mount({ content: `\`\`\`mermaid\n${BROKEN}\`\`\``, onSendMessage: () => {}, fixScope: 'p:a11y' })
  try {
    await until(() => !!view.host.querySelector('.mermaid-ask-fix'), '没有出现修正按钮')
    assert.equal(view.host.querySelector('.mermaid-block')!.getAttribute('role'), 'figure')
    for (const el of view.host.querySelectorAll('button, [role=alert], [role=toolbar]')) assert.equal(el.closest('[role=img]'), null, `${el.className} 被 role=img 吞掉`)
  } finally { await view.unmount() }
})

test('渲染缓存超过 64 张图后淘汰最久未用的', { timeout: 60000 }, async () => {
  const charts = Array.from({ length: 70 }, (_, i) => `\`\`\`mermaid\n${BROKEN}  N${i}["${i}\n\`\`\``).join('\n\n')
  const view = await mount({ content: charts })
  try {
    await until(() => view.host.querySelectorAll('.mermaid-error').length === 70, '70 张坏图都应完成渲染')
    assert.equal(mermaidRenderCacheSize(), 64)
  } finally { await view.unmount() }
})

/**
 * [INPUT]: 真实 AssistantContent/Markdown/MermaidBlock 组件与真实 mermaid.parse(jsdom 宿主)
 * [OUTPUT]: 坏图显示源码与「请模型修正」,点击后经 onSendMessage 发出带原图与解析错误的普通消息且不重复发送;
 *           流式中与无会话出口时不出现该按钮
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
  const view = await mount({ content: `结论如下。\n\n\`\`\`mermaid\n${BROKEN}\`\`\``, onSendMessage: text => { sent.push(text) } })
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
  const streaming = await mount({ content: `\`\`\`mermaid\n${BROKEN}\`\`\``, isStreaming: true, onSendMessage: () => {} })
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

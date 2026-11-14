/**
 * [INPUT]: 真实 Materials 的 filterMaterials/shortLink、ViewNav 的 navFits 与组件（React DOM + jsdom，宽度在元素尺寸边界注入）
 * [OUTPUT]: chrome 任务的单元证据：素材搜索（标题/链接、大小写、首尾空格、中文子串、无匹配）、链接短写（arXiv 摘要页、带路径与查询、末尾斜杠、无链接）、
 *           视图导航五项都有图标与 aria-label、放不下时只留图标（title 补上、aria-label 不丢）、头部宽 0 不切换
 * [POS]: 纯函数与组件接线；真实排版（居中偏差、不换行、三态颜色）在浏览器断言里核对，不在此冒充
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { createElement, act } from 'react'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
for (const name of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'DocumentFragment', 'MutationObserver', 'getComputedStyle', 'navigator']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name as keyof typeof dom.window] })
}
const observed: Array<() => void> = []
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, ResizeObserver: class { constructor(callback: () => void) { observed.push(callback) } observe() {} unobserve() {} disconnect() {} } })
after(() => dom.window.close())
register('./helpers/tsx-loader.mjs', import.meta.url)
const { createRoot } = await import('react-dom/client')
const { filterMaterials, shortLink } = await import('../src/mastra/studio/Materials.tsx')
const { ViewNav, navFits, VIEWS } = await import('../src/mastra/studio/ViewNav.tsx')
const S = (await import('./helpers/zh.ts')).zh.studio

type Material = Parameters<typeof filterMaterials>[0][number]
const base = { kind: 'pdf', file: 'x.pdf', sha256: 's', mediaType: 'application/pdf', size: 1, addedBy: 'you', createdAt: '', authors: null, year: null, arxivId: null, titleSource: null, topicId: 't', addedAt: '', readProgress: 0, citedBy: 0 }
const item = (id: string, title: string, sourceUrl: string | null) => ({ ...base, id, title, sourceUrl }) as Material

test('素材搜索：标题与链接，不分大小写、忽略首尾空格、中文按子串；无匹配为空，空查询原样', () => {
  const items = [
    item('a', 'Attention Is All You Need', 'https://arxiv.org/abs/1706.03762'),
    item('b', '负反馈为什么能稳住系统', null),
    item('c', '水箱笔记', 'https://example.com/post/1?ref=Feed'),
  ]
  const ids = (query: string) => filterMaterials(items, query).map(material => material.id)
  assert.deepEqual(ids('attention'), ['a'], '标题不分大小写')
  assert.deepEqual(ids('ARXIV.ORG/ABS'), ['a'], '链接不分大小写')
  assert.deepEqual(ids('ref=feed'), ['c'], '链接的查询部分也算')
  assert.deepEqual(ids('   1706.03762  '), ['a'], '首尾空格忽略')
  assert.deepEqual(ids('反馈'), ['b'], '中文子串')
  assert.deepEqual(ids('稳住'), ['b'])
  assert.deepEqual(ids('example.com/post/1'), ['c'], '短写也能搜到')
  assert.deepEqual(ids('没有这一份'), [], '无匹配')
  assert.deepEqual(ids('x.pdf'), [], '文件名、类型等不在搜索范围（C6 后只看标题与链接）')
  assert.equal(filterMaterials(items, ''), items)
  assert.equal(filterMaterials(items, '   '), items)
})

test('链接短写：去协议与末尾斜杠，路径与查询保留；无链接为空', () => {
  assert.equal(shortLink('https://arxiv.org/abs/2611.14235'), 'arxiv.org/abs/2611.14235')
  assert.equal(shortLink('https://example.com/post/1'), 'example.com/post/1')
  assert.equal(shortLink('https://example.com/post/1?ref=feed&x=1'), 'example.com/post/1?ref=feed&x=1')
  assert.equal(shortLink('http://example.com/post/1/'), 'example.com/post/1')
  assert.equal(shortLink('https://example.com/'), 'example.com')
  assert.equal(shortLink('HTTPS://Example.com//'), 'Example.com')
  assert.equal(shortLink(null), '')
  assert.equal(shortLink(undefined), '')
  assert.equal(shortLink(''), '')
})

test('navFits：居中时两侧都让出较宽一侧的按钮再留 8px', () => {
  assert.equal(navFits(500, 400, 38), true, '400 + 2×(38+8) = 492 ≤ 500')
  assert.equal(navFits(492, 400, 38), true)
  assert.equal(navFits(491, 400, 38), false)
  assert.equal(navFits(416, 400, 0), true, '没有展开按钮时只留两侧 8px')
  assert.equal(navFits(415, 400, 0), false)
})

test('视图导航：五项都有图标与 aria-label；放不下只留图标并补 title；头部宽 0 不切换', async () => {
  const sizes = { head: 0, nav: 395 }
  Object.defineProperty(dom.window.HTMLElement.prototype, 'clientWidth', { configurable: true, get(this: HTMLElement) { return this.matches('header') ? sizes.head : 0 } })
  Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetWidth', { configurable: true, get(this: HTMLElement) { return this.matches('.studio-views-ghost') ? sizes.nav : this.matches('.pane-toggle') ? 30 : 0 } })
  Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetLeft', { configurable: true, get(this: HTMLElement) { return this.matches('.pane-toggle') ? 8 : 0 } })
  const element = document.createElement('div'); document.body.append(element)
  const root = createRoot(element)
  const selected: string[] = []
  const tabs = () => [...element.querySelectorAll<HTMLButtonElement>('nav [role=tab]')]
  const render = (toggle: boolean) => act(async () => root.render(createElement('header', { className: 'studio-head studio-center-head' },
    toggle && createElement('button', { className: 'icon-btn pane-toggle', key: 'toggle' }),
    createElement(ViewNav, { view: 'board', onView: (view: string) => selected.push(view) }))))
  try {
    await render(false)
    // ---- 五项：图标在左（16，currentColor）、文字在右，aria-label 恒在 ----
    assert.deepEqual(tabs().map(tab => [tab.getAttribute('aria-label'), tab.textContent, tab.title]), VIEWS.map(view => [S.views[view], S.views[view], '']))
    assert.deepEqual(tabs().map(tab => tab.firstElementChild!.getAttribute('class')!.match(/li-(\w+)/)![1]), ['presentation', 'stack', 'conceptMap', 'lightbulb', 'grid'])
    assert.ok(tabs().every(tab => { const svg = tab.querySelector('svg')!; return svg.getAttribute('width') === '16' && svg.getAttribute('stroke') === 'currentColor' }))
    assert.deepEqual(tabs().map(tab => tab.getAttribute('aria-selected')), ['true', 'false', 'false', 'false', 'false'])
    assert.deepEqual(tabs().map(tab => tab.dataset.available), ['true', 'false', 'false', 'false', 'false'])
    await act(async () => tabs()[3]!.click())
    assert.deepEqual(selected, ['ideas'])
    // 量宽度的副本不进可访问树、不可聚焦
    const ghost = element.querySelector<HTMLElement>('.studio-views-ghost')!
    assert.deepEqual([ghost.getAttribute('aria-hidden'), ghost.hasAttribute('inert'), ghost.querySelectorAll('[role=tab]').length], ['true', true, 0])
    assert.equal(element.querySelectorAll('[role=tablist]').length, 1)
    assert.ok(!element.querySelector('nav')!.classList.contains('is-compact'), '头部宽 0（没在排版）时保持完整')

    // ---- 放得下：完整；放不下：只留图标，title 补上，aria-label 不丢 ----
    sizes.head = 395 + 2 * (38 + 8)
    await render(true)
    await act(async () => observed.forEach(callback => callback()))
    assert.ok(!element.querySelector('nav')!.classList.contains('is-compact'))
    sizes.head -= 1
    await act(async () => observed.forEach(callback => callback()))
    assert.ok(element.querySelector('nav')!.classList.contains('is-compact'))
    assert.deepEqual(tabs().map(tab => [tab.getAttribute('aria-label'), tab.textContent, tab.title, !!tab.querySelector('svg')]), VIEWS.map(view => [S.views[view], '', S.views[view], true]))
    assert.equal(ghost.textContent, VIEWS.map(view => S.views[view]).join(''), '副本一直是完整宽度')
    // ---- 展开按钮收走（头部尺寸不变，靠子节点变化重量）后又放得下 ----
    await render(false)
    await act(async () => { await Promise.resolve() })
    assert.ok(!element.querySelector('nav')!.classList.contains('is-compact'), '少了按钮只需两侧 8px')
  } finally {
    await act(async () => root.unmount()); element.remove()
    for (const name of ['clientWidth', 'offsetWidth', 'offsetLeft']) delete (dom.window.HTMLElement.prototype as unknown as Record<string, unknown>)[name]
  }
})

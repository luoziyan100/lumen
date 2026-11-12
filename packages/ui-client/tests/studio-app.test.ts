/**
 * [INPUT]: 真实 StudioApp（主题栏/白板/材料/精灵/阅读器）与 React DOM、真实 HTTP 服务与 Mastra Controller、确定性模型
 * [OUTPUT]: S4 外壳行为证据：四种区块经真实 board_draw 落库后渲染（梯子/表格/小部件/出处签与 AI 推断）、白板只靠工具完成信号刷新（ETag 轮询被截住）、
 *           对话里只出现白板卡片且点卡跳到那块、主题运行时「新对话」禁用（R1）、材料分「你带来的 / AI 找来的」并在分屏打开原件、精灵收起/停靠/拖动并持久
 * [POS]: S4 组件级验收；可控模型只证明机制，不冒充真实模型研究验收；不宣称覆盖 WebKit
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { createElement, act } from 'react'
import { JSDOM } from 'jsdom'
import { serve } from '@hono/node-server'
import { createHttpService } from '../../mastra-service/src/server.ts'
import { fixtureProvider, textReply, toolReply, type ProviderRequest } from '../../mastra-service/tests/provider-fixture.ts'
import { ensureTopic } from '../../mastra-service/tests/topic-fixture.ts'
import { LumenApi } from '../src/mastra/data/client.ts'
import { STUDIO_COPY as S } from '../src/copy/studioCopy.ts'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
for (const name of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Element', 'Node', 'NodeFilter', 'Text', 'DocumentFragment', 'MutationObserver', 'localStorage', 'getComputedStyle', 'navigator']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name as keyof typeof dom.window] })
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } })
Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) })
Object.defineProperty(dom.window.HTMLElement.prototype, 'scrollTo', { configurable: true, value(this: HTMLElement, options: ScrollToOptions) { this.scrollTop = Number(options?.top ?? 0) } })
after(() => dom.window.close())
register('./helpers/tsx-loader.mjs', import.meta.url)
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(specifier, context, next) { if (specifier.endsWith('?url')) return { url: 'data:text/javascript,export default "test-worker-url"', shortCircuit: true }; return next(specifier, context) } export async function load(url, context, next) { const result = await next(url, context); if (url.endsWith('/WidgetFrame.tsx')) return { ...result, source: String(result.source).replaceAll('import.meta.env.BASE_URL', JSON.stringify('/')) }; return result }`), import.meta.url)
const { createRoot } = await import('react-dom/client')
const { StudioApp } = await import('../src/mastra/studio/StudioApp.tsx')

function gate() {
  let open!: () => void
  const promise = new Promise<void>(resolve => { open = resolve })
  return { promise, open }
}
async function until(check: () => boolean, message: string, ms = 15000) {
  const limit = Date.now() + ms
  while (!check()) {
    if (Date.now() > limit) throw new Error(message)
    await act(async () => { await delay(20) })
  }
}
const said = (request: ProviderRequest) => {
  const lastUser = request.messages.map(message => message.role).lastIndexOf('user')
  return { text: JSON.stringify(request.messages[lastUser]), results: request.messages.slice(lastUser).filter(message => message.role === 'tool').length }
}

test('白板外壳：真实 board_draw 画出四种区块并靠工具信号刷新；运行中新对话禁用；卡片跳块；材料分屏；精灵收起/停靠/拖动', { timeout: 90000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-studio-app-')), token = 'studio-app-token-at-least-24-characters'
  const hold = gate(), arrived = gate(), midway = gate(), resume = gate()
  let itemId = ''
  const fixture = fixtureProvider(async request => {
    const tools = request.tools?.map(tool => tool.function.name) ?? []
    if (!tools.includes('board_draw')) return textReply('标题')
    const { text, results } = said(request)
    if (!text.includes('画四块')) return textReply('好')
    if (results === 0) { arrived.open(); await hold.promise }
    if (results === 1) { midway.open(); await resume.promise }
    const draws = [
      { kind: 'text', title: '负反馈是什么', content: { markdown: '输出回头**压住**输入。' }, sources: [{ itemId, page: 2, quote: '浮球' }] },
      { kind: 'ladder', title: '理解的梯子', content: { rungs: [{ level: 1, text: '浮球与阀门' }, { level: 2, text: '恒温器' }, { level: 3, text: '闭环传递函数' }], here: 2, foggedAbove: 2, breakAt: 2 } },
      { kind: 'table', title: '三种回路', content: { columns: ['回路', '结果'], rows: [['水箱', '稳定'], ['恒温器', '']], guessCells: [[1, 1]] } },
      { kind: 'widget', title: '水位小实验', content: { html: '<p id="tank">水位</p>' } },
    ]
    return results < draws.length ? toolReply('board_draw', draws[results], `draw-${results}`) : textReply('画好了四块')
  })
  const service = await createHttpService({ dataRoot, token, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  const sheetReads: number[] = []
  const server = serve({ hostname: '127.0.0.1', port: 0, fetch: request => {
    if (/^\/lumen\/sheets\//.test(new URL(request.url).pathname)) sheetReads.push(Date.now())
    return service.app.fetch(request)
  } })
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const connection = { baseUrl: `http://127.0.0.1:${address.port}`, token }
  const api = new LumenApi(connection)

  // ---- 真实材料：你上传的一份 + AI 收进来的一份（经真实资料库与引用表） ----
  ensureTopic(service, 'feedback', '负反馈为什么能稳住系统')
  itemId = (await api.upload({ topicId: 'feedback' }, new File(['浮球把阀门顶上，水位就稳了。'], '水箱笔记.txt', { type: 'text/plain' }))).itemId
  const found = await service.application.studio.library.add({ name: '控制论导论.txt', bytes: Buffer.from('维纳：反馈是控制的核心。'), addedBy: 'ai' })
  service.application.studio.topics.reference('feedback', found.item.id)

  // ---- ETag 5 秒兜底轮询截住：区块出现只能来自白板工具完成信号 ----
  const original = window.setInterval
  window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => timeout === 5000 ? 0 : original.call(window, handler, timeout, ...args)) as typeof window.setInterval
  localStorage.clear()
  const element = document.createElement('div'); document.body.append(element)
  const root = createRoot(element)
  const $ = <T extends Element = HTMLElement>(selector: string) => element.querySelector<T & HTMLElement>(selector)
  const $$ = (selector: string) => [...element.querySelectorAll<HTMLElement>(selector)]
  const button = (name: string) => [...element.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === name || item.getAttribute('aria-label') === name)
  async function click(name: string) { const target = button(name); assert.ok(target, `未找到按钮：${name}`); assert.ok(!target.disabled, `按钮被禁用：${name}`); await act(async () => target.click()) }
  async function pointer(target: Element, type: string, x: number, y: number) {
    await act(async () => { target.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y })) })
  }
  try {
    await act(async () => root.render(createElement(StudioApp, { connection })))
    await until(() => !!$('.board-frame-label'), '白板没有出现')
    assert.equal($('.studio-topic-title')!.textContent, '负反馈为什么能稳住系统')
    assert.match($('.board-frame-label')!.textContent!, /已用 0 \/ 8 块/)
    assert.ok($('.board-empty'), '空白板要说清楚')

    // ---- 视图标签：只有白板可用，其余如实占位 ----
    assert.deepEqual($$('.studio-views [role=tab]').map(tab => tab.textContent), ['白板', '沉淀', '概念图', '灵感', '全部'])
    await act(async () => $$('.studio-views [role=tab]')[2]!.click())
    assert.equal($('.studio-later')!.textContent, S.views.map.later)
    await act(async () => $$('.studio-views [role=tab]')[0]!.click())

    // ---- 材料：分「你带来的 / AI 找来的」，点开在中间分屏读原件 ----
    await until(() => $$('.material').length === 2, '材料没有列出')
    const groups = $$('.materials-group')
    assert.match(groups[0]!.textContent!, /你带来的.*水箱笔记/)
    assert.match(groups[1]!.textContent!, /AI 找来的.*控制论导论/)
    await act(async () => $$('.material-open')[0]!.click())
    await until(() => /浮球把阀门顶上/.test($('.studio-reader')?.textContent ?? ''), '分屏没有读出原件')
    assert.ok($('.studio-stage.studio-split'))
    await click('关闭阅读器')
    assert.equal($('.studio-reader'), null)

    // ---- 精灵：球 → 浮窗；Welcome 发第一句，模型被闸住时主题在运行 ----
    await click(S.sprite.open)
    await until(() => !!$('.sprite-floating textarea'), '精灵没有展开到输入框')
    const input = $<HTMLTextAreaElement>('.sprite textarea')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')!.set!.call(input, '画四块')
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
    await act(async () => { $('.sprite form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })) })
    await arrived.promise
    await until(() => !!$('.topic .topic-light-running'), '主题没有亮运行灯')
    const fresh = button(S.sprite.newConversation)!
    assert.ok(fresh.disabled, 'R1：主题运行时不能开新对话')
    assert.equal(fresh.title, S.sprite.busy)
    const readsBefore = sheetReads.length
    hold.open()

    // ---- 运行还没结束、第一块写完：白板靠工具完成信号刷新（运行结束的 onActivity 还没发生） ----
    await midway.promise
    await until(() => $$('.board-block').length === 1, '第一块写完后白板没有在运行中刷新')
    assert.ok(sheetReads.length > readsBefore, '白板应在工具完成后重取')
    assert.ok($('.topic .topic-light-running'), '此时运行还没结束')
    resume.open()

    // ---- 四块经真实工具落库 ----
    await until(() => $$('.board-block').length === 4, '四块没有出现在白板上', 30000)
    await until(() => /已用 4 \/ 8 块/.test($('.board-frame-label')!.textContent!), '白板没有计数到 4 块')
    const [text, ladder, table, widget] = ['text', 'ladder', 'table', 'widget'].map(kind => $(`.board-block[data-kind=${kind}]`)!)
    assert.match(text!.querySelector('.block-text')!.innerHTML, /<strong>压住<\/strong>/)
    assert.equal(text!.querySelector('.source-chip')!.textContent, '水箱笔记 · p.2')
    assert.deepEqual([...ladder!.querySelectorAll('.rung')].map(rung => rung.getAttribute('data-level')), ['3', '2', '1'])
    assert.ok(ladder!.querySelector('.rung[data-level="3"].rung-fog'), '高于雾线的梯级要遮住')
    assert.equal(ladder!.querySelector('.rung[data-level="3"] .rung-text')!.textContent, S.board.fog)
    assert.ok(ladder!.querySelector('.rung[data-level="2"] .rung-here-tag'))
    assert.ok(ladder!.querySelector('.rung[data-level="2"] .rung-break'))
    assert.equal(ladder!.querySelector('.source-chip-inferred')!.textContent, S.board.inferred)
    assert.equal(table!.querySelector('.guess-cell')!.textContent, S.board.guess)
    assert.equal(table!.querySelectorAll('tbody tr').length, 2)
    assert.ok(widget!.querySelector('iframe'), '唯一的小部件应在运行名额内')

    // ---- 对话里只有白板卡片，点卡跳到那块；出处签在分屏打开原件 ----
    await until(() => $$('.sprite .board-card').length === 4, '对话里没有四张白板卡片')
    assert.equal($$('.sprite .mw-process').filter(node => /board_draw/.test(node.textContent ?? '')).length, 0, 'R6：白板工具不进过程步骤')
    await act(async () => $$('.sprite .board-card button').find(node => /三种回路/.test(node.textContent!))!.click())
    assert.ok(table!.classList.contains('is-focused'), '点卡要跳到那块')
    await act(async () => (text!.querySelector('.source-chip') as HTMLButtonElement).click())
    await until(() => /浮球把阀门顶上/.test($('.studio-reader')?.textContent ?? ''), '出处签没有打开原件')
    await click('关闭阅读器')

    // ---- 跑完：新对话恢复可用；精灵收起/停靠/拖动并持久 ----
    await until(() => !button(S.sprite.newConversation)!.disabled, '运行结束后新对话应恢复')
    await click(S.sprite.dock)
    assert.ok($('main.studio.studio-docked') && $('.sprite-docked'))
    assert.equal(JSON.parse(localStorage.getItem('lumen.studio.sprite')!).docked, true)
    await click(S.sprite.float)
    const before = JSON.parse(localStorage.getItem('lumen.studio.sprite')!) as { x: number; y: number }
    const head = $('.sprite-head')!
    await pointer(head, 'pointerdown', 500, 400); await pointer(head, 'pointermove', 440, 360); await pointer(head, 'pointerup', 440, 360)
    const moved = JSON.parse(localStorage.getItem('lumen.studio.sprite')!) as { x: number; y: number }
    assert.deepEqual([moved.x, moved.y], [Math.max(8, before.x - 60), Math.max(8, before.y - 40)])
    await click(S.sprite.collapse)
    assert.ok($('.sprite-orb') && !$('.sprite'))
    assert.equal(JSON.parse(localStorage.getItem('lumen.studio.sprite')!).open, false)
    assert.ok(fixture.requests.length > 0)
  } finally {
    window.setInterval = original
    await act(async () => root.unmount()); element.remove()
    server.close(); await service.close(); await rm(dataRoot, { recursive: true, force: true })
  }
})

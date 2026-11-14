/**
 * [INPUT]: 真实 StudioApp（主题栏/白板/材料/精灵/阅读器）与 React DOM、真实 HTTP 服务与 Mastra Controller、确定性模型
 * [OUTPUT]: S4 外壳行为证据（含 S5 返工：单张不显示张标签、面板首行头部、梯子断点在两级之间、不重复「AI 画的」、主题 ＋ 回车建/Esc 取消；返工二：中栏头部无主题名、不显示已用块数、素材单列表倒序；P0 后续：⌘B/⌘⌥B 收放与 localStorage、铺满/Esc、无 ws-tag；精灵：拖浮窗带着锚点走、收起后头像在锚点角、拖头像不打开）：四种区块经真实 board_draw 落库后渲染（梯子/表格/小部件/出处签与 AI 推断）、白板只靠工具完成信号刷新（ETag 轮询被截住）、
 *           对话里只出现白板卡片且点卡跳到那块、主题运行时「新对话」禁用（R1）、素材行只有标题（无链接时）并在分屏打开原件、精灵收起/停靠/拖动并持久；
 *           chrome：视图导航五项都有图标与 aria-label、上传在素材标题行且没有加链接入口、搜索即时过滤/无匹配/Esc 清空、左下角只有设置、设置里的专家分页经真实服务启停/重载且运行中写入被拒
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
import { SPRITE_W, SPRITE_H, orbPoint, windowAt } from '../src/mastra/studio/sprite-place.ts'

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
    await until(() => !!$('.board-sheet-new'), '白板没有出现')
    // ---- U1：主题名不写在中栏头部，留在 aria-label 与窗口标题 ----
    assert.equal($('.studio-center')!.getAttribute('aria-label'), '负反馈为什么能稳住系统')
    assert.equal(document.title, '负反馈为什么能稳住系统 — Lumen')
    assert.ok(!$('.studio-center .studio-head')!.textContent!.includes('负反馈'))
    // ---- U2：不显示已用块数（上限与 R11 在服务端不变） ----
    assert.ok(!$('.studio-board')!.textContent!.includes('已用'))
    assert.ok($('.board-empty'), '空白板要说清楚')
    // ---- G7/U1：只有一张白板时不显示和主题同名的张标签，中栏里不再出现主题名 ----
    assert.equal($('.board-tabs'), null)
    assert.equal($$('.studio-center *').filter(node => node.children.length === 0 && node.textContent === '负反馈为什么能稳住系统').length, 0)
    // ---- G2：每个面板首行都是头部 ----
    assert.deepEqual($$('.studio-panel').map(panel => (panel.firstElementChild!.matches('.studio-head') || panel.firstElementChild!.firstElementChild!.matches('.studio-head'))), [true, true, true])

    // ---- 视图导航：五项图标在左、文字在右，aria-label 恒在；只有白板可用，其余如实占位 ----
    assert.deepEqual($$('.studio-views [role=tab]').map(tab => tab.textContent), ['白板', '沉淀', '概念图', '灵感', '全部'])
    assert.deepEqual($$('.studio-views [role=tab]').map(tab => [tab.getAttribute('aria-label'), tab.firstElementChild!.matches('svg.lumen-icon'), tab.dataset.available]),
      [['白板', true, 'true'], ['沉淀', true, 'false'], ['概念图', true, 'false'], ['灵感', true, 'false'], ['全部', true, 'false']])
    await act(async () => $$('.studio-views [role=tab]')[2]!.click())
    assert.equal($('.studio-later')!.textContent, S.views.map.later)
    await act(async () => $$('.studio-views [role=tab]')[0]!.click())

    // ---- 材料：分「你带来的 / AI 找来的」，点开在中间分屏读原件 ----
    await until(() => $$('.material').length === 2, '材料没有列出')
    // ---- U3：右栏叫「素材」，一个列表按加入时间倒序，不分组不计数；C6：没有链接的条目只有标题一行，不标谁找来的 ----
    assert.equal($('.studio-materials .studio-head-title')!.textContent, '素材')
    assert.equal($$('.studio-materials .studio-label').length, 0)
    assert.deepEqual($$('.material-title').map(node => node.textContent), ['控制论导论', '水箱笔记'])
    assert.deepEqual($$('.material-text').map(node => [...node.children].map(child => child.textContent)), [['控制论导论'], ['水箱笔记']])
    assert.equal($$('.material-link, .material-meta, [data-added-by]').length, 0)
    assert.ok($$('.material-open').every(row => !/AI 找来|读到|未打开|TXT/.test(row.textContent!)))
    // ---- C4：上传在「素材」标题行，收起之前；右栏没有任何加链接入口 ----
    assert.deepEqual([...$('.studio-materials .studio-head')!.querySelectorAll('button')].map(node => node.getAttribute('aria-label')), [S.materials.upload, S.panes.right.collapse])
    assert.ok($('.studio-materials .studio-head input[type=file][multiple]'))
    assert.equal($$('.studio-materials form, .materials-add').length, 0)
    assert.ok(!/链接/.test($$('.studio-materials input, .studio-materials button').map(node => `${node.getAttribute('placeholder') ?? ''}${node.getAttribute('aria-label') ?? ''}`).join('')))
    // ---- C3：纯搜索，输入即过滤（不分大小写、首尾空格、中文子串），无匹配如实说，Esc 清空 ----
    const search = $<HTMLInputElement>('.materials-search input')!
    assert.deepEqual([search.placeholder, search.getAttribute('aria-label'), !!$('.materials-search svg.li-search')], [S.materials.search, S.materials.search, true])
    const type = (value: string) => act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(search, value)
      search.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
    await type('  水箱 ')
    assert.deepEqual($$('.material-title').map(node => node.textContent), ['水箱笔记'])
    await type('没有这一份')
    assert.deepEqual([$$('.material').length, $('.materials-none')?.textContent], [0, S.materials.noMatch])
    await act(async () => { search.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })) })
    assert.deepEqual([search.value, $$('.material').length], ['', 2])
    await act(async () => $$('.material-open')[1]!.click())
    await until(() => /浮球把阀门顶上/.test($('.studio-reader')?.textContent ?? ''), '分屏没有读出原件')
    assert.ok($('.studio-center.studio-split'))
    assert.equal($$('.ws-tag').length, 0, 'I1：素材与阅读器头部不用文字徽标')
    assert.ok($('.studio-reader .reader-icon svg') && $$('.material-icon svg').length === 2)

    // ---- K：⌘B 收主题栏、⌘⌥B 收素材栏，状态进 localStorage；收起的栏 inert，展开按钮在中栏头部两端 ----
    const key = (init: KeyboardEventInit) => act(async () => { window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })) })
    const panes = () => JSON.parse(localStorage.getItem('lumen.studio.panes')!) as { left: boolean; right: boolean; ratio: number }
    await key({ key: 'b', code: 'KeyB', metaKey: true })
    assert.ok($('main.studio.studio-left-collapsed') && $('.studio-topics')!.hasAttribute('inert'))
    assert.equal(panes().left, true)
    const reopen = $('.studio-board-pane .studio-head .pane-toggle[data-pane="left"]')!
    assert.deepEqual([reopen.getAttribute('aria-expanded'), reopen.title], ['false', `${S.panes.left.expand} ⌘B`])
    await key({ key: '∫', code: 'KeyB', metaKey: true, altKey: true })
    assert.ok($('main.studio.studio-right-collapsed') && $('.studio-materials')!.hasAttribute('inert'))
    assert.deepEqual([panes().left, panes().right], [true, true])
    assert.ok($('.studio-reader .studio-head > .pane-toggle[data-pane="right"]'), '分屏时素材栏的展开按钮在阅读器头最右')
    await act(async () => reopen.click())
    await key({ key: 'b', code: 'KeyB', ctrlKey: true, altKey: true })
    assert.deepEqual([panes().left, panes().right], [false, false])
    assert.ok(!$('main.studio.studio-left-collapsed') && !$('.studio-topics')!.hasAttribute('inert'))

    // ---- R：分屏 → 铺满（白板隐藏但仍挂载）→ Esc 回分屏；输入框里的 Esc 不抢 ----
    assert.ok($('.studio-splitter[role="separator"]'))
    await click(S.reader.full)
    assert.ok($('.studio-center.studio-full') && $('.studio-board'), '铺满时白板保持挂载')
    assert.equal($('.studio-splitter'), null)
    assert.ok(button(S.reader.restore))
    await act(async () => { $('.materials-search input')!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    assert.ok($('.studio-center.studio-full'), '输入框里的 Esc 留给输入框')
    await key({ key: 'Escape' })
    assert.ok($('.studio-center.studio-split') && !$('.studio-center.studio-full'))
    await click(S.reader.full)
    await click('关闭阅读器')
    assert.equal($('.studio-reader'), null)
    assert.ok(!$('.studio-center.studio-full'), '关掉阅读器不留铺满状态')

    // ---- C1：左下角只有「设置」；专家是设置里的分页，经真实服务启停与重载 ----
    assert.deepEqual($$('.studio-foot button').map(node => node.textContent), [S.settings])
    await click(S.settings)
    const nav = () => [...document.querySelectorAll<HTMLButtonElement>('.settings-nav-item')]
    assert.deepEqual(nav().map(node => node.textContent), ['模型', '研究偏好', '专家', '外观'])
    await act(async () => nav()[2]!.click())
    await until(() => document.querySelectorAll('.settings-body .agent-card').length > 0, '专家分页没有列出专家')
    assert.equal(document.querySelector('.settings-body .settings-h')!.textContent, '专家')
    // R1：专家卡自己的头部——名称与启停按钮在同一个 .agent-card-head 里，不借 .mw-question / .mw-dialog
    assert.equal(document.querySelectorAll('.settings-body .mw-question').length, 0)
    assert.ok([...document.querySelectorAll('.settings-body .agent-card')].every(card => {
      const head = card.querySelector(':scope > .agent-card-head')!
      return head.children.length === 2 && head.children[0]!.matches('h3.agent-card-name') && head.children[1]!.matches('button') && /^(停用|启用)$/.test(head.children[1]!.textContent!)
    }))
    const expert = () => document.querySelector<HTMLElement>('.settings-body .agent-card')!
    const toggle = () => [...expert().querySelectorAll<HTMLButtonElement>('header button')][0]!
    assert.deepEqual([toggle().textContent, /已启用/.test(expert().querySelector('small')!.textContent!)], ['停用', true])
    await act(async () => toggle().click())
    await until(() => toggle().textContent === '启用', '停用没有生效')
    assert.match(expert().querySelector('small')!.textContent!, /已停用/)
    await act(async () => toggle().click())
    await until(() => toggle().textContent === '停用', '启用没有生效')
    const reload = [...document.querySelectorAll<HTMLButtonElement>('.settings-body .mp-head button')].find(node => node.textContent === '重新加载专家')!
    await act(async () => reload.click())
    await until(() => !reload.disabled, '重载没有结束')
    assert.equal(document.querySelector('.settings-body [role=alert]'), null)
    await act(async () => (document.querySelector<HTMLButtonElement>('.settings-close'))!.click())
    assert.equal(document.querySelector('.settings-modal'), null)

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
    // ---- C1：运行中改专家由服务拒绝，专家分页如实显示，状态不变 ----
    await click(S.settings)
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('.settings-nav-item')].find(node => node.textContent === '专家')!.click())
    await until(() => document.querySelectorAll('.settings-body .agent-card').length > 0, '运行中专家分页没有列出专家')
    await act(async () => [...document.querySelector('.settings-body .agent-card')!.querySelectorAll<HTMLButtonElement>('header button')][0]!.click())
    await until(() => !!document.querySelector('.settings-body [role=alert]'), '运行中写入没有被拒绝')
    assert.match(document.querySelector('.settings-body .agent-card small')!.textContent!, /已启用/)
    await act(async () => (document.querySelector<HTMLButtonElement>('.settings-close'))!.click())
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
    assert.ok(!$('.studio-board')!.textContent!.includes('已用'), '写了四块也不显示已用块数')
    const [text, ladder, table, widget] = ['text', 'ladder', 'table', 'widget'].map(kind => $(`.board-block[data-kind=${kind}]`)!)
    assert.match(text!.querySelector('.block-text')!.innerHTML, /<strong>压住<\/strong>/)
    assert.equal(text!.querySelector('.source-chip')!.textContent, '水箱笔记 · p.2')
    assert.deepEqual([...ladder!.querySelectorAll('.rung')].map(rung => rung.getAttribute('data-level')), ['3', '2', '1'])
    assert.ok(ladder!.querySelector('.rung[data-level="3"].rung-fog'), '高于雾线的梯级要遮住')
    assert.equal(ladder!.querySelector('.rung[data-level="3"] .rung-text')!.textContent, S.board.fog)
    assert.ok(ladder!.querySelector('.rung[data-level="2"] .rung-here-tag'))
    // ---- 断点画在 breakAt 那级与上一级之间（R3/B5），不贴在某一级里 ----
    const broken = ladder!.querySelector('.rung-break')!
    assert.equal(broken.textContent, S.board.broken)
    assert.equal(broken.previousElementSibling!.getAttribute('data-level'), '3')
    assert.equal(broken.nextElementSibling!.getAttribute('data-level'), '2')
    assert.equal(ladder!.querySelector('.rung .rung-break'), null)
    // ---- B2：不在每块上重复「AI 画的」，署名留在 aria-label ----
    assert.ok($$('.board-block').every(block => !block.textContent!.includes(S.board.by) && block.getAttribute('aria-label')!.startsWith(S.board.by)))
    assert.equal(ladder!.querySelector('.source-chip-inferred')!.textContent, S.board.inferred)
    assert.equal(table!.querySelector('.guess-cell')!.textContent, S.board.guess)
    assert.equal(table!.querySelectorAll('tbody tr').length, 2)
    assert.ok(widget!.querySelector('.block-widget iframe'), '唯一的小部件应在运行名额内')

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
    // ---- 精灵只有一个位置：拖浮窗标题栏带着锚点走，收起后头像在浮窗的锚点角（M5） ----
    type Stored = { anchor: Parameters<typeof orbPoint>[0]; w: number; h: number; open: boolean }
    const stored = () => JSON.parse(localStorage.getItem('lumen.studio.sprite')!) as Stored
    const vw = window.innerWidth, vh = window.innerHeight
    const frame = windowAt(orbPoint(stored().anchor, vw, vh), stored(), vw, vh)
    const head = $('.sprite-head')!
    await pointer(head, 'pointerdown', 500, 400); await pointer(head, 'pointermove', 440, 360); await pointer(head, 'pointerup', 440, 360)
    const dragged = windowAt(orbPoint(stored().anchor, vw, vh), stored(), vw, vh)
    assert.deepEqual([dragged.x, dragged.y], [Math.max(8, frame.x - 60), Math.max(8, frame.y - 40)])
    assert.deepEqual([parseFloat($('.sprite-floating')!.style.left), parseFloat($('.sprite-floating')!.style.top)], [dragged.x, dragged.y])
    await click(S.sprite.collapse)
    assert.ok($('.sprite-orb') && !$('.sprite'))
    assert.equal(stored().open, false)
    const orb = orbPoint(stored().anchor, vw, vh)
    assert.deepEqual([parseFloat($('.sprite-orb')!.style.left), parseFloat($('.sprite-orb')!.style.top)], [orb.x, orb.y])
    assert.ok([dragged.x, dragged.x + dragged.w - SPRITE_W].includes(orb.x) && [dragged.y, dragged.y + dragged.h - SPRITE_H].includes(orb.y), '头像落在浮窗的一个角上')
    // ---- 头像：拖超过 4px 不打开，松手停在那里（M2/M3） ----
    const ball = $('.sprite-orb')!
    await pointer(ball, 'pointerdown', orb.x + SPRITE_W / 2, orb.y + SPRITE_H / 2); await pointer(ball, 'pointermove', 200, 150)
    // 松手后浏览器紧随派发的鼠标 click（detail 1）；element.click() 的 detail 是 0，等同键盘激活，不会被吞
    await act(async () => {
      ball.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true, clientX: 200, clientY: 150 }))
      ball.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })) })
    assert.ok(!$('.sprite'), '拖完的 click 不打开')
    assert.deepEqual(orbPoint(stored().anchor, vw, vh), { x: 200 - SPRITE_W / 2, y: 150 - SPRITE_H / 2 })
    assert.ok(fixture.requests.length > 0)

    // ---- T1：左栏头部「主题 ＋」，＋ 在列表顶出输入框，Esc 取消、回车创建 ----
    await click(S.newTopic)
    const field = $<HTMLInputElement>('.topics-new input')!
    assert.ok(field)
    await act(async () => { field.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    assert.equal($('.topics-new'), null, 'Esc 取消')
    await click(S.newTopic)
    const named = $<HTMLInputElement>('.topics-new input')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(named, '第二个问题')
      named.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
    await act(async () => { $('.topics-new')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })) })
    await until(() => $('.studio-center')?.getAttribute('aria-label') === '第二个问题', '回车没有创建并选中新主题')
    assert.equal($('.topics-new'), null)
  } finally {
    window.setInterval = original
    await act(async () => root.unmount()); element.remove()
    server.close(); await service.close(); await rm(dataRoot, { recursive: true, force: true })
  }
})

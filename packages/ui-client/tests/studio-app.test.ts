/**
 * [INPUT]: the real StudioApp (topics/board/materials/sprite/reader) with React DOM, a real HTTP service and Mastra Controller, a deterministic model
 * [OUTPUT]: shell behaviour evidence for S4 (S5 rework included: a lone sheet shows one numbered tab, first panel rows share the header line,
 *           topic ＋ Enter creates/Esc cancels; rework two: no topic name in the center header, no used-count, materials as one descending list;
 *           post-P0: ⌘B/⌘⌥B collapse with localStorage, full/Esc, no ws-tag; the sprite: dragging the window carries the anchor, the collapsed avatar sits at the anchor corner, dragging the avatar never opens):
 *           real board_draw calls reach the canvas (queued ops while the run continues, the app's commit, the AI's elements), the board refreshes only on tool-completion signals (the ETag poll is intercepted),
 *           conversation shows only board cards that hand their element to the canvas, "新对话" disables while the topic runs (R1), material rows show title only (without a link) and open the original in split, the sprite collapses/docks/drags and persists;
 *           chrome: all six views (Reading first and the default) with icon and aria-label, upload in the materials header with no add-link entry, instant filtering/no match/Esc clear, settings alone at bottom-left, the specialists pane toggling/reloading through the real service with writes refused while running
 * [POS]: component-level acceptance for S4; the controllable model proves mechanism only and never stands in for real-model acceptance; no WebKit coverage claimed.
 *        The canvas is the stand-in of helpers/canvas-stub.mjs and the service fixture plays the app's layout and commit
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
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
import { layOut } from '../../mastra-service/tests/studio/canvas-fixtures.ts'
import { LumenApi } from '../src/mastra/data/client.ts'
import { zh } from './helpers/zh.ts'
const S = zh.studio
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
register('./helpers/canvas-stub.mjs', import.meta.url)
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

test('白板外壳：真实 board_draw 画到画布上并靠工具信号刷新；运行中新对话禁用；卡片把元素交给画布；材料分屏；精灵收起/停靠/拖动', { timeout: 90000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-studio-app-')), token = 'studio-app-token-at-least-24-characters'
  const hold = gate(), arrived = gate(), midway = gate(), resume = gate()
  let itemId = ''
  const fixture = fixtureProvider(async request => {
    const tools = request.tools?.map(tool => tool.function.name) ?? []
    if (!tools.includes('board_draw')) return textReply('标题')
    const { text, results } = said(request)
    if (!text.includes('画三笔')) return textReply('好')
    if (results === 0) { arrived.open(); await hold.promise }
    if (results === 1) { midway.open(); await resume.promise }
    // The app lays out and commits each draw once its tool signal reaches the board; the fixture plays that part
    const studio = service.application.studio
    for (const sheet of studio.board.sheets('feedback')) for (const pending of studio.board.canvas.ops(sheet.id)) studio.board.canvas.commit(sheet.id, pending.id, layOut(pending))
    const draws = [
      { title: '浮球与阀门', elements: [{ type: 'rectangle', id: 'float', x: 0, y: 0, width: 160, height: 60, label: { text: '浮球' } }, { type: 'rectangle', id: 'valve', x: 320, y: 0, width: 160, height: 60, label: { text: '阀门' } }] },
      { title: '回头压住', elements: [{ type: 'arrow', id: 'push', x: 0, y: 0, start: { id: 'float' }, end: { id: 'valve' } }] },
      { title: '三种回路', elements: [{ type: 'text', id: 'loops', x: 0, y: 160, text: '水箱 · 恒温器 · 巡航' }] },
    ]
    return results < draws.length ? toolReply('board_draw', draws[results], `draw-${results}`) : textReply('画好了三笔')
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

  // ---- Real materials: one you uploaded and one the AI brought in (through the real library and reference tables) ----
  ensureTopic(service, 'feedback', '负反馈为什么能稳住系统')
  itemId = (await api.upload({ topicId: 'feedback' }, new File(['浮球把阀门顶上，水位就稳了。'], '水箱笔记.txt', { type: 'text/plain' }))).itemId
  const found = await service.application.studio.library.add({ name: '控制论导论.txt', bytes: Buffer.from('维纳：反馈是控制的核心。'), addedBy: 'ai' })
  service.application.studio.topics.reference('feedback', found.item.id)

  // ---- The 5-second ETag fallback poll is intercepted: the AI's strokes can only appear through the board tool-completion signal ----
  const original = window.setInterval
  window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => timeout === 5000 ? 0 : original.call(window, handler, timeout, ...args)) as typeof window.setInterval
  localStorage.clear()
  const element = document.createElement('div'); document.body.append(element)
  const root = createRoot(element)
  const $ = <T extends Element = HTMLElement>(selector: string) => element.querySelector<T & HTMLElement>(selector)
  const $$ = (selector: string) => [...element.querySelectorAll<HTMLElement>(selector)]
  const tab = (view: keyof typeof S.views) => $$('.studio-views [role=tab]').find(node => node.getAttribute('aria-label') === S.views[view])!
  const button = (name: string) => [...element.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === name || item.getAttribute('aria-label') === name)
  async function click(name: string) { const target = button(name); assert.ok(target, `未找到按钮：${name}`); assert.ok(!target.disabled, `按钮被禁用：${name}`); await act(async () => target.click()) }
  async function pointer(target: Element, type: string, x: number, y: number) {
    await act(async () => { target.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y })) })
  }
  try {
    await act(async () => root.render(createElement(StudioApp, { connection })))
    await until(() => $$('.studio-views [role=tab]').length > 0, '视图导航没有出现')
    assert.equal(tab('reading').getAttribute('aria-selected'), 'true', 'Reading is the default view')
    await act(async () => tab('board').click())
    await until(() => !!$('.board-sheet-new'), '白板没有出现')
    // ---- U1: the topic name stays out of the center header; it lives in aria-label and the window title ----
    assert.equal($('.studio-center')!.getAttribute('aria-label'), '负反馈为什么能稳住系统')
    assert.equal(document.title, '负反馈为什么能稳住系统 — Lumen')
    assert.ok(!$('.studio-center .studio-head')!.textContent!.includes('负反馈'))
    // ---- U2: no used-count on display (the canvas has no capacity since 2026-11-19, R11) ----
    assert.ok(!$('.studio-board')!.textContent!.includes('已用'))
    assert.ok($('.board-easel') && !$('.board-empty'), '空白板是画架，没有说明句')
    // ---- G7/U1: a lone sheet shows one numbered tab, never the topic's name; the center never shows the topic name ----
    assert.equal($$('.board-tabs .board-tab').length, 1)
    assert.equal($$('.studio-center *').filter(node => node.children.length === 0 && node.textContent === '负反馈为什么能稳住系统').length, 0)
    // ---- G2: every panel's first row is its header ----
    assert.deepEqual($$('.studio-panel').map(panel => (panel.firstElementChild!.matches('.studio-head') || panel.firstElementChild!.firstElementChild!.matches('.studio-head'))), [true, true, true])

    // ---- View navigation: six entries, Reading first, icon left, text right, aria-label always; reading, board and takeaways open, the rest honest placeholders ----
    assert.deepEqual($$('.studio-views [role=tab]').map(tab => tab.textContent), ['解读', '白板', '沉淀', '概念图', '灵感', '全部'])
    assert.deepEqual($$('.studio-views [role=tab]').map(tab => [tab.getAttribute('aria-label'), tab.firstElementChild!.matches('svg.lumen-icon'), tab.dataset.available]),
      [['解读', true, 'true'], ['白板', true, 'true'], ['沉淀', true, 'true'], ['概念图', true, 'false'], ['灵感', true, 'false'], ['全部', true, 'false']])
    await act(async () => tab('map').click())
    // The placeholder is the cork board alone (V2): 「还没开放」 names it for screen readers only, no visible text
    assert.equal($('.studio-later')!.getAttribute('aria-label'), S.notOpen)
    assert.equal($('.studio-later p'), null, 'no visible line')
    assert.ok($('.studio-later .studio-later-object svg.iso-cork'), 'the cork board alone')
    await act(async () => tab('board').click())

    // ---- Materials: brought by you / found by the AI; opening one reads the original in the center split ----
    await until(() => $$('.material').length === 2, '材料没有列出')
    // ---- U3: the right pane is one descending list, no groups, no counts; C6: an item without a link is a title-only row with no who-found-it tag ----
    assert.equal($('.studio-materials .studio-head-title')!.textContent, '素材')
    assert.equal($$('.studio-materials .studio-label').length, 0)
    assert.deepEqual($$('.material-title').map(node => node.textContent), ['控制论导论', '水箱笔记'])
    assert.deepEqual($$('.material-text').map(node => [...node.children].map(child => child.textContent)), [['控制论导论'], ['水箱笔记']])
    assert.equal($$('.material-link, .material-meta, [data-added-by]').length, 0)
    assert.ok($$('.material-open').every(row => !/AI 找来|读到|未打开|TXT/.test(row.textContent!)))
    // ---- C4: upload sits in the materials header, before the collapse; the right pane offers no add-link entry ----
    assert.deepEqual([...$('.studio-materials .studio-head')!.querySelectorAll('button')].map(node => node.getAttribute('aria-label')), [S.materials.upload, S.panes.right.collapse])
    assert.ok($('.studio-materials .studio-head input[type=file][multiple]'))
    assert.equal($$('.studio-materials form, .materials-add').length, 0)
    assert.ok(!/链接/.test($$('.studio-materials input, .studio-materials button').map(node => `${node.getAttribute('placeholder') ?? ''}${node.getAttribute('aria-label') ?? ''}`).join('')))
    // ---- C3: plain search, filtering as you type (case-insensitive, trimmed, CJK substrings), honest no-match, Esc clears ----
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

    // ---- K: ⌘B collapses the topics pane, ⌘⌥B the materials pane, state in localStorage; a collapsed pane is inert with reopen toggles at the center header's ends ----
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

    // ---- R: split → full (the board hides but stays mounted) → Esc back to split; an Esc inside an input belongs to the input ----
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

    // ---- C1: settings alone at bottom-left; specialists are a settings pane toggled and reloaded through the real service ----
    assert.deepEqual($$('.studio-foot button').map(node => node.textContent), [S.settings])
    await click(S.settings)
    const nav = () => [...document.querySelectorAll<HTMLButtonElement>('.settings-nav-item')]
    assert.deepEqual(nav().map(node => node.textContent), ['模型', '研究偏好', '专家', '外观', '说话习惯', '已归档'])
    await act(async () => nav()[2]!.click())
    await until(() => document.querySelectorAll('.settings-body .agent-card').length > 0, '专家分页没有列出专家')
    assert.equal(document.querySelector('.settings-body .settings-h')!.textContent, '专家')
    // R1: the specialist card's own header — name and toggle share one .agent-card-head, borrowing no .mw-question / .mw-dialog
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

    // ---- Sprite: orb → floating window; Welcome sends the first sentence and the topic runs while the model is gated ----
    await click(S.sprite.open)
    await until(() => !!$('.sprite-floating textarea'), '精灵没有展开到输入框')
    const input = $<HTMLTextAreaElement>('.sprite textarea')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')!.set!.call(input, '画三笔')
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
    await act(async () => { $('.sprite form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })) })
    await arrived.promise
    await until(() => !!$('.topic .topic-light-running'), '主题没有亮运行灯')
    const fresh = button(S.sprite.newConversation)!
    assert.ok(fresh.disabled, 'R1：主题运行时不能开新对话')
    assert.equal(fresh.title, S.sprite.busy)
    // ---- C1: the service refuses a specialist change while running; the pane shows it as due and the state stands ----
    await click(S.settings)
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('.settings-nav-item')].find(node => node.textContent === '专家')!.click())
    await until(() => document.querySelectorAll('.settings-body .agent-card').length > 0, '运行中专家分页没有列出专家')
    await act(async () => [...document.querySelector('.settings-body .agent-card')!.querySelectorAll<HTMLButtonElement>('header button')][0]!.click())
    await until(() => !!document.querySelector('.settings-body [role=alert]'), '运行中写入没有被拒绝')
    assert.match(document.querySelector('.settings-body .agent-card small')!.textContent!, /已启用/)
    await act(async () => (document.querySelector<HTMLButtonElement>('.settings-close'))!.click())
    const readsBefore = sheetReads.length
    hold.open()

    // ---- Run unfinished, first draw done: the board refreshed on the tool signal (the run-end onActivity has not happened yet) and the canvas has the op ----
    const canvas = () => $('.board-canvas')!
    await midway.promise
    await until(() => !!$('.board-canvas') && canvas().dataset.ops !== '', '第一笔写完后白板没有在运行中刷新（排队的一笔该出现在画布上）')
    assert.ok(sheetReads.length > readsBefore, '白板应在工具完成后重取')
    assert.ok($('.topic .topic-light-running'), '此时运行还没结束')
    resume.open()

    // ---- Three draws landed through the real tools, as the AI's elements ----
    await until(() => ['float', 'valve', 'push', 'loops'].every(id => canvas().dataset.elements!.split(' ').includes(id)), '三笔没有落到画布上', 30000)
    assert.equal(canvas().dataset.ops, '', '每一笔都落了')
    assert.ok(!$('.studio-board')!.textContent!.includes('已用'), '画了也不显示已用数')
    assert.equal($('.board-easel'), null, '有了笔画，画架退场')
    const rows = new Map(service.application.studio.board.canvas.liveElements(service.application.studio.board.sheets('feedback')[0]!.id).map(row => [row.element.id, row]))
    assert.deepEqual(['float', 'valve', 'push', 'loops'].map(id => rows.get(id)!.author), ['ai', 'ai', 'ai', 'ai'])

    // ---- The conversation shows only board cards; clicking one hands its element to the canvas ----
    await until(() => $$('.sprite .board-card').length === 3, '对话里没有三张白板卡片')
    assert.equal($$('.sprite .mw-process').filter(node => /board_draw/.test(node.textContent ?? '')).length, 0, 'R6：白板工具不进过程步骤')
    await act(async () => $$('.sprite .board-card button').find(node => /三种回路/.test(node.textContent!))!.click())
    await until(() => canvas().dataset.focus === 'loops', '点卡要把那一笔交给画布')

    // ---- Run done: "新对话" is back; the sprite collapses/docks/drags and persists ----
    await until(() => !button(S.sprite.newConversation)!.disabled, '运行结束后新对话应恢复')
    await click(S.sprite.dock)
    assert.ok($('main.studio.studio-docked') && $('.sprite-docked'))
    assert.equal(JSON.parse(localStorage.getItem('lumen.studio.sprite')!).docked, true)
    await click(S.sprite.float)
    // ---- The sprite has one position: dragging the window title carries the anchor, and the collapsed avatar sits at the window's anchor corner (M5) ----
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
    // ---- Avatar: a drag past 4px never opens it, and release leaves it where it stopped (M2/M3) ----
    const ball = $('.sprite-orb')!
    await pointer(ball, 'pointerdown', orb.x + SPRITE_W / 2, orb.y + SPRITE_H / 2); await pointer(ball, 'pointermove', 200, 150)
    // After release the browser dispatches a real mouse click (detail 1); element.click() carries detail 0 — keyboard activation — and would be swallowed
    await act(async () => {
      ball.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true, clientX: 200, clientY: 150 }))
      ball.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })) })
    assert.ok(!$('.sprite'), '拖完的 click 不打开')
    assert.deepEqual(orbPoint(stored().anchor, vw, vh), { x: 200 - SPRITE_W / 2, y: 150 - SPRITE_H / 2 })
    assert.ok(fixture.requests.length > 0)

    // ---- T1: the topics header's ＋ opens the inline input above the list; Esc cancels, Enter creates ----
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

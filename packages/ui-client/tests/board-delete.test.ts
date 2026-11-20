/**
 * [INPUT]: Real Board component and useBoard hook (React DOM + jsdom, Kumo menu and dialog); a real HTTP service with Mastra Controller
 * [OUTPUT]: R17 UI evidence: every tab has a keyboard-reachable 「⋯」 menu (a lone sheet keeps its tab and menu); an empty sheet deletes
 *           without a dialog; a sheet with strokes asks in a dialog naming number, title and stroke count; the run's target has the item disabled
 *           with the reason; deleting the selected sheet switches to the neighbour; an older service says deletion is unsupported; a card whose
 *           element left (its sheet deleted) shows 「这一笔已经不在白板上了」 and nothing else moves; a card to an element on another sheet selects
 *           that sheet and hands the element to its canvas
 * [POS]: Component wiring and the real service round trip; the canvas is the stand-in of helpers/canvas-stub.mjs; real layout and skins are checked in the browser assertions
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
import { fixtureProvider, textReply } from '../../mastra-service/tests/provider-fixture.ts'
import { ensureTopic } from '../../mastra-service/tests/topic-fixture.ts'
import { element as stroke } from '../../mastra-service/tests/studio/canvas-fixtures.ts'
import { LumenApi, type Sheet } from '../src/mastra/data/client.ts'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
for (const name of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'DocumentFragment', 'MutationObserver', 'getComputedStyle', 'navigator', 'KeyboardEvent', 'MouseEvent', 'PointerEvent', 'FocusEvent', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  if (dom.window[name as keyof typeof dom.window] !== undefined) Object.defineProperty(globalThis, name, { configurable: true, value: typeof dom.window[name as keyof typeof dom.window] === 'function' && /AnimationFrame/.test(name) ? (dom.window[name as keyof typeof dom.window] as Function).bind(dom.window) : dom.window[name as keyof typeof dom.window] })
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } })
after(() => dom.window.close())
register('./helpers/tsx-loader.mjs', import.meta.url)
register('./helpers/canvas-stub.mjs', import.meta.url)
const { createRoot } = await import('react-dom/client')
const { Board } = await import('../src/mastra/studio/Board.tsx')
const { useBoard } = await import('../src/mastra/studio/useBoard.ts')
const S = (await import('./helpers/zh.ts')).zh.studio
type BoardState = ReturnType<typeof useBoard>

async function until(check: () => boolean | Promise<boolean>, message: string, ms = 10000) {
  const limit = Date.now() + ms
  while (!await check()) {
    if (Date.now() > limit) throw new Error(message)
    await act(async () => { await delay(20) })
  }
}

const tabs = () => [...document.querySelectorAll<HTMLElement>('.board-tabs .board-tab')]
const menuButton = (index: number) => tabs()[index]!.querySelector<HTMLButtonElement>('.board-tab-more')!
const item = () => [...document.querySelectorAll<HTMLElement>('[role=menuitem]')].find(node => node.textContent === S.board.remove)
const dialog = () => document.querySelector<HTMLElement>('[role=dialog]')

/** Opens a 「⋯」 menu the way a click does (pointer, then click) and waits for its item. */
async function openMenu(trigger: HTMLElement) {
  await act(async () => {
    trigger.dispatchEvent(new dom.window.PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }))
    trigger.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, button: 0 }))
    trigger.dispatchEvent(new dom.window.PointerEvent('pointerup', { bubbles: true, button: 0, pointerType: 'mouse' }))
    trigger.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, button: 0 }))
    trigger.click()
  })
  await until(() => !!item(), 'menu did not open')
}
async function choose() { await act(async () => item()!.click()) }

async function service(respondTo?: (path: string, method: string) => Response | null) {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-board-delete-ui-')), token = 'board-delete-ui-token-at-least-24-characters'
  const fixture = fixtureProvider(() => textReply('好'))
  const http = await createHttpService({ dataRoot, token, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  const server = serve({ hostname: '127.0.0.1', port: 0, fetch: request => respondTo?.(new URL(request.url).pathname, request.method) ?? http.app.fetch(request) })
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const api = new LumenApi({ baseUrl: `http://127.0.0.1:${address.port}`, token })
  return { api, http, studio: http.application.studio, async close() { server.close(); await http.close(); await rm(dataRoot, { recursive: true, force: true }) } }
}

/** Board wired to the real useBoard, the way StudioApp mounts it; focus comes from a conversation card click. */
function mount(api: LumenApi, topicId: string) {
  const element = document.createElement('div'); document.body.append(element)
  const root = createRoot(element)
  let board!: BoardState, focus: { elementId: string; nonce: number } | null = null
  function Harness() { board = useBoard(api, topicId, '', false); return createElement(Board, { api, board, drawing: null, focus, sediment: sedimentStub, invite: null }) }
  const render = () => act(async () => root.render(createElement(Harness)))
  return { element, get board() { return board }, render,
    async card(elementId: string) { focus = { elementId, nonce: Date.now() }; await render() },
    async unmount() { await act(async () => root.unmount()); element.remove() } }
}

const sedimentStub = { items: [], offers: [], unsupported: false, error: '', revConflict: false, refresh() {}, async create() { return true }, async confirm() { return true }, async dismiss() {}, async edit() { return true }, async remove() { return true } }

test('R17 Board against the real service: keyboard-reachable 「⋯」 on every tab; empty deletes without a dialog; content asks with number, title and count; the selected sheet hands over to its neighbour', { timeout: 60000 }, async () => {
  const env = await service()
  const view = mount(env.api, 'p')
  try {
    ensureTopic(env.http, 'p', '反馈')
    const first = env.studio.board.sheets('p')[0]!.id, empty = env.studio.board.createSheet('p').id, full = env.studio.board.createSheet('p').id
    env.studio.board.canvas.save(full, [stroke('u1', 'freedraw'), stroke('u2', 'text', { text: '二' })])
    await view.render()
    await until(() => tabs().length === 3 && view.board.selected === full, 'board did not load')
    // ---- every tab has its own menu button, focusable from the keyboard, named after the sheet ----
    assert.deepEqual(tabs().map(tab => tab.querySelectorAll('button').length), [2, 2, 2])
    assert.deepEqual(tabs().map((_, index) => menuButton(index).getAttribute('aria-label')), ['反馈', '白板 2', '白板 3'].map(name => S.board.more(name)))
    for (let index = 0; index < 3; index++) { menuButton(index).focus(); assert.equal(document.activeElement, menuButton(index)); assert.notEqual(menuButton(index).tabIndex, -1) }
    assert.ok(tabs()[2]!.classList.contains('is-on'), 'the selected tab carries the always-visible menu')
    // ---- empty sheet: deleted at once, no dialog ----
    await openMenu(menuButton(1)); await choose()
    await until(() => tabs().length === 2, 'empty sheet was not deleted')
    assert.equal(dialog(), null, 'no confirmation for an empty sheet')
    assert.deepEqual(env.studio.board.sheets('p').map(sheet => sheet.id), [first, full])
    // ---- sheet with strokes: a dialog with number, title and count; cancel keeps it ----
    await openMenu(menuButton(1)); await choose()
    await until(() => !!dialog(), 'no confirmation dialog for a sheet with strokes')
    assert.equal(dialog()!.querySelector('h2')!.textContent, S.board.removeTitle(2, '白板 3'))
    assert.equal(dialog()!.querySelector('p')!.textContent, S.board.removeBody(2))
    const button = (label: string) => [...dialog()!.querySelectorAll('button')].find(node => node.textContent === label)!
    await act(async () => button(S.board.removeCancel).click())
    await until(() => !dialog(), 'cancel did not close the dialog')
    assert.equal(env.studio.board.sheets('p').length, 2)
    // ---- confirm: gone, and the selection (it was the selected sheet) moves to the neighbour, here and on the service ----
    await openMenu(menuButton(1)); await choose()
    await until(() => !!dialog(), 'dialog did not reopen')
    await act(async () => button(S.board.removeConfirm).click())
    await until(() => !dialog() && view.board.sheets.length === 1, 'confirmed delete did not finish')
    assert.equal(view.board.selected, first)
    assert.equal((await env.api.sheets('p')).selected, first)
    assert.equal(view.board.error, '')
    // ---- one sheet: the strip stays, one tab (glyph + 1) with its own menu ----
    await until(() => tabs().length === 1, 'the lone sheet lost its tab')
    assert.equal(tabs()[0]!.querySelector('.board-tab-number')!.textContent, '1')
    assert.ok(tabs()[0]!.querySelector('svg'), 'the board glyph')
    assert.equal(document.querySelector('.board-sheet-more'), null, 'no lone menu beside ＋')
    await openMenu(menuButton(0)); await choose()
    await until(() => view.board.sheets.length === 0, 'the last sheet was not deleted')
    assert.equal(view.board.selected, null)
    assert.ok(document.querySelector('.board-easel') && !document.querySelector('.board-empty'), 'the no-board state: the easel and no line')
  } finally { await view.unmount(); await env.close() }
})

test('R17 run target: its menu item is disabled with the reason in title; other tabs stay enabled', async () => {
  const element = document.createElement('div'); document.body.append(element)
  const root = createRoot(element)
  const sheet = (id: string, title: string, ord: number): Sheet => ({ id, topicId: 't', title, state: 'live', used: 0, ord, createdAt: '', updatedAt: '' })
  const sheets = [sheet('a', '主题', 1), sheet('b', '白板 2', 2)]
  const board: BoardState = { sheets, writable: 'b', selected: 'b', target: 'a', error: '', scene: { sheet: sheets[1]!, elements: [], ops: [], erasures: [], viewport: null, changed: false }, refresh() {}, select() {},
    async createSheet() {}, report() {}, async remove() { throw new Error('a disabled item must not delete') }, async restore() {}, async dismiss() {}, async locate() { return { kind: 'unknown' as const } } }
  const api = new LumenApi({ baseUrl: 'http://127.0.0.1:9', token: 'unused-in-component-tests-000000' })
  try {
    await act(async () => root.render(createElement(Board, { api, board, drawing: 'new', focus: null, sediment: sedimentStub, invite: null })))
    assert.ok(tabs()[0]!.querySelector('.board-tab-dot'), 'the dot marks the target')
    await openMenu(menuButton(0))
    assert.ok(item()!.hasAttribute('data-disabled') || item()!.getAttribute('aria-disabled') === 'true', 'disabled on the target')
    assert.equal(item()!.getAttribute('title'), S.board.removeBusy)
    await act(async () => item()!.click())
    await act(async () => { document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    await until(() => !item(), 'menu did not close')
    await openMenu(menuButton(1))
    assert.ok(!item()!.hasAttribute('data-disabled') && item()!.getAttribute('aria-disabled') !== 'true', 'another sheet can be deleted')
    assert.equal(item()!.getAttribute('title'), null)
  } finally { await act(async () => root.unmount()); element.remove() }
})

test('R17 cards and older services: a card whose element left shows the notice and moves nothing; a card to another sheet selects it; an older service says deletion is unsupported and the board keeps working', { timeout: 60000 }, async () => {
  let legacy = false
  // An older service: no delete route and no element lookup, answered the way Hono answers a route it does not have (plain-text 404)
  const env = await service((path, method) => legacy && (method === 'DELETE' || /\/lumen\/topics\/[^/]+\/elements\//.test(path)) ? new Response('404 Not Found', { status: 404 }) : null)
  const view = mount(env.api, 'p')
  try {
    ensureTopic(env.http, 'p', '反馈')
    const first = env.studio.board.sheets('p')[0]!.id, second = env.studio.board.createSheet('p').id, third = env.studio.board.createSheet('p').id
    env.studio.board.canvas.save(first, [stroke('kept')])
    env.studio.board.canvas.save(second, [stroke('doomed')])
    env.studio.board.canvas.save(third, [stroke('elsewhere')])
    env.studio.board.deleteSheet('p', second, { confirmed: true, busy: new Set(), since: new Date().toISOString() })
    env.studio.board.select('p', first)
    await view.render()
    await until(() => view.board.sheets.length === 2 && view.board.scene?.sheet.id === first, 'board did not load')
    const notice = () => document.querySelector('.board-notice')
    // ---- card into the deleted sheet: the notice, no error, the board stays where it was ----
    await view.card('doomed')
    await until(() => !!notice(), 'no notice for a card into a deleted sheet')
    assert.equal(notice()!.textContent, S.board.elementGone)
    assert.equal(notice()!.getAttribute('role'), 'status')
    assert.deepEqual([view.board.selected, view.board.error], [first, ''])
    assert.equal(document.querySelector<HTMLElement>('.board-canvas')!.dataset.focus, '', 'no jump to another element')
    // ---- a card to an element on this sheet: no notice, the canvas gets it ----
    await view.card('kept')
    await until(() => document.querySelector<HTMLElement>('.board-canvas')?.dataset.focus === 'kept', 'the canvas did not get the element')
    assert.equal(notice(), null)
    // ---- a card to an element on another sheet: that sheet opens with the element ----
    await view.card('elsewhere')
    await until(() => view.board.selected === third && document.querySelector<HTMLElement>('.board-canvas')?.dataset.sheet === third, 'the card did not open its sheet')
    await until(() => document.querySelector<HTMLElement>('.board-canvas')?.dataset.focus === 'elsewhere', 'the other sheet\'s canvas did not get the element')
    await act(async () => view.board.select(first))
    await until(() => view.board.scene?.sheet.id === first, 'did not return to the first sheet')
    // ---- older service: deleting says it is unsupported; card lookups give no false notice ----
    legacy = true
    await openMenu(menuButton(0)); await choose()
    await until(() => view.board.error === S.board.removeUnsupported, 'no unsupported message')
    assert.equal(document.querySelector('.board-error')!.textContent, S.board.removeUnsupported)
    assert.equal(view.board.sheets.length, 2, 'nothing deleted locally either')
    assert.equal(dialog(), null)
    await view.card('doomed')
    await act(async () => { await delay(200) })
    assert.equal(notice(), null, 'an older service cannot tell, so no notice')
    assert.ok(view.board.scene, 'the board keeps showing its sheet')
  } finally { await view.unmount(); await env.close() }
})

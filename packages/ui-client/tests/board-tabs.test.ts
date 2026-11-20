/**
 * [INPUT]: Real Board component and useBoard hook (React DOM + jsdom); a real HTTP service with Mastra Controller for the selection round trip
 * [OUTPUT]: R16 UI evidence: which tab opens (initialSelection); tabs are a board glyph plus a number with the full title in title/aria-label (one sheet too, V8);
 *           the strip is its own row under the canvas; each selected sheet gets its own canvas (read-only when folded); a canvas that cannot open leaves one line;
 *           V0: the easel on a live sheet with no stroke, gone when the AI draws on that sheet, a stroke lands or an op waits, never on a folded sheet;
 *           folded tabs dimmed; the drawing dot sits on the run target while another sheet is shown; a folded selection says the AI won't write there;
 *           the selection persists through a reload, ＋ selects the new sheet, an older service without the route (404/405) still switches tabs locally,
 *           any other failure to store the pick reaches board.error and survives board reads until a later pick is stored
 * [POS]: Component wiring and the real service round trip; the canvas is the stand-in of helpers/canvas-stub.mjs (jsdom cannot paint); real layout (no wrap,
 *        horizontal scroll with 12 sheets, no overlap with Excalidraw's toolbar) is checked in the browser assertions
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
import { LumenApi, type CanvasElement, type CanvasScene, type Sheet, type SheetList } from '../src/mastra/data/client.ts'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
for (const name of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'DocumentFragment', 'MutationObserver', 'getComputedStyle', 'navigator']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name as keyof typeof dom.window] })
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } })
after(() => dom.window.close())
register('./helpers/tsx-loader.mjs', import.meta.url)
register('./helpers/canvas-stub.mjs', import.meta.url)
const { createRoot } = await import('react-dom/client')
const { Board } = await import('../src/mastra/studio/Board.tsx')
const { useBoard, initialSelection } = await import('../src/mastra/studio/useBoard.ts')
const S = (await import('./helpers/zh.ts')).zh.studio
type BoardState = ReturnType<typeof useBoard>

async function until(check: () => boolean | Promise<boolean>, message: string, ms = 10000) {
  const limit = Date.now() + ms
  while (!await check()) {
    if (Date.now() > limit) throw new Error(message)
    await act(async () => { await delay(20) })
  }
}

const sheet = (id: string, title: string, ord: number, state: Sheet['state'] = 'live'): Sheet =>
  ({ id, topicId: 't', title, state, used: 0, ord, createdAt: '', updatedAt: '' })
const scene = (of: Sheet, elements: CanvasElement[] = [], ops: CanvasScene['ops'] = []): CanvasScene => ({ sheet: of, elements, ops, erasures: [], viewport: null, changed: false })
const api = new LumenApi({ baseUrl: 'http://127.0.0.1:9', token: 'unused-in-component-tests-000000' })
const actions = { error: '', refresh() {}, select() {}, async createSheet() {}, report() {}, async remove() { return null }, async restore() {}, async dismiss() {}, async locate() { return { kind: 'unknown' as const } } }

const sedimentStub = { items: [], offers: [], unsupported: false, error: '', revConflict: false, refresh() {}, async create() { return true }, async confirm() { return true }, async dismiss() {}, async edit() { return true }, async remove() { return true } }

test('initialSelection: the user\'s pick in this view, else the service selection, else the newest live sheet (older service)', () => {
  const items = [sheet('a', '主题', 1), sheet('b', '白板 2', 2), sheet('c', '白板 3', 3)]
  const list = (extra: Partial<SheetList>): SheetList => ({ items, writable: 'c', ...extra })
  assert.equal(initialSelection(list({ selected: 'b', target: null }), null, false), 'b', 'opens on the stored selection')
  assert.equal(initialSelection(list({ selected: 'b' }), 'a', true), 'a', 'a pinned pick survives a refresh')
  assert.equal(initialSelection(list({ selected: 'b' }), 'gone', true), 'b', 'a pinned pick that no longer exists yields to the service')
  assert.equal(initialSelection(list({}), null, false), 'c', 'older service: newest live sheet')
  assert.equal(initialSelection(list({ selected: 'zzz' }), null, false), 'c', 'unknown selection falls back')
  assert.equal(initialSelection({ items: [sheet('a', '主题', 1, 'folded')], writable: null }, null, false), 'a', 'no live sheet: the last one')
})

test('Board tabs: glyph + number, full title in title/aria-label, folded dimmed, drawing dot on the run target while viewing another sheet', async () => {
  const element = document.createElement('div'); document.body.append(element)
  const root = createRoot(element)
  const sheets = [sheet('a', '自注意力为什么能取代循环', 1), sheet('b', '白板 2', 2, 'folded'), sheet('c', '白板 3', 3)]
  const state = (patch: Partial<BoardState>): BoardState => ({ sheets, writable: 'c', selected: 'c', target: null, ...actions,
    scene: scene(sheets.find(item => item.id === (patch.selected ?? 'c'))!), ...patch })
  const render = (board: BoardState, drawing: string | null) => act(async () => root.render(createElement(Board, { api, board, drawing, focus: null, sediment: sedimentStub, invite: null })))
  const tabs = () => [...element.querySelectorAll<HTMLButtonElement>('.board-tabs .board-tab > button:first-child')]
  try {
    await render(state({ target: 'a' }), 'new')
    assert.deepEqual(tabs().map(tab => tab.textContent), ['1', '2', '3'], 'numbers, not titles')
    assert.ok(tabs().every(tab => tab.firstElementChild!.matches('svg.lumen-icon')), 'each tab leads with the board glyph')
    assert.deepEqual(tabs().map(tab => tab.title), ['自注意力为什么能取代循环', `白板 2 · ${S.board.folded}`, '白板 3'])
    assert.deepEqual(tabs().map(tab => tab.getAttribute('aria-label')), [`自注意力为什么能取代循环 · ${S.board.drawing}`, `白板 2 · ${S.board.folded}`, '白板 3'])
    assert.deepEqual(tabs().map(tab => [tab.className, tab.getAttribute('aria-pressed')]), [['', 'false'], ['is-folded', 'false'], ['on', 'true']])
    // ---- the dot marks where the AI writes (sheet 1) while the user looks at sheet 3 ----
    assert.deepEqual(tabs().map(tab => !!tab.querySelector('.board-tab-dot')), [true, false, false])
    assert.equal(tabs()[0]!.dataset.writing, 'true')
    assert.ok(element.querySelector('.board-drawing'), 'the existing drawing banner is unchanged')
    // ---- no drawing, no dot; no target, no dot ----
    await render(state({ target: 'a' }), null)
    assert.equal(element.querySelectorAll('.board-tab-dot').length, 0)
    await render(state({ target: null }), 'new')
    assert.equal(element.querySelectorAll('.board-tab-dot').length, 0)
    // ---- a folded selection: AI won't write here ----
    await render(state({ selected: 'b' }), null)
    assert.equal(tabs()[1]!.className, 'on is-folded')
    assert.equal(element.querySelector('.board-hint')!.textContent, S.board.foldedHint)
    await until(() => element.querySelector<HTMLElement>('.board-canvas')?.dataset.readonly === 'true', 'a folded sheet is not read-only')
    assert.equal(element.querySelector<HTMLElement>('.board-canvas')!.dataset.sheet, 'b')
    await render(state({ selected: 'c' }), null)
    assert.equal(element.querySelector('.board-hint'), null, 'a live selection shows no hint')
    await until(() => element.querySelector<HTMLElement>('.board-canvas')?.dataset.sheet === 'c', 'the selected sheet has no canvas')
    assert.equal(element.querySelector<HTMLElement>('.board-canvas')!.dataset.readonly, 'false')
    // ---- the strip is the board's last row, under the canvas, never an overlay on it ----
    assert.equal(element.querySelector('.studio-board')!.lastElementChild!.matches('nav.board-sheets'), true)
    assert.equal(element.querySelector('.board-viewport nav'), null)
    // ---- one sheet: the same strip with one tab (glyph + 1), so one and many look alike ----
    await render(state({ sheets: [sheets[0]!], selected: 'a', scene: scene(sheets[0]!) }), null)
    assert.equal(tabs().length, 1)
    assert.deepEqual([tabs()[0]!.textContent, !!tabs()[0]!.querySelector('svg'), tabs()[0]!.className], ['1', true, 'on'])
    // ---- twelve sheets: twelve tabs in one strip ----
    const many = Array.from({ length: 12 }, (_, index) => sheet(`s${index}`, `白板 ${index + 1}`, index + 1))
    await render(state({ sheets: many, selected: 's11', scene: scene(many[11]!) }), null)
    assert.deepEqual(tabs().map(tab => tab.textContent), many.map((_, index) => String(index + 1)))
  } finally { await act(async () => root.unmount()); element.remove() }
})

test('V0: the easel stands on a live sheet with no stroke and leaves when the AI starts drawing there, a stroke lands or an op waits', async () => {
  const element = document.createElement('div'); document.body.append(element)
  const root = createRoot(element)
  const blank = sheet('a', '白板 1', 1), other = sheet('b', '白板 2', 2)
  const stroke = { id: 's1', type: 'freedraw', version: 1, isDeleted: false } as CanvasElement
  const pending = { id: 'op1', kind: 'draw' as const, title: '一笔', skeletons: [], patches: [], ids: ['a1'], threadId: null, runId: null, createdAt: '' }
  const state = (patch: Partial<BoardState>): BoardState => ({ sheets: [blank, other], writable: 'a', selected: 'a', target: null, ...actions, scene: scene(blank), ...patch })
  const render = (board: BoardState, drawing: string | null) => act(async () => root.render(createElement(Board, { api, board, drawing, focus: null, sediment: sedimentStub, invite: null })))
  const easel = () => !!element.querySelector('.board-easel')
  try {
    await render(state({}), null)
    await until(() => !!element.querySelector('.board-canvas'), 'no canvas')
    assert.ok(easel(), 'a blank live sheet shows the easel')
    assert.equal(element.querySelector('.board-empty'), null, 'no line of explanation beside it')
    await render(state({ target: 'a' }), 'new')
    assert.ok(!easel(), 'the AI drawing on this sheet removes it')
    await render(state({ target: 'b' }), 'new')
    assert.ok(easel(), 'drawing on another sheet leaves it')
    await render(state({ scene: scene(blank, [{ ...stroke, isDeleted: true }]) }), null)
    assert.ok(easel(), 'an erased stroke leaves the sheet blank')
    await render(state({ scene: scene(blank, [stroke]) }), null)
    await until(() => !easel(), 'a stroke did not remove it')
    await render(state({ scene: scene(blank, [], [pending]) }), null)
    await until(() => !easel(), 'an op waiting to land did not remove it')
    await render(state({ sheets: [{ ...blank, state: 'folded' }, other], scene: scene({ ...blank, state: 'folded' }) }), null)
    assert.ok(!easel(), 'a folded sheet keeps its hint, not the easel')
  } finally { await act(async () => root.unmount()); element.remove() }
})

test('a canvas that cannot open leaves one line in its place; the strip stays and another sheet gets a fresh try', async () => {
  const element = document.createElement('div'); document.body.append(element)
  const root = createRoot(element)
  const sheets = [sheet('a', '白板 1', 1), sheet('b', '白板 2', 2)]
  const state = (selected: string): BoardState => ({ sheets, writable: 'a', selected, target: null, ...actions, scene: scene(sheets.find(item => item.id === selected)!) })
  const render = (board: BoardState) => act(async () => root.render(createElement(Board, { api, board, drawing: null, focus: null, sediment: sedimentStub, invite: null })))
  const errors = console.error
  try {
    console.error = () => {}
    ;(globalThis as { __canvasStubFails?: string }).__canvasStubFails = 'chunk missing'
    await render(state('a'))
    await until(() => !!element.querySelector('.board-error'), 'no line in the canvas place')
    assert.equal(element.querySelector('.board-error')!.textContent, S.board.canvasFailed('chunk missing'))
    assert.equal(element.querySelectorAll('.board-tabs .board-tab').length, 2, 'the strip stays')
    delete (globalThis as { __canvasStubFails?: string }).__canvasStubFails
    await render(state('b'))
    await until(() => element.querySelector<HTMLElement>('.board-canvas')?.dataset.sheet === 'b', 'another sheet did not get a fresh canvas')
    assert.equal(element.querySelector('.board-error'), null)
  } finally { console.error = errors; delete (globalThis as { __canvasStubFails?: string }).__canvasStubFails; await act(async () => root.unmount()); element.remove() }
})

test('useBoard against the real service: the selection persists through a reload, ＋ selects the new sheet; an older service without the route (404/405) still switches locally; other failures reach board.error', { timeout: 60000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-board-tabs-')), token = 'board-tabs-token-at-least-24-characters'
  const fixture = fixtureProvider(() => textReply('好'))
  const service = await createHttpService({ dataRoot, token, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  let legacy = false, failure: 405 | 500 | null = null
  // An older service: no selection route, and the sheet list has no selected/target fields. failure: the selection PUT answers with that status
  const server = serve({ hostname: '127.0.0.1', port: 0, fetch: async request => {
    const path = new URL(request.url).pathname
    if (legacy && path.endsWith('/selection')) return Response.json({ error: 'Not Found' }, { status: 404 })
    if (failure && path.endsWith('/selection')) return Response.json({ error: failure === 500 ? '写入失败' : 'Method Not Allowed' }, { status: failure })
    const response = await service.app.fetch(request)
    if (!legacy || !/\/sheets$/.test(path) || request.method !== 'GET') return response
    const { items, writable } = await response.json() as SheetList
    return Response.json({ items, writable })
  } })
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const api = new LumenApi({ baseUrl: `http://127.0.0.1:${address.port}`, token })
  let board!: BoardState
  function Probe() { board = useBoard(api, 'p', '', false); return null }
  const element = document.createElement('div'); document.body.append(element)
  let root = createRoot(element)
  const mount = async () => { root = createRoot(element); await act(async () => root.render(createElement(Probe))) }
  try {
    ensureTopic(service, 'p', '反馈')
    const second = (await api.createSheet('p')).id, third = (await api.createSheet('p')).id
    await mount()
    await until(() => board.sheets.length === 3, 'sheets did not load')
    assert.equal(board.selected, third, 'opens on the service selection (the last ＋)')
    await act(async () => board.select(second))
    assert.equal(board.selected, second, 'the tab switches at once')
    await until(async () => (await api.sheets('p')).selected === second, 'selection not stored on the service')
    // ---- reload: unmount and mount again ----
    await act(async () => root.unmount()); await mount()
    await until(() => board.sheets.length === 3 && board.selected === second, 'reload did not reopen the stored selection')
    // ---- ＋ ----
    await act(async () => board.createSheet())
    await until(() => board.sheets.length === 4, 'new sheet not listed')
    const fourth = board.sheets.at(-1)!.id
    assert.equal(board.selected, fourth)
    assert.equal((await api.sheets('p')).selected, fourth, 'the service also selects the new sheet')
    // ---- older service: the selection call fails quietly, the tab still switches, no error on the board ----
    legacy = true
    await act(async () => root.unmount()); await mount()
    await until(() => board.sheets.length === 4, 'legacy list did not load')
    assert.equal(board.target, null)
    await act(async () => board.select(second))
    await act(async () => { await delay(100) })
    assert.equal(board.selected, second)
    assert.equal(board.error, '', 'a missing selection route must not break the board')
    assert.ok(board.scene === null || board.scene.sheet.id === second)
    // ---- current service, route answers 405: also treated as a missing route ----
    legacy = false; failure = 405
    await act(async () => board.select(third))
    await act(async () => { await delay(100) })
    assert.deepEqual([board.selected, board.error], [third, ''])
    // ---- any other failure: the tab shown and the AI's next sheet differ, so the board says so, and a later board read does not hide it ----
    failure = 500
    await act(async () => board.select(fourth))
    await until(() => board.error !== '', 'a failed selection was swallowed')
    assert.equal(board.error, `${S.board.selectFailed}写入失败`)
    assert.equal(board.selected, fourth, 'the tab still shows what the user picked')
    await act(async () => board.refresh())
    await until(() => board.scene?.sheet.id === fourth, 'board read did not complete')
    assert.equal(board.error, `${S.board.selectFailed}写入失败`, 'a successful read keeps the selection error')
    // ---- the next stored pick clears it ----
    failure = null
    await act(async () => board.select(second))
    await until(() => board.error === '', 'a stored pick did not clear the error')
    assert.equal((await api.sheets('p')).selected, second)
  } finally {
    await act(async () => root.unmount()); element.remove()
    server.close(); await service.close(); await rm(dataRoot, { recursive: true, force: true })
  }
})

test('LumenApi.selectSheet: 404/405 mean an older service (null); other statuses and network failures throw', async () => {
  const statuses = [404, 405, 500, 409]
  const server = serve({ hostname: '127.0.0.1', port: 0, fetch: () => Response.json({ error: '服务说不行' }, { status: statuses.shift()! }) })
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  try {
    const api = new LumenApi({ baseUrl: `http://127.0.0.1:${address.port}`, token: 'board-tabs-token-at-least-24-characters' })
    assert.equal(await api.selectSheet('p', 's'), null)
    assert.equal(await api.selectSheet('p', 's'), null)
    await assert.rejects(api.selectSheet('p', 's'), (error: Error & { status?: number }) => error.message === '服务说不行' && error.status === 500)
    await assert.rejects(api.selectSheet('p', 's'), (error: Error & { status?: number }) => error.status === 409)
  } finally { server.close() }
  // ---- nothing listening: the fetch failure is not mistaken for a missing route ----
  const closed = serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('') })
  if (!closed.listening) await new Promise<void>(resolve => closed.once('listening', resolve))
  const port = (closed.address() as { port: number }).port
  await new Promise<void>(resolve => closed.close(() => resolve()))
  await assert.rejects(new LumenApi({ baseUrl: `http://127.0.0.1:${port}`, token: 'board-tabs-token-at-least-24-characters' }).selectSheet('p', 's'))
})

/**
 * [INPUT]: Real Board component and useBoard hook (React DOM + jsdom); a real HTTP service with Mastra Controller for the selection round trip
 * [OUTPUT]: R16 UI evidence: which tab opens (initialSelection); tabs are a board glyph plus a number with the full title in title/aria-label;
 *           folded tabs dimmed; the drawing dot sits on the run target while another sheet is shown; a folded selection says the AI won't write there;
 *           the selection persists through a reload, ＋ selects the new sheet, an older service without the route (404/405) still switches tabs locally,
 *           any other failure to store the pick reaches board.error and survives board reads until a later pick is stored
 * [POS]: Component wiring and the real service round trip; real layout (no wrap, horizontal scroll with 12 sheets) is checked in the browser assertions
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
import { LumenApi, type Sheet, type SheetList } from '../src/mastra/data/client.ts'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
for (const name of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'DocumentFragment', 'MutationObserver', 'getComputedStyle', 'navigator']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name as keyof typeof dom.window] })
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } })
after(() => dom.window.close())
register('./helpers/tsx-loader.mjs', import.meta.url)
const { createRoot } = await import('react-dom/client')
const { Board } = await import('../src/mastra/studio/Board.tsx')
const { useBoard, initialSelection } = await import('../src/mastra/studio/useBoard.ts')
const { STUDIO_COPY: S } = await import('../src/copy/studioCopy.ts')
type BoardState = ReturnType<typeof useBoard>

async function until(check: () => boolean | Promise<boolean>, message: string, ms = 10000) {
  const limit = Date.now() + ms
  while (!await check()) {
    if (Date.now() > limit) throw new Error(message)
    await act(async () => { await delay(20) })
  }
}

const sheet = (id: string, title: string, ord: number, state: Sheet['state'] = 'live'): Sheet =>
  ({ id, topicId: 't', title, state, capacity: 8, used: 0, ord, createdAt: '', updatedAt: '' })

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
  const state = (patch: Partial<BoardState>): BoardState => ({ sheets, writable: 'c', selected: 'c', target: null, error: '', refresh() {}, select() {}, async createSheet() {},
    view: { sheet: sheets.find(item => item.id === (patch.selected ?? 'c'))!, blocks: [] }, ...patch })
  const render = (board: BoardState, drawing: string | null) => act(async () => root.render(createElement(Board, { board, materials: [], drawing, focus: null, onOpenSource() {} })))
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
    await render(state({ selected: 'c' }), null)
    assert.equal(element.querySelector('.board-hint'), null, 'a live selection shows no hint')
    // ---- one sheet: no tab strip, as before ----
    await render(state({ sheets: [sheets[0]!], selected: 'a', view: { sheet: sheets[0]!, blocks: [] } }), null)
    assert.equal(element.querySelector('.board-tabs'), null)
    // ---- twelve sheets: twelve tabs in one strip ----
    const many = Array.from({ length: 12 }, (_, index) => sheet(`s${index}`, `白板 ${index + 1}`, index + 1))
    await render(state({ sheets: many, selected: 's11', view: { sheet: many[11]!, blocks: [] } }), null)
    assert.deepEqual(tabs().map(tab => tab.textContent), many.map((_, index) => String(index + 1)))
  } finally { await act(async () => root.unmount()); element.remove() }
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
    assert.ok(board.view === null || board.view.sheet.id === second)
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
    await until(() => board.view?.sheet.id === fourth, 'board read did not complete')
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

/**
 * [INPUT]: the real StudioApp (takeaways view/invite row/settings habits pane) and the real Board component, React DOM, a real HTTP service with the Mastra Controller,
 *          a deterministic model (draws on the canvas, invites pointing at its elements, quotes back), the canvas stand-in (helpers/canvas-stub.mjs) with the service fixture laying ops out
 * [OUTPUT]: component evidence for P1-1 on the canvas: the view and its empty state (S8), the invite row under the canvas with its question, skip, and its return on a newer invite (S9c),
 *           a refused create keeping the typed line (S10); the offer's strikethrough restore/re-delete and keep as a quoted entry with the original expandable (S9);
 *           a link to an old block (retired with the canvas) shows its title only and a click changes nothing; the R17 dialog carrying the affected takeaway count and the
 *           deleted chip after it (S3); the speech-habits list and per-line delete in settings (S14), and the English catalog render
 * [POS]: P1-1's UI mechanism acceptance; the controllable model proves mechanism only and never stands in for real-model acceptance; no WebKit coverage claimed
 *        Each sprite turn waits until it is over as the person sees it (model done, service idle, conversation connected with Send back), never on the polled topic light alone
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
import { LumenApi, type CanvasScene, type Sheet } from '../src/mastra/data/client.ts'
import { layOut, legacyBlock } from '../../mastra-service/tests/studio/canvas-fixtures.ts'
import { zh } from './helpers/zh.ts'
const S = zh.studio

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
for (const name of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Element', 'Node', 'NodeFilter', 'Text', 'DocumentFragment', 'MutationObserver', 'localStorage', 'getComputedStyle', 'navigator']) {
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
const { Board } = await import('../src/mastra/studio/Board.tsx')

const token = 'ui-sediment-token-at-least-24-characters'
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
const said = (request: ProviderRequest) => {
  const lastUser = request.messages.map(message => message.role).lastIndexOf('user')
  return { text: JSON.stringify(request.messages[lastUser]), results: request.messages.slice(lastUser).filter(message => message.role === 'tool').length }
}
/** Element ids from the latest board_draw results on the model side (refusals are plain text and are skipped). */
const drawnIds = (request: ProviderRequest) => {
  for (const message of [...request.messages].reverse()) if (message.role === 'tool') {
    try { const parsed = JSON.parse(String(message.content)) as { ids?: string[] }; if (parsed.ids) return parsed.ids } catch { /* refusal text */ }
  }
  return []
}
async function until(check: () => boolean | Promise<boolean>, message: string, ms = 20000) {
  const limit = Date.now() + ms
  while (!await check()) {
    if (Date.now() > limit) throw new Error(message)
    await delay(20)
  }
}

test('S9c/S10 组件级：邀请行带问题、跳过与新邀请回返、别的白板的邀请不显示、建条失败保字', { timeout: 30000 }, async () => {
  const element = document.createElement('div'); document.body.append(element)
  const root = createRoot(element)
  const sheet: Sheet = { id: 's1', topicId: 'attn', title: '白板 1', state: 'live', used: 1, ord: 1, createdAt: '', updatedAt: 'v1' }
  const scene: CanvasScene = { sheet, elements: [{ id: 'a1', type: 'rectangle', version: 1 }], ops: [], erasures: [], viewport: null, changed: false }
  const board = {
    sheets: [sheet], writable: 's1', selected: 's1', target: null, scene, error: '',
    select() {}, async createSheet() {}, report() {}, async remove() { return null }, async restore() {}, async dismiss() {}, async locate() { return { kind: 'unknown' as const } }, refresh() {},
  }
  const base = {
    items: [], offers: [], unsupported: false, error: '', revConflict: false, refresh() {},
    async confirm() { return true }, async dismiss() {}, async edit() { return true }, async remove() { return true },
  }
  let failing = false
  const created: string[] = []
  // A stateful stub: a failed create writes the error back like the real hook does (that is what the component sees)
  const { useState: useLocalState } = await import('react')
  const api = new LumenApi({ baseUrl: 'http://127.0.0.1:9', token: 'unused-in-component-tests-000000' })
  const Harness = ({ invite }: { invite: typeof first | null }) => {
    const [sediment, setSediment] = useLocalState({ ...base })
    const withFailure = { ...sediment, async create(input: { text: string }) {
      if (!failing) { created.push(input.text); return true }
      setSediment({ ...sediment, error: '没存上' })
      return false
    } }
    return createElement(Board, { api, board, drawing: null, focus: null, sediment: withFailure, invite })
  }
  const first = { sheetId: 's1', elementIds: ['a1'], question: '对齐是在做什么，用你自己的话说？', threadId: null, runId: null, createdAt: 't1' }
  const $ = <T extends Element = HTMLElement>(selector: string) => element.querySelector<T & HTMLElement>(selector)
  const type = async (text: string) => {
    const input = $('.sediment-input') as HTMLInputElement
    await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, text); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })) })
    await act(async () => $('.sediment-compose')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })))
  }
  try {
    await act(async () => root.render(createElement(Harness, { invite: null })))
    assert.equal($('.board-sediment-row'), null, '没有邀请就没有行（白板不再有「写满」）')
    await act(async () => root.render(createElement(Harness, { invite: first })))
    // ---- The invite row: the question + input + skip, under the canvas ----
    assert.ok($('.board-sediment-row'), '邀请时行出现')
    assert.match($('.board-sediment-invite')!.textContent!, /对齐是在做什么/)
    assert.ok($('.sediment-input'), '单行输入在')
    assert.equal($('.board-viewport .board-sediment-row'), null, '行在画布下面，不盖在画布上')
    // ---- Skip hides it; a newer invite brings it back ----
    await act(async () => [...element.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === S.sediment.skip)!.click())
    assert.ok(!$('.board-sediment-row'), '跳过后收起')
    const second = { ...first, question: '换个说法：对齐让什么靠近？', createdAt: 't2' }
    await act(async () => root.render(createElement(Harness, { invite: second })))
    assert.match($('.board-sediment-invite')!.textContent!, /换个说法/, 'AI 再问一次，行回来')
    // ---- An invite for another sheet is not this sheet's row ----
    await act(async () => root.render(createElement(Harness, { invite: { ...second, sheetId: 'other' } })))
    assert.equal($('.board-sediment-row'), null)
    // ---- A refused create keeps the typed line (S10); a kept one closes the row ----
    await act(async () => root.render(createElement(Harness, { invite: second })))
    failing = true
    await type('对齐让相关的词互相靠近')
    await until(() => $('.board-sediment-row .mw-error') !== null, '失败要报错')
    assert.equal($('.board-sediment-row .mw-error')!.textContent, '没存上')
    assert.equal(($('.sediment-input') as HTMLInputElement).value, '对齐让相关的词互相靠近', 'S10：失败后已打的字还在')
    failing = false
    await type('对齐让相关的词互相靠近')
    await until(() => !$('.board-sediment-row'), '存下后行收起')
    assert.deepEqual(created, ['对齐让相关的词互相靠近'], '只存用户自己打的字')
  } finally {
    await act(async () => root.unmount())
    element.remove()
  }
})

test('S8/S9/S14 全流程：精灵画→邀请指着它画的元素→跳过与再邀请；邀请行写下一条；报价单删除线与留下；旧块链接只显示标题；R17 确认框带条目数与删板提示；习惯页', { timeout: 180000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-ui-sediment-'))
  let calls = 0
  const call = (name: string, args: unknown) => toolReply(name, args, `call-${++calls}`)
  // Counts the model's final text replies: each closes a turn on the model side (see turn below)
  let replies = 0
  const fixture = fixtureProvider((request: ProviderRequest) => {
    const reply = respond(request)
    if (!reply.call) replies++
    return reply
  })
  // The element ids the draw came back with: the invite points at them once the app has laid them out
  let invited: string[] = []
  function respond(request: ProviderRequest) {
    if (said(request).text.includes('邀请') && !invited.length) invited = drawnIds(request)
    const { text, results } = said(request)
    if (text.includes('画一下')) return results ? textReply('画好了') : call('board_draw', { title: '查询与键', elements: [
      { type: 'rectangle', x: 0, y: 0, width: 160, height: 60, label: { text: '查询' } }, { type: 'rectangle', x: 300, y: 0, width: 160, height: 60, label: { text: '键' } }] })
    if (text.includes('再邀请')) return results ? textReply('再问一次') : call('sediment_invite', { question: '换个说法：对齐让什么靠近？' })
    if (text.includes('邀请')) return results ? textReply('等你写一句') : call('sediment_invite', { elementIds: invited, question: '对齐是在做什么，用你自己的话说？' })
    if (text.includes('递回')) return results ? textReply('给你递回去了') : call('sediment_quote', { text: '注意力就是把查询和键对齐' })
    return textReply('好')
  }
  const service = await createHttpService({ dataRoot, token, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  const server = serve({ hostname: '127.0.0.1', port: 0, fetch: request => service.app.fetch(request) })
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const connection = { baseUrl: `http://127.0.0.1:${address.port}`, token }
  const api = new LumenApi(connection)
  ensureTopic(service, 'attn', '注意力为什么能对齐')
  const original = window.setInterval
  window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => timeout === 5000 ? 0 : original.call(window, handler, timeout, ...args)) as typeof window.setInterval
  localStorage.clear()
  const element = document.createElement('div'); document.body.append(element)
  const root = createRoot(element)
  const $ = <T extends Element = HTMLElement>(selector: string) => element.querySelector<T & HTMLElement>(selector)
  const $$ = (selector: string) => [...element.querySelectorAll<HTMLElement>(selector)]
  const tab = (view: keyof typeof S.views) => $$('.studio-views [role=tab]').find(node => node.getAttribute('aria-label') === S.views[view])!
  const button = (name: string) => [...element.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === name || item.getAttribute('aria-label') === name)
  const click = async (name: string) => { const target = button(name); assert.ok(target, `未找到按钮：${name}`); await act(async () => target!.click()) }
  const say = async (message: string) => {
    const input = $<HTMLTextAreaElement>('.sprite textarea')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')!.set!.call(input, message)
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
    await act(async () => $('.sprite form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })))
  }
  // A turn is over when the person can see it is: the model has given its final reply, the service no longer projects the conversation as running or waiting,
  // and the sprite's conversation is connected with Send offered again. Waiting on the topic light alone raced: the light follows a 3s poll, so right
  // after a send it is often not lit yet. And after the first message the sprite swaps the welcome card for the conversation and reconnects its feed;
  // a send typed during that reconnect now waits for it (sprite-send.test.ts), but a turn still means the person can type again
  const turn = async (message: string, label: string) => {
    const before = replies
    await say(message)
    await until(() => replies > before, `${label}：模型没有答完`)
    await until(async () => (await api.sessions('attn')).items.every(item => !item.running && !item.waiting), `${label}：服务端还在运行`)
    await until(() => !$('.topic .topic-light-running'), `${label}：运行灯没灭`)
    // The conversation view is up, connected (no 「连接中…」) and offers Send, not Stop
    await until(() => !$('.sprite-welcome') && !$('.sprite .mw-connection') && !!$('.sprite .composer-btn-send'), `${label}：精灵还没回到可发送`)
  }
  try {
    await act(async () => root.render(createElement(StudioApp, { connection })))
    await until(() => $$('.studio-views [role=tab]').length > 0, '视图导航没有出现')
    assert.equal(tab('reading').getAttribute('aria-selected'), 'true', 'Reading is the default view')
    await act(async () => tab('board').click())
    await until(() => !!$('.board-sheet-new'), '白板没有出现')
    // ---- The empty state is the press alone: no text, no 「写一条沉淀」 (S8 rework) ----
    await act(async () => tab('settled').click())
    await until(() => !!$('.sediment-press'), '空态是压花板')
    assert.equal($('.sediment-empty'), null, '空态没有说明句')
    assert.equal($('.sediment-keep'), null, '空态没有写一条沉淀')
    assert.equal($('.sediment-empty-view')!.querySelector('button'), null, '空态没有按钮')
    await act(async () => tab('board').click())
    // ---- Sprite: the first sentence is quote material, then fill the board ----
    await click(S.sprite.open)
    await until(() => !!$('.sprite textarea'), '精灵没有展开')
    await turn('我觉得那个注意力就是把查询和键对齐', '第一轮')
    await turn('画一下', '画这轮')
    // ---- The app lays the AI's op out and commits it (the canvas stand-in does not; the service fixture plays the app) ----
    const studio = service.application.studio, sheetId = studio.board.sheets('attn')[0]!.id
    await until(() => studio.board.canvas.ops(sheetId).length === 1, 'AI 的一笔没有排队')
    for (const pending of studio.board.canvas.ops(sheetId)) studio.board.canvas.commit(sheetId, pending.id, layOut(pending))
    assert.equal(studio.board.canvas.liveElements(sheetId).filter(row => row.author === 'ai').length, 4, '两个框和它们的字落在画布上')
    assert.equal($('.board-sediment-row'), null, '没有邀请就没有沉淀行')
    // ---- The invite points at the AI's elements; its question sits above the input (S9c) ----
    await turn('邀请', '邀请这轮')
    await until(() => !!$('.board-sediment-invite'), '邀请问题没有出现')
    assert.match($('.board-sediment-invite')!.textContent!, /对齐是在做什么/)
    assert.deepEqual((await api.sheetInvite(sheetId))!.elementIds, invited, '邀请指着 AI 刚画的元素')
    // ---- Skip hides it; the AI asking again brings it back ----
    await click(S.sediment.skip)
    await until(() => !$('.board-sediment-row'), '跳过后应收起')
    await turn('再邀请', '再邀请')
    await until(() => /换个说法/.test($('.board-sediment-invite')?.textContent ?? ''), '新邀请没有把行带回来')
    // ---- The row keeps one takeaway: the user's words only, no evidence link (blocks retired; canvas links are a later step) ----
    const input = $('.sediment-input') as HTMLInputElement
    await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, '对齐让相关的词互相靠近'); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })) })
    await act(async () => $('.sediment-compose')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })))
    await until(async () => (await api.sediment('attn'))?.items.length === 1, '条目没有落库')
    const stored = (await api.sediment('attn'))!.items[0]!
    assert.deepEqual([stored.text, stored.links.length], ['对齐让相关的词互相靠近', 0])
    // ---- It shows in the view (S8) ----
    await act(async () => tab('settled').click())
    await until(() => $$('.sediment-entry').length === 1, '视图里应出现条目')
    assert.ok($('.sediment-keep'), '有一条之后「写一条沉淀」回来')
    assert.equal($('.sediment-press'), null, '有一条之后压花板退场')
    // ---- The offer: strikethrough restore/re-delete, keep as a quoted entry, the original expands (S9) ----
    await act(async () => tab('settled').click())
    await turn('递回', '递回')
    await until(() => $$('.sediment-offer').length === 1, '报价单应出现在输入上方')
    const strike = $('.sediment-offer .sediment-strike') as HTMLButtonElement
    assert.ok(strike, '被删的字带删除线')
    await act(async () => strike.click())
    assert.ok($('.sediment-offer .sediment-strike')!.classList.contains('is-restored'), '点一下放回')
    await act(async () => $('.sediment-offer .sediment-strike')!.click())
    assert.ok(!$('.sediment-offer .sediment-strike')!.classList.contains('is-restored'), '再点一下再删')
    await click(S.sediment.offerKeep)
    await until(() => $$('.sediment-entry').length === 2, '确认后成为条目')
    await until(() => $$('.sediment-offer').length === 0, '报价单随之消失')
    const quoted = $$('.sediment-entry')[0]!
    assert.match(quoted.querySelector('.sediment-origin')!.textContent!, /原话/)
    await act(async () => quoted.querySelector('.sediment-origin')!.click())
    assert.ok($('.sediment-quote-original')!.textContent!.includes('我觉得那个注意力'), '原文可展开')
    // ---- An entry from before the canvas: its link points at an old block, which shows its title only; a click changes nothing ----
    const old = legacyBlock(studio.db, sheetId, { title: '旧的一块' })
    studio.sediment.create('attn', { text: '旧白板上写下的一句', origin: 'typed', blocks: [{ id: old, rev: 1 }] })
    // The view refetches on topic activity: one more turn ends a run
    await turn('还有旧的吗', '旧条目这轮')
    await until(() => $$('.sediment-entry').length === 3, '旧条目没有出现')
    const retired = $('.sediment-chip.is-retired')!
    assert.ok(retired, '旧块链接是一枚只读标签')
    assert.equal(retired.tagName, 'SPAN', '不是按钮，点了不跳')
    assert.match(retired.textContent!, /旧的一块/)
    await act(async () => retired.click())
    assert.equal(tab('settled').getAttribute('aria-selected'), 'true', '点旧链接不切走、不白屏')
    assert.equal($$('.sediment-entry').length, 3)
    // ---- R17: delete the sheet holding the old block — the dialog carries the takeaway count, entries stay, the chip reports the deletion (S3/S8) ----
    await act(async () => tab('board').click())
    await act(async () => $('.board-sheet-new')!.click())
    await until(async () => (await api.sheets('attn')).items.length === 2, '第二张没建好')
    const full = (await api.sheets('attn')).items.find(item => item.used > 0)!
    await act(async () => [...element.querySelectorAll<HTMLButtonElement>('.board-tab > button')].find(item => item.title === full.title)!.click())
    const menuTrigger = [...document.querySelectorAll<HTMLButtonElement>('.board-tab-more')].find(node => node.closest('.board-tab')?.querySelector('button.on') !== null)
      ?? [...document.querySelectorAll<HTMLButtonElement>('.board-tab-more')][0]!
    await act(async () => {
      menuTrigger.dispatchEvent(new dom.window.PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }))
      menuTrigger.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, button: 0 }))
      menuTrigger.dispatchEvent(new dom.window.PointerEvent('pointerup', { bubbles: true, button: 0, pointerType: 'mouse' }))
      menuTrigger.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, button: 0 }))
      menuTrigger.click()
    })
    await until(() => [...document.querySelectorAll<HTMLElement>('[role=menuitem]')].some(node => node.textContent === S.board.remove), '删除菜单没有展开')
    await act(async () => [...document.querySelectorAll<HTMLElement>('[role=menuitem]')].find(node => node.textContent === S.board.remove)!.click())
    await until(() => !!document.querySelector('.board-remove-modal'), '删除确认框没出现')
    assert.match(document.querySelector('.board-remove-modal')!.textContent!, new RegExp(String(S.board.removeSettled(1)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/1/g, '\\d+')), '确认框要说清受影响的条目数')
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('.board-remove-modal button')].find(item => item.textContent === S.board.removeConfirm)!.click())
    await until(async () => (await api.sheets('attn')).items.length === 1, '板没删掉')
    await act(async () => tab('settled').click())
    await until(() => $$('.sediment-entry').length === 3, '删板后条目保留')
    await until(() => $('.sediment-chip.is-gone') !== null, '链接应标为已删')
    assert.match($('.sediment-chip.is-gone')!.textContent!, /白板已删除/)
    // ---- S14: speech habits in settings — kept-deletion fragments listed, deletable line by line ----
    await click(S.settings)
    await until(() => !!document.querySelector('.settings-nav'), '设置没有打开')
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('.settings-nav-item')].find(node => node.textContent === zh.settings.tabs.habits)!.click())
    await until(() => document.querySelectorAll('.habits-row').length > 0, '习惯页应列出片段')
    const fragment = document.querySelector('.habits-fragment')!.textContent!
    await act(async () => document.querySelector<HTMLButtonElement>('.habits-remove')!.click())
    await until(() => ![...document.querySelectorAll('.habits-row')].some(row => row.textContent!.includes(fragment)), '逐条删除生效')
    await act(async () => document.querySelector<HTMLButtonElement>('.settings-close')!.click())
  } finally {
    window.setInterval = original
    await act(async () => root.unmount())
    await service.close(); server.close()
    await rm(dataRoot, { recursive: true, force: true })
  }
})

test('S8 英文：空态只有压花板；有条目时入口按钮用英文目录', { timeout: 30000 }, async () => {
  const { setLocale } = await import('../src/i18n/index.ts')
  const { en } = await import('../src/i18n/locales/en.ts')
  const { Takeaways } = await import('../src/mastra/studio/Takeaways.tsx')
  await setLocale('en', false)
  const element = document.createElement('div'); document.body.append(element)
  const root = createRoot(element)
  const state = {
    items: [], offers: [], unsupported: false, error: '', revConflict: false, refresh: () => {},
    create: async () => true, confirm: async () => true, dismiss: async () => {}, edit: async () => true, remove: async () => true,
  }
  try {
    await act(async () => root.render(createElement(Takeaways, { sediment: state, onJump: () => {} })))
    assert.equal(element.querySelector('.sediment-empty'), null, '空态没有说明句')
    assert.equal(element.querySelector('button'), null, '空态没有按钮')
    const entry = { id: 'e1', topicId: 't', text: 'Attention is a lookup.', origin: 'typed', state: 'unverified', quote: null, links: [], createdAt: '', updatedAt: '' }
    await act(async () => root.render(createElement(Takeaways, { sediment: { ...state, items: [entry] }, onJump: () => {} })))
    assert.ok([...element.querySelectorAll('button')].some(item => item.textContent === en.studio.sediment.keep), '有条目时入口按钮用英文')
    // ---- An older service: the clean line (what the official service on older main looks like) ----
    await act(async () => root.render(createElement(Takeaways, { sediment: { ...state, unsupported: true }, onJump: () => {} })))
    assert.ok(element.textContent!.includes(en.studio.sediment.unsupported), '旧服务提示用英文')
  } finally {
    await act(async () => root.unmount())
    element.remove()
    await setLocale('zh', false)
  }
})

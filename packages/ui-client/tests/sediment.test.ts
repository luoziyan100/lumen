/**
 * [INPUT]: the real StudioApp (takeaways view/full-board row/settings habits pane) and the real Board component, React DOM, a real HTTP service with the Mastra Controller, a deterministic model (fills eight blocks, invites, quotes back)
 * [OUTPUT]: component evidence for P1-1: the view and its empty state (S8), the three entries (view button/from a block/full-board row), the full-board row with invite and skip (S9c), a rev conflict keeping the typed line with its own sentence (S10);
 *           the offer's strikethrough restore/re-delete and keep as a quoted entry with the original expandable (S9), evidence chips jumping or reporting the deleted board, the R17 dialog carrying the affected takeaway count (S3),
 *           the speech-habits list and per-line delete in settings (S14), and the English catalog render
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
import { LumenApi, type Sheet, type SheetView } from '../src/mastra/data/client.ts'
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
/** Read block ids from recent tool results on the model side (refusals are plain text and are skipped). */
const lastBlockIds = (request: ProviderRequest) => {
  const ids: string[] = []
  for (const message of [...request.messages].reverse()) if (message.role === 'tool') {
    try { const parsed = JSON.parse(String(message.content)) as { blockId?: string }; if (parsed.blockId) ids.push(parsed.blockId) } catch { /* refusal text */ }
  }
  return ids
}
async function until(check: () => boolean | Promise<boolean>, message: string, ms = 20000) {
  const limit = Date.now() + ms
  while (!await check()) {
    if (Date.now() > limit) throw new Error(message)
    await delay(20)
  }
}

test('S9c/S10 组件级：写满行、跳过与回返、块上入口、rev 冲突保字', { timeout: 30000 }, async () => {
  const element = document.createElement('div'); document.body.append(element)
  const root = createRoot(element)
  const block = { id: 'b1', sheetId: 's1', kind: 'text' as const, title: '第1块', content: { markdown: 'x' }, x: 0, y: 0, w: 400, h: 100, state: 'current' as const, supersededBy: null, rev: 1, sources: [], threadId: null, runId: null, createdAt: '', updatedAt: '' }
  const sheet: Sheet = { id: 's1', topicId: 'attn', title: '白板 1', state: 'live', capacity: 8, used: 8, ord: 1, createdAt: '', updatedAt: 'v1' }
  const view: SheetView = { sheet, blocks: [block] }
  const board = {
    sheets: [sheet], writable: 's1', selected: 's1', target: null, view, error: '',
    select() {}, async createSheet() {}, async remove() { return null }, async locate() { return 'found' as const }, refresh() {},
  }
  const base = {
    items: [], offers: [], unsupported: false, error: '', revConflict: false, refresh() {},
    async confirm() { return true }, async dismiss() {}, async edit() { return true }, async remove() { return true },
  }
  let conflict = false
  // A stateful stub: a failed create writes error and revConflict back like the real hook does (that is what the component sees)
  const { useState: useLocalState } = await import('react')
  const Harness = ({ view }: { view: SheetView }) => {
    const [sediment, setSediment] = useLocalState({ ...base })
    const withFailure = { ...sediment, async create() {
      if (!conflict) return true
      setSediment({ ...sediment, error: 'rev mismatch', revConflict: true })
      return false
    } }
    return createElement(Board, { board: { ...board, view }, materials: [], drawing: null, focus: null, onOpenSource: () => {}, sediment: withFailure, invite })
  }
  const invite = { sheetId: 's1', blockIds: [block.id], question: '对齐是在做什么，用你自己的话说？', threadId: null, runId: null, createdAt: '' }
  const $ = <T extends Element = HTMLElement>(selector: string) => element.querySelector<T & HTMLElement>(selector)
  try {
    await act(async () => root.render(createElement(Harness, { view })))
    // ---- The full-board row: full sheet + invite question + pre-linked blocks + input + skip ----
    assert.ok($('.board-sediment-row'), '写满时行出现')
    assert.match($('.board-sediment-invite')!.textContent!, /对齐是在做什么/)
    assert.match($('.board-sediment-links')!.textContent!, /第1块/)
    assert.ok($('.sediment-input'), '单行输入在')
    // ---- Skip hides it; the row returns once the sheet changes (updatedAt moves) ----
    await act(async () => [...element.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === S.sediment.skip)!.click())
    assert.ok(!$('.board-sediment-row'), '跳过后收起')
    const changed: SheetView = { sheet: { ...sheet, updatedAt: 'v2' }, blocks: [block] }
    await act(async () => root.render(createElement(Harness, { view: changed })))
    assert.ok($('.board-sediment-row'), '白板变化后行回来')
    // ---- From-block entry: the block is pre-linked; a rev conflict shows its own sentence and keeps the typed line ----
    await act(async () => [...element.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === S.sediment.skip)!.click())
    const entry = [...element.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === S.sediment.writeFromBlock)
    assert.ok(entry, '当前块上有写沉淀入口')
    await act(async () => entry!.click())
    const input = $('.sediment-input') as HTMLInputElement
    await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, '对齐让相关的词互相靠近'); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })) })
    conflict = true
    await act(async () => $('.sediment-compose')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })))
    await until(() => $('.board-sediment-row .mw-error') !== null, '冲突要报错')
    assert.equal($('.board-sediment-row .mw-error')!.textContent, S.sediment.linkStale)
    assert.equal(($('.sediment-input') as HTMLInputElement).value, '对齐让相关的词互相靠近', 'S10：冲突后已打的字还在')
  } finally {
    await act(async () => root.unmount())
    element.remove()
  }
})

test('S8/S9/S14 全流程：精灵驱动画满→邀请→跳过与回返；块入口与写满行挂证据；报价单删除线与留下；chip 跳转与删板提示；习惯页；R17 确认框带条目数', { timeout: 180000 }, async () => {
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
  function respond(request: ProviderRequest) {
    const { text, results } = said(request)
    if (text.includes('画满')) return results < 8 ? call('board_draw', { kind: 'text', title: `第${results + 1}块`, content: { markdown: `内容 ${results + 1}` } }) : textReply('画满了')
    if (text.includes('邀请')) return results ? textReply('等你写一句') : call('sediment_invite', { blockIds: lastBlockIds(request).slice(0, 2), question: '对齐是在做什么，用你自己的话说？' })
    if (text.includes('递回')) return results ? textReply('给你递回去了') : call('sediment_quote', { text: '注意力就是把查询和键对齐' })
    if (text.includes('腾位补满')) return results === 0 ? call('board_supersede', { blockId: lastBlockIds(request)[0] })
      : results === 1 ? call('board_draw', { kind: 'text', title: '补的一块', content: { markdown: '补' } }) : textReply('补满了')
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
    await turn('画满', '画满这轮')
    await until(() => !!$('.board-sediment-row'), '写满后没有出现沉淀行')
    assert.ok(!$('.board-sediment-invite'), '还没邀请，不显示问题')
    // ---- The invite: its question sits above the input (S9c) ----
    await turn('邀请', '邀请这轮')
    await until(() => !!$('.board-sediment-invite'), '邀请问题没有出现')
    assert.match($('.board-sediment-invite')!.textContent!, /对齐是在做什么/)
    // ---- Skip hides it; after freeing and refilling a slot the row returns ----
    await click(S.sediment.skip)
    await until(() => !$('.board-sediment-row'), '跳过后应收起')
    await turn('腾位补满', '腾位补满')
    await until(() => !!$('.board-sediment-row'), '白板变化且再次写满后行应回来')
    // ---- S9b from-block entry: the block is pre-linked and the kept entry carries its evidence chip ----
    const fromBlock = $$('.block-takeaway')[0]
    assert.ok(fromBlock, '当前块上有入口')
    await click(S.sediment.skip)
    await act(async () => fromBlock.click())
    await until(() => !!$('.board-sediment-row'), '块入口打开行')
    const input = $('.sediment-input') as HTMLInputElement
    await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, '对齐让相关的词互相靠近'); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })) })
    await act(async () => $('.sediment-compose')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })))
    await until(async () => (await api.sediment('attn'))?.items.length === 1, '条目没有落库')
    const stored = (await api.sediment('attn'))!.items[0]!
    assert.equal(stored.links.length, 1, '块入口的块被预挂为证据')
    // ---- It shows in the view; the chip jumps back to the board (S8) ----
    await act(async () => tab('settled').click())
    await until(() => $$('.sediment-entry').length === 1, '视图里应出现条目')
    assert.ok($('.sediment-keep'), '有一条之后「写一条沉淀」回来')
    assert.equal($('.sediment-press'), null, '有一条之后压花板退场')
    await act(async () => $('.sediment-entry .sediment-chip')!.click())
    await until(() => $('.studio-board') !== null, 'chip 应跳回白板视图')
    assert.equal(tab('board').getAttribute('aria-selected'), 'true')
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
    // ---- R17: delete the sheet holding the evidence — the dialog carries the takeaway count, entries stay, the chip reports the deletion (S3/S8) ----
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
    await until(() => $$('.sediment-entry').length === 2, '删板后条目保留')
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

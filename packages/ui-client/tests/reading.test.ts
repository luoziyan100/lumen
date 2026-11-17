/**
 * [INPUT]: the service's reading-question parser (bound to MODEL_TEXT.askReading here), the real StudioApp (Reading view, Materials row action, sprite), reading-ask's pure helpers, React DOM + jsdom, a real HTTP service with the Mastra Controller,
 *          a deterministic model (writes two sections with the second held, answers questions in two sentences, holds a second conversation), multi-page PDF fixtures
 * [OUTPUT]: component evidence for P1-2 S3/S5/S6: Reading is the first view and the default; the row action sends the visible request and switches to Reading, and the row then
 *           says 「打开解读」; sections appear as their reading_write calls complete (the 5s fallback poll is disabled here); a paper paragraph shows its quote line with the chip at its end (no tooltip copy), paper chips name the page and open split reading,
 *           inference chips are dashed; only a selection inside one paragraph opens the window (not on a chip or the quote line); Enter sends the documented message; the reply streams into the window from the one
 *           shared subscription; Esc closes; the footprint reopens the exchange; a follow-up continues the same conversation and its Markdown reply renders as strong/li/blockquote (G3); keep stores only typed words; another
 *           conversation's run gets the service's readable 409 and nothing is sent; footprints survive a reload and are inline role="button" spans opened by Enter/Space (G4);
 *           the service's readingQuestion reads the real askReading output exactly as parseAsk does, and userWords drops the quote (G1 binding)
 * [POS]: P1-2's UI mechanism acceptance; the controllable model proves mechanism only and never stands in for real-model acceptance; layout and WebKit are covered by the
 *        browser assertions (scripts/sprite/ui-assert-reading.mts), not here
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
import { pagedPdf } from '../../mastra-service/tests/studio/library-fixtures.ts'
import { readingQuestion, userWords } from '../../mastra-service/src/studio/reading-question.ts'
import { LumenApi } from '../src/mastra/data/client.ts'
import { messageRole, messageText } from '../src/mastra/data/feed.ts'
import type { MastraDBMessage } from '@mastra/client-js'
import { zh, MODEL_TEXT } from './helpers/zh.ts'
const S = zh.studio

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
for (const name of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Element', 'Node', 'NodeFilter', 'Text', 'DocumentFragment', 'MutationObserver', 'localStorage', 'getComputedStyle', 'navigator']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name as keyof typeof dom.window] })
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } })
Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) })
Object.defineProperty(dom.window.HTMLElement.prototype, 'scrollTo', { configurable: true, value(this: HTMLElement, options: ScrollToOptions) { this.scrollTop = Number(options?.top ?? 0) } })
// jsdom has no layout: a selection gets a fixed box so the window can be placed
Object.defineProperty(dom.window.Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => ({ top: 100, bottom: 120, left: 40, right: 200, width: 160, height: 20, x: 40, y: 100 }) })
after(() => dom.window.close())
register('./helpers/tsx-loader.mjs', import.meta.url)
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(specifier, context, next) { if (specifier.endsWith('?url')) return { url: 'data:text/javascript,export default "test-worker-url"', shortCircuit: true }; return next(specifier, context) } export async function load(url, context, next) { const result = await next(url, context); if (url.endsWith('/WidgetFrame.tsx')) return { ...result, source: String(result.source).replaceAll('import.meta.env.BASE_URL', JSON.stringify('/')) }; return result }`), import.meta.url)
const { createRoot } = await import('react-dom/client')
const { StudioApp } = await import('../src/mastra/studio/StudioApp.tsx')
const { askText, parseAsk, asksOf, footprintRanges, readingSignal } = await import('../src/mastra/studio/reading-ask.ts')

const token = 'ui-reading-token-at-least-24-characters'
const headers = { Authorization: `Bearer ${token}` }
const PAGE_1 = ['Free energy bounds surprise in the cortex', 'Forward connections carry prediction error']
const PAGE_2 = ['Backward connections carry predictions', 'Repetition suppression reflects perceptual learning']
const PARA_1 = 'Free energy is an upper bound on surprise, so keeping it low keeps the brain in states it expects.'
const said = (request: ProviderRequest) => {
  const lastUser = request.messages.map(message => message.role).lastIndexOf('user')
  return { text: JSON.stringify(request.messages[lastUser]), results: request.messages.slice(lastUser).filter(message => message.role === 'tool').length }
}
async function until(check: () => boolean | Promise<boolean>, message: string, ms = 20000) {
  const limit = Date.now() + ms
  while (!await check()) {
    if (Date.now() > limit) throw new Error(message)
    await act(async () => { await delay(20) })
  }
}

test('reading-ask: the question format reads back; replies attach to their question; footprints map across line breaks; only completed reading_write calls signal', () => {
  const text = askText('an upper   bound\non surprise', '1. 为什么值得读', 'Free energy', ' 为什么是上界？ ')
  assert.equal(text, '> an upper bound on surprise\n— 解读《Free energy》· 1. 为什么值得读\n\n为什么是上界？')
  assert.deepEqual(parseAsk(text), { quote: 'an upper bound on surprise', item: 'Free energy', section: '1. 为什么值得读', words: '为什么是上界？' })
  assert.equal(parseAsk('> just a quote\n\nno place line'), null)
  const message = (id: string, role: string, parts: unknown[]) => ({ id, role, createdAt: new Date(Number(id.slice(1)) * 1000), content: { format: 2, parts } }) as never
  const asks = asksOf([message('m1', 'user', [{ type: 'text', text }]), message('m2', 'assistant', [{ type: 'text', text: '因为 KL 非负。' }]), message('m3', 'user', [{ type: 'text', text: '别的话' }]), message('m4', 'assistant', [{ type: 'text', text: '不算回答' }])], { topicId: 't', taskId: 'a' })
  assert.deepEqual(asks.map(ask => [ask.messageId, ask.reply]), [['m1', '因为 KL 非负。']])
  assert.deepEqual(footprintRanges('keeps it\nlow and more', ['it low']), [{ start: 6, end: 12, quote: 'it low' }])
  const call = (id: string, toolName: string, result?: unknown) => ({ type: 'tool-invocation', toolInvocation: { toolCallId: id, toolName, state: result === undefined ? 'call' : 'result', ...(result === undefined ? {} : { result }) } })
  assert.equal(readingSignal([message('m5', 'assistant', [call('c1', 'reading_write', { sections: 1 }), call('c2', 'reading_write'), call('c3', 'board_draw', {}), call('c4', 'reading_write', { error: 'x' })])]), 'c1')
})

// One written format, two readers: the service keeps its own copy (it never imports UI code), so this test feeds the real askReading output to both
test('reading question format: the service reads MODEL_TEXT.askReading exactly as the UI does, and sediment sees only the words', () => {
  const cases = [
    askText('an upper   bound\non surprise', '1. 为什么值得读', 'Free energy', ' 为什么是上界？ '),
    askText('遮挡不是细节，是一个无法反推的信息损失', '3. 关键的一步', 'A theory of cortical responses', '我还是不懂\n为什么遮挡就反推不了'),
    askText('a quote with 《brackets》 · and dots', '12. 边界', 'Title · with 《marks》', 'ok'),
    MODEL_TEXT.askReading('two\nlines', '2. Evidence', 'Paper', '那下界呢？'),
  ]
  for (const text of cases) {
    const ui = parseAsk(text)
    assert.ok(ui, `UI 读不回：${text}`)
    assert.deepEqual(readingQuestion(text), ui, `服务与界面读法不一致：${text}`)
    assert.equal(userWords(text), ui.words, '沉淀只看用户的话')
    assert.ok(!userWords(text).includes(ui.quote), '引文不算用户的话')
  }
  for (const text of ['> just a quote\n\nno place line', '普通的一句话', '— 解读《X》· 1. a\n\nno quote above']) {
    assert.equal(parseAsk(text), null)
    assert.equal(readingQuestion(text), null)
    assert.equal(userWords(text), text, '普通消息整条都是用户的话')
  }
})

test('Reading view: write → live sections → chips → in-paragraph window → shared reply → footprint → keep typed words → 409 → reload', { timeout: 180000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-ui-reading-'))
  let calls = 0, releaseSecond!: () => void, releaseHold!: () => void
  const second = new Promise<void>(resolve => { releaseSecond = resolve })
  const hold = new Promise<void>(resolve => { releaseHold = resolve })
  const call = (name: string, args: unknown) => toolReply(name, args, `call-${++calls}`)
  const paper = (text: string, page: number, quote: string) => ({ text, source: { kind: 'paper', page, quote } })
  const fixture = fixtureProvider(async (request: ProviderRequest) => {
    const { text, results } = said(request)
    if (text.includes('hold')) { await hold; return textReply('ok') }
    const item = /材料 id：([^）"\\]+)/.exec(text)?.[1]
    if (text.includes('写一份解读') && item) {
      if (results === 0) return call('reading_write', { itemId: item, title: 'Why it matters', paragraphs: [paper(PARA_1, 1, 'Free energy bounds surprise in the cortex'), { text: 'This is a bid for one theory of the brain.', source: { kind: 'inference' } }] })
      if (results === 1) { await second; return call('reading_write', { itemId: item, title: 'Evidence', paragraphs: [paper('Repetition suppression is read as learning.', 2, 'Repetition suppression reflects perceptual learning')] }) }
      return textReply('写好了')
    }
    if (text.includes('那下界呢')) return textReply('**下界**是另一回事：\n\n- 证据下界 ELBO\n- 它就是负自由能\n\n> 最小化自由能等于抬高下界')
    if (text.includes('— 解读《')) return textReply('KL 散度非负，所以自由能总在惊讶之上。最小化它就压住了惊讶。')
    return textReply('好')
  })
  const service = await createHttpService({ dataRoot, token, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  let subscriptions = 0
  const server = serve({ hostname: '127.0.0.1', port: 0, fetch: request => {
    if (new URL(request.url).pathname.endsWith('/stream')) subscriptions++
    return service.app.fetch(request)
  } })
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const connection = { baseUrl: `http://127.0.0.1:${address.port}`, token }
  const api = new LumenApi(connection)
  ensureTopic(service, 'paper', '自由能读书')
  const pdf = (await api.upload({ topicId: 'paper' }, new File([new Uint8Array(pagedPdf([PAGE_1, PAGE_2]))], 'cortex.pdf', { type: 'application/pdf' }))).itemId
  await api.upload({ topicId: 'paper' }, new File(['# Notes\n\nThe brain minimises free energy over time.'], 'notes.md', { type: 'text/markdown' }))
  // ---- The 5-second fallback poll is disabled: sections can only appear through the conversation's reading_write signal ----
  const original = window.setInterval
  window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => timeout === 5000 ? 0 : original.call(window, handler, timeout, ...args)) as typeof window.setInterval
  localStorage.clear()
  const element = document.createElement('div'); document.body.append(element)
  let root = createRoot(element)
  const $ = <T extends Element = HTMLElement>(selector: string) => element.querySelector<T & HTMLElement>(selector)
  const $$ = (selector: string) => [...element.querySelectorAll<HTMLElement>(selector)]
  const tab = (view: keyof typeof S.views) => $$('.studio-views [role=tab]').find(node => node.getAttribute('aria-label') === S.views[view])!
  const row = (title: RegExp) => $$('.material').find(node => title.test(node.querySelector('.material-title')!.textContent!))!
  const typeInto = async (area: HTMLTextAreaElement, value: string) => act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')!.set!.call(area, value)
    area.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
  const select = async (start: Node, startOffset: number, end: Node, endOffset: number) => act(async () => {
    const range = document.createRange(); range.setStart(start, startOffset); range.setEnd(end, endOffset)
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range)
    $('.reading-column')!.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true }))
  })
  const stored = async (taskId: string) => {
    const id = encodeURIComponent(`paper:${taskId}`)
    const response = await fetch(`${connection.baseUrl}/api/agent-controller/lumen/sessions/${id}/threads/${id}/messages`, { headers })
    // Native Memory stores the person's turns under its own role; feed's messageRole reads them as 'user', as the UI does
    return ((await response.json()).messages as MastraDBMessage[]).sort((x, y) => +new Date(x.createdAt) - +new Date(y.createdAt))
      .filter(message => messageRole(message) === 'user').map(messageText)
  }
  try {
    await act(async () => root.render(createElement(StudioApp, { connection })))
    await until(() => $$('.studio-views [role=tab]').length === 6, '视图导航没有出现')
    // ---- Reading is first and the default; with no reading, one line says what to do ----
    assert.equal($$('.studio-views [role=tab]')[0], tab('reading'))
    assert.equal(tab('reading').getAttribute('aria-selected'), 'true')
    await until(() => $('.reading-start [role=status]')?.textContent === S.reading.start, '空态一句话')
    await until(() => $$('.material').length === 2, '素材没有列出')
    // Two materials and none picked: the empty view's button waits for a pick and says where
    assert.ok($<HTMLButtonElement>('.reading-start-write')!.disabled, '没选素材时写解读按钮不可用')
    assert.equal($('.reading-start-hint')?.textContent, S.reading.pickFirst)
    assert.deepEqual($$('.material-reading').map(node => node.textContent), [S.reading.write, S.reading.write])

    // ---- S3: the row action sends one visible message and switches to Reading; S5: the first section shows while the second is still being written ----
    await act(async () => tab('board').click())
    await act(async () => row(/Free energy|cortex/).querySelector<HTMLButtonElement>('.material-reading')!.click())
    assert.equal(tab('reading').getAttribute('aria-selected'), 'true', '写解读切到解读视图')
    await until(() => $$('.reading-section').length === 1, '第一节没有随工具完成出现')
    assert.equal($('.reading-more')?.textContent, S.reading.more, '已有一节后提示下一节，不再说第一节')
    assert.notEqual(S.reading.more, S.reading.waiting)
    const session = (await api.sessions('paper')).items[0]!
    releaseSecond()
    await until(() => $$('.reading-section').length === 2, '第二节没有出现')
    await until(() => !$('.reading-more'), '写完后不再说还在写')
    // Native Memory stores the turn when the run ends: the request is the person's visible message, word for word
    await until(async () => (await stored(session.taskId)).length === 1, '请求没有存进对话')
    assert.deepEqual(await stored(session.taskId), [MODEL_TEXT.writeReading(row(/Free energy|cortex/).querySelector('.material-title')!.textContent!, pdf)])
    assert.deepEqual($$('.reading-section h2').map(node => node.textContent), ['1Why it matters', '2Evidence'])
    assert.equal(row(/Free energy|cortex/).querySelector('.material-reading')!.textContent, S.reading.open)

    // ---- Chips: the paper chip names its page and opens split reading; the inference chip is dashed and says so ----
    const chips = $$('.reading-chip')
    assert.deepEqual(chips.map(chip => [chip.tagName, chip.textContent, chip.classList.contains('source-chip-inferred')]),
      [['BUTTON', S.reading.page(1), false], ['SPAN', S.reading.inference, true], ['BUTTON', S.reading.page(2), false]])
    // ---- The paper's quote stands under its paragraph and carries the chip; an inference paragraph has none ----
    const quotes = $$('.reading-quote')
    assert.equal(quotes.length, 2, '两个原文段各有一行引文')
    assert.ok(quotes[0]!.textContent!.startsWith('Free energy bounds surprise in the cortex') && quotes[0]!.contains(chips[0]!), '引文在原文段下面，签在引文末尾')
    assert.equal(quotes[0]!.previousElementSibling?.querySelector('[data-paragraph]')?.textContent, PARA_1)
    assert.ok(chips[1]!.closest('.reading-para.is-inference') && !chips[1]!.closest('.reading-para')!.nextElementSibling?.matches('.reading-quote'), '推断段没有引文行')
    assert.equal(chips[0]!.getAttribute('title'), S.reading.openSource, '引文已可见，签的提示不再重复它')
    await act(async () => chips[2]!.click())
    await until(() => !!$('.studio-center.studio-split .studio-reader'), '原文 chip 没有打开分屏')

    // ---- S6: a selection across two paragraphs or on a chip opens nothing ----
    const texts = $$('[data-paragraph]')
    await select(texts[0]!.firstChild!, 3, texts[1]!.firstChild!, 4)
    assert.equal($('.reading-ask'), null, '跨段选择不开窗')
    await select(chips[0]!.firstChild!, 0, chips[0]!.firstChild!, 3)
    assert.equal($('.reading-ask'), null, '选在 chip 上不开窗')
    await select(quotes[0]!.firstChild!, 0, quotes[0]!.firstChild!, 11)
    assert.equal($('.reading-ask'), null, '选在引文行上不开窗')
    // ---- Inside one paragraph it opens under the selection, with the quote, the input and the send button ----
    const quote = 'an upper bound on surprise'
    const at = PARA_1.indexOf(quote)
    await select(texts[0]!.firstChild!, at, texts[0]!.firstChild!, at + quote.length)
    assert.ok($('.reading-ask'), '段内选择开窗')
    assert.equal($('.reading-ask-quote')!.textContent, quote)
    // jsdom has no layout, so only the rule is checked here: the window sits wholly below or wholly above the selected line (100–120px); real placement is in the browser assertions
    const top = parseFloat($('.reading-ask')!.style.top), height = $('.reading-ask')!.offsetHeight
    assert.ok(top >= 128 || top + height <= 92, `窗不能盖住选中的句子（top ${top}）`)
    const area = $<HTMLTextAreaElement>('.reading-ask textarea')!
    assert.equal(document.activeElement, area, '开窗即可输入')
    const before = subscriptions
    await typeInto(area, '为什么是上界？')
    await act(async () => area.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    // ---- The documented message lands in the same conversation; the reply streams into the window from the one subscription ----
    await until(async () => (await stored(session.taskId)).length === 2, '提问没有发出')
    const itemTitle = $('.reading-title')!.textContent!
    assert.equal((await stored(session.taskId))[1], `> ${quote}\n— 解读《${itemTitle}》· 1. Why it matters\n\n为什么是上界？`)
    await until(() => /KL 散度非负/.test($('.reading-ask-reply')?.textContent ?? ''), '回答没有出现在小窗里')
    assert.equal(subscriptions, before, '小窗不开第二条订阅')
    assert.equal(area.value, '', '发出后输入清空')
    // ---- The footprint marks the asked sentence; Esc closes; clicking the footprint reopens the exchange ----
    assert.equal($('.reading-footprint')!.textContent, quote)
    await act(async () => area.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    assert.equal($('.reading-ask'), null, 'Esc 关窗')
    await act(async () => $('.reading-footprint')!.click())
    assert.ok(/为什么是上界/.test($('.reading-ask-you')!.textContent!) && /KL 散度非负/.test($('.reading-ask-reply')!.textContent!), '点足迹重开这段问答')
    // ---- A follow-up continues the same conversation, in the same format ----
    await until(() => !$$('.topic .topic-light-running').length, '回答这轮没结束')
    await typeInto($<HTMLTextAreaElement>('.reading-ask textarea')!, '那下界呢？')
    await act(async () => $<HTMLButtonElement>('.reading-ask-send')!.click())
    await until(async () => (await stored(session.taskId)).length === 3, '追问没有发出')
    assert.equal((await api.sessions('paper')).items.length, 1, '追问不开新对话')
    await until(() => $$('.reading-ask-turn').length === 2 && $$('.reading-ask-reply:not(.is-waiting)').length === 2, '追问的回答没有出现')
    // ---- G3: the reply is Markdown rendered as elements, not literal asterisks ----
    await until(() => !!$$('.reading-ask-reply')[1]?.querySelector('blockquote'), '追问的回答没有渲染完')
    const reply = $$('.reading-ask-reply')[1]!
    assert.equal(reply.querySelector('strong')?.textContent, '下界', '加粗渲染为 strong')
    assert.deepEqual([...reply.querySelectorAll('li')].map(node => node.textContent), ['证据下界 ELBO', '它就是负自由能'], '列表渲染为 li')
    assert.match(reply.querySelector('blockquote')!.textContent!, /最小化自由能等于抬高下界/, '引用渲染为 blockquote')
    assert.ok(!reply.textContent!.includes('**') && !/^\s*[->]\s/m.test(reply.textContent!), '不出现 Markdown 原始符号')

    // ---- Keep: typed words only; with an empty input it keeps the person's own last words; never the quote ----
    await typeInto($<HTMLTextAreaElement>('.reading-ask textarea')!, '自由能压住惊讶')
    await act(async () => [...element.querySelectorAll<HTMLButtonElement>('.reading-ask button')].find(node => node.textContent === S.reading.ask.keep)!.click())
    await until(async () => (await api.sediment('paper'))!.items.length === 1, '沉淀没有落库')
    await act(async () => [...element.querySelectorAll<HTMLButtonElement>('.reading-ask button')].find(node => node.textContent === S.reading.ask.keep)!.click())
    await until(async () => (await api.sediment('paper'))!.items.length === 2, '空输入时留下自己的最后一句')
    const kept = (await api.sediment('paper'))!.items.map(item => item.text).sort()
    assert.deepEqual(kept, ['那下界呢？', '自由能压住惊讶'].sort())
    assert.ok(kept.every(text => !text.includes(quote)), '引文不进沉淀')

    // ---- R1: another conversation runs; the row action gets the service's readable 409 and nothing is sent ----
    await until(() => !$$('.topic .topic-light-running').length, '追问这轮没结束')
    const other = { topicId: 'paper', taskId: 'other' }
    await api.open(other)
    const running = api.session(other).sendMessage('hold')
    await until(async () => !!(await api.topics()).items.find(topic => topic.id === 'paper')?.running, '另一段对话没有跑起来')
    const sent = (await stored(session.taskId)).length
    await act(async () => row(/notes/i).querySelector<HTMLButtonElement>('.material-reading')!.click())
    await until(() => /一个主题同一时刻只跑一段对话/.test($('.studio-materials .mw-error')?.textContent ?? ''), '忙时没有显示可读的 409')
    assert.equal((await stored(session.taskId)).length, sent, '忙时什么都没发')
    releaseHold(); await running
    await until(async () => !(await api.topics()).items.find(topic => topic.id === 'paper')?.running, '另一段对话没结束')

    // ---- Reload: a new app finds the newest reading and rebuilds the footprint from stored messages ----
    await act(async () => root.unmount())
    root = createRoot(element)
    await act(async () => root.render(createElement(StudioApp, { connection })))
    await until(() => $$('.reading-section').length === 2, '重载后解读没有出现')
    await until(() => $('.reading-footprint')?.textContent === quote, '重载后足迹没有重建')
    // ---- G4: the footprint is an inline span acting as a button; the keyboard opens it ----
    const footprint = $('.reading-footprint')!
    assert.equal(footprint.tagName, 'SPAN', '足迹是行内元素，随文字折行')
    assert.equal(footprint.getAttribute('role'), 'button')
    assert.equal(footprint.tabIndex, 0)
    await act(async () => footprint.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    await until(() => $$('.reading-ask-turn').length === 2, '重载后按 Enter 打开足迹看到这段问答')
    await act(async () => $<HTMLButtonElement>('.reading-ask .icon-btn')!.click())
    assert.equal($('.reading-ask'), null)
    await act(async () => $('.reading-footprint')!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: ' ', bubbles: true })))
    await until(() => $$('.reading-ask-turn').length === 2, '空格也能打开足迹')
  } finally {
    releaseSecond(); releaseHold()
    window.setInterval = original
    await act(async () => root.unmount())
    element.remove()
    server.close()
    await service.close()
    await rm(dataRoot, { recursive: true, force: true })
  }
})

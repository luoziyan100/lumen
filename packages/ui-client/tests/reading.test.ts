/**
 * [INPUT]: the service's reading-question parser (bound to MODEL_TEXT.askReading here), the real StudioApp (Reading view, Materials row action, sprite), reading-ask's pure helpers, React DOM + jsdom, a real HTTP service with the Mastra Controller,
 *          a deterministic model (writes two sections with the second held, answers questions in two sentences, holds a second conversation), multi-page PDF fixtures
 * [OUTPUT]: component evidence for P1-2 S3/S5/S6: Reading is the first view and the default; the row action sends the visible request and switches to Reading, and the row then
 *           says 「打开解读」; sections appear as their reading_write calls complete (the 5s fallback poll is disabled here); a paper paragraph shows its quote line with the chip at its end (no tooltip copy), paper chips name the page and open split reading,
 *           inference chips are dashed; only a selection inside one paragraph opens the window (not on a chip or the quote line); Enter sends the documented message; the reply streams into the window from the one
 *           shared subscription; Esc closes; the footprint reopens the exchange; a follow-up continues the same conversation and its Markdown reply renders as strong/li/blockquote (G3); keep stores only typed words; another
 *           conversation's run gets the service's readable 409 and nothing is sent; footprints survive a reload and are inline role="button" spans opened by Enter/Space (G4);
 *           the service's readingQuestion reads the real askReading output exactly as parseAsk does, and userWords drops the quote (G1 binding); userWords gives nothing for the
 *           program-written messages (write request, widget message, diagram fix, widget fix) and drops the upload list (R13); a widget question (title line plus 「当前参数」 line) reads the same on
 *           both sides with only the words as the person's, and readingAsks ties it to its widget by section and title (widgetIdle for an untitled one);
 *           living-reading explorable: in-place widget expand closes AskWindow first, keeps the exact iframe DOM node and 3-slot auto-run quota, routes expanded WIDGET_SEND with R13 marker + live reading_insert + 8255d27 auto-focus, Esc collapses in place (both outer window Esc and iframe-focused WIDGET_ESCAPE with source check; inline WIDGET_ESCAPE is a no-op), and receiver re-reports natural height on leaving fillHeight and forwards Escape in capture phase
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
import { LumenApi, type WidgetParam } from '../src/mastra/data/client.ts'
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
const { askText, askWidgetText, parseAsk, asksOf, footprintRanges, latestReadingWrite, readingSignal, prose, readingAsks, wholeMath } = await import('../src/mastra/studio/reading-ask.ts')
const { ParagraphText, shownOffset } = await import('../src/mastra/studio/Reading.tsx')
const { DEFAULT_SHAPE, SPRITE_KEY } = await import('../src/mastra/studio/sprite-place.ts')
const { widgetQuote } = await import('../src/mastra/studio/widget-params.ts')
const widgetParams: WidgetParam[] = [
  { type: 'range', name: 'gain', label: '增益', min: 0, max: 4, step: 0.5, default: 1, unit: 'x' },
  { type: 'toggle', name: 'feedback', label: '反馈', default: true },
  { type: 'choice', name: 'mode', label: '模式', options: [{ value: 'fast', label: '快' }, { value: 'slow', label: '慢' }], default: 'slow' },
]

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

test('reading-ask: the question format reads back; replies attach to their question; footprints map across line breaks; only completed reading_write/insert/patch calls signal and auto-focus', async () => {
  const text = askText('an upper   bound\non surprise', '1. 为什么值得读', 'Free energy', ' 为什么是上界？ ')
  assert.equal(text, '> an upper bound on surprise\n— 解读《Free energy》· 1. 为什么值得读\n\n为什么是上界？')
  assert.deepEqual(parseAsk(text), { quote: 'an upper bound on surprise', item: 'Free energy', section: '1. 为什么值得读', words: '为什么是上界？' })
  assert.equal(parseAsk('> just a quote\n\nno place line'), null)
  const message = (id: string, role: string, parts: unknown[]) => ({ id, role, createdAt: new Date(Number(id.slice(1)) * 1000), content: { format: 2, parts } }) as never
  const asks = asksOf([message('m1', 'user', [{ type: 'text', text }]), message('m2', 'assistant', [{ type: 'text', text: '因为 KL 非负。' }]), message('m3', 'user', [{ type: 'text', text: '别的话' }]), message('m4', 'assistant', [{ type: 'text', text: '不算回答' }])], { topicId: 't', taskId: 'a' })
  assert.deepEqual(asks.map(ask => [ask.messageId, ask.reply]), [['m1', '因为 KL 非负。']])
  assert.deepEqual(footprintRanges('keeps it\nlow and more', ['it low']), [{ start: 6, end: 12, quote: 'it low' }])
  const call = (id: string, toolName: string, result?: unknown, args?: unknown) => ({ type: 'tool-invocation', toolInvocation: { toolCallId: id, toolName, ...(args ? { args } : {}), state: result === undefined ? 'call' : 'result', ...(result === undefined ? {} : { result }) } })
  const msg = message('m5', 'assistant', [call('c1', 'reading_write', { sections: 1 }, { itemId: 'item-1' }), call('c2', 'reading_write', undefined, { itemId: 'item-2' }), call('c3', 'board_draw', {}), call('c4', 'reading_write', { error: 'x' }, { itemId: 'item-err' }), call('c5', 'reading_insert', { blockId: 'p1' }, { itemId: 'item-1' })])
  assert.equal(readingSignal([msg]), 'c1,c5')
  assert.deepEqual(latestReadingWrite([msg]), { callId: 'c5', itemId: 'item-1' })
  // Only the current turn counts: once the person asks again, an older write (even one loaded late with history) is not news
  const ask = message('m6', 'user', [{ type: 'text', text }])
  assert.equal(latestReadingWrite([msg, ask]), null)
  assert.deepEqual(latestReadingWrite([ask, msg]), { callId: 'c5', itemId: 'item-1' })
  const patched = message('m7', 'assistant', [call('c6', 'reading_patch', { blockId: 'p1', kind: 'widget' }, { itemId: 'item-3' }), call('c7', 'reading_patch', { error: true, message: 'x' }, { itemId: 'item-err' })])
  assert.equal(readingSignal([msg, patched]), 'c1,c5,c6', '完成的 reading_patch 让解读刷新，被拒的不算')
  assert.deepEqual(latestReadingWrite([ask, msg, patched]), { callId: 'c6', itemId: 'item-3' }, 'reading_patch 也让本轮自动跟焦')
  const [{ en }, { zh }] = await Promise.all([import('../src/i18n/locales/en.ts'), import('../src/i18n/locales/zh.ts')])
  assert.deepEqual([en.process.toolNames.reading_patch, zh.process.toolNames.reading_patch], ['Edit the reading', '改解读'])
})

test('reading prose: **bold** and `code` are drawn without their markers; quotes, footprints and an old question that quoted the markers all use the shown text', () => {
  const source = '递；**深度反馈控制（DFC）**源于运动控制，用 `u = Ke` 纠偏；a ** b 不是加粗，**未闭合'
  const shown = prose(source)
  assert.equal(shown.text, '递；深度反馈控制（DFC）源于运动控制，用 u = Ke 纠偏；a ** b 不是加粗，**未闭合')
  assert.deepEqual(shown.marks.map(mark => [shown.text.slice(mark.start, mark.end), mark.kind]), [['深度反馈控制（DFC）', 'strong'], ['u = Ke', 'code']])
  assert.deepEqual(prose('no marks here'), { text: 'no marks here', marks: [] })
  const old = parseAsk(askText('深度反馈控制（DFC）**源于运动控制', '1. 核心结论', 'Paper', '这个是什么'))!
  assert.equal(old.quote, '深度反馈控制（DFC）源于运动控制')
  assert.deepEqual(footprintRanges(shown.text, [old.quote]).map(range => shown.text.slice(range.start, range.end)), ['深度反馈控制（DFC）源于运动控制'])
  const reading = { itemTitle: 'Paper', sections: [{ paragraphs: [{ id: 'p1', text: source, source: { kind: 'inference' } }] }] } as never
  assert.equal(readingAsks(reading, [{ ...old, messageId: 'm', identity: { topicId: 't', taskId: 'a' }, reply: '', createdAt: 0 }]).length, 1)
})

test('reading prose: $…$ and $$…$$ are formulas drawn by KaTeX; the shown text keeps their source, a selection and a footprint take a formula whole, and prices stay text', () => {
  const source = '变化率 $\\tau_v \\dot{v}^\\ell_t = -v^\\ell_t$ 与 **DFC** 一样；不动点 $$\\dot{v} = 0$$ 处成立；售价 $5 和 $6，转义 \\$x\\$ 不算'
  const shown = prose(source)
  assert.equal(shown.text, source.replace('**DFC**', 'DFC'))
  const math = shown.marks.filter(mark => mark.kind === 'math')
  assert.deepEqual(math.map(mark => [shown.text.slice(mark.start, mark.end), mark.tex, mark.display]), [
    ['$\\tau_v \\dot{v}^\\ell_t = -v^\\ell_t$', '\\tau_v \\dot{v}^\\ell_t = -v^\\ell_t', false],
    ['$$\\dot{v} = 0$$', '\\dot{v} = 0', true],
  ])
  const [first] = math
  assert.deepEqual(wholeMath(shown.marks, 1, first!.start + 3), { start: 1, end: first!.end })
  assert.deepEqual(wholeMath(shown.marks, first!.start + 3, first!.end + 2), { start: first!.start, end: first!.end + 2 })

  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const asked = shown.text.slice(first!.start + 2, first!.end + 2)
  act(() => root.render(createElement(ParagraphText, { id: 'p1', shown, quotes: [asked], onFootprint: () => {} })))
  const paragraph = host.querySelector('[data-paragraph="p1"]')!
  const drawn = paragraph.querySelectorAll('.reading-math')
  assert.equal(drawn.length, 2)
  assert.ok(drawn[0]!.querySelector('.katex'), 'KaTeX drew the inline formula')
  assert.ok(drawn[1]!.classList.contains('is-display'))
  assert.ok(!paragraph.textContent!.includes('$\\tau'), 'no TeX source shows as text')
  const footprint = paragraph.querySelector('.reading-footprint')!
  assert.ok(footprint.contains(drawn[0]!), 'a footprint that started inside the formula holds it whole')

  const inside = drawn[0]!.querySelector('.katex')!.firstChild!
  const lead = paragraph.firstChild!
  assert.equal(lead.nodeType, Node.TEXT_NODE)
  assert.equal(shownOffset(paragraph, lead, 2, 'start'), 2)
  assert.equal(shownOffset(paragraph, inside, 0, 'start'), first!.start)
  assert.equal(shownOffset(paragraph, inside, 0, 'end'), first!.end)
  const strong = paragraph.querySelector('strong')!.firstChild!
  assert.equal(shownOffset(paragraph, strong, 1, 'end'), shown.text.indexOf('DFC') + 1)
  const tail = paragraph.lastChild!
  assert.equal(shownOffset(paragraph, tail, (tail as Text).length, 'end'), shown.text.length)
  act(() => root.unmount())
  host.remove()
})

// One written format, two readers: the service keeps its own copy (it never imports UI code), so this test feeds the real askReading output to both
test('reading question format: the service reads MODEL_TEXT.askReading exactly as the UI does, and sediment sees only the words', () => {
  const cases = [
    askText('an upper   bound\non surprise', '1. 为什么值得读', 'Free energy', ' 为什么是上界？ '),
    askText('遮挡不是细节，是一个无法反推的信息损失', '3. 关键的一步', 'A theory of cortical responses', '我还是不懂\n为什么遮挡就反推不了'),
    askText('a quote with 《brackets》 · and dots', '12. 边界', 'Title · with 《marks》', 'ok'),
    MODEL_TEXT.askReading('two\nlines', '2. Evidence', 'Paper', '那下界呢？'),
    askWidgetText(widgetQuote('增益', widgetParams, { gain: 2, feedback: false, mode: 'fast' }), '2. 机制', 'Free energy', '为什么增益到 2 就变陡了'),
    askWidgetText(widgetQuote('交互小实验', undefined, {}), '3. 边界', 'Free energy', '这个在演示什么'),
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

// Everything the program writes in the person's name, fed as the real MODEL_TEXT output: none of it is the person's words (R13)
test('a widget question: two program lines as its quote, the person\'s words after; readingAsks finds it on its widget', () => {
  const text = askWidgetText(widgetQuote('增益', widgetParams, { gain: 2, feedback: false, mode: 'fast' }), '2. 机制', 'Free energy', '为什么变陡了')
  assert.equal(text, '> 小实验「增益」\n> 当前参数：增益=2x，反馈=关，模式=快\n— 解读《Free energy》· 2. 机制\n\n为什么变陡了')
  const ask = { ...parseAsk(text)!, messageId: 'm', identity: { topicId: 't', taskId: 'a' }, reply: '', createdAt: 0 }
  assert.equal(ask.words, '为什么变陡了')
  const widget = (title?: string) => ({ id: 'w', kind: 'widget', ...(title ? { title } : {}), html: '<p></p>', source: { kind: 'inference' } })
  const reading = (title?: string, ord = 2) => ({ itemTitle: 'Free energy', sections: [{ id: 's', ord, title: '机制', paragraphs: [widget(title)] }] }) as never
  assert.equal(readingAsks(reading('增益'), [ask]).length, 1)
  assert.equal(readingAsks(reading('别的'), [ask]).length, 0, '标题不同不算这块')
  assert.equal(readingAsks(reading('增益', 3), [ask]).length, 0, '节不同不算这块')
  const idle = { ...parseAsk(askWidgetText(widgetQuote(S.reading.widgetIdle, undefined, {}), '2. 机制', 'Free energy', '演示什么'))!, messageId: 'n', identity: ask.identity, reply: '', createdAt: 0 }
  assert.equal(readingAsks(reading(), [idle]).length, 1, '没标题的小实验按 widgetIdle 认')
})

test('program-written messages are not the person\'s words: write request, widget message, diagram fix, widget fix, the upload list', () => {
  for (const text of [
    MODEL_TEXT.writeReading('A theory of cortical responses', 'item-1'),
    MODEL_TEXT.writeReading('Title · with 《marks》）and more', 'item-2'),
    MODEL_TEXT.widgetSend('我猜 B'),
    MODEL_TEXT.widgetSend('  参数 3\n第二行 '),
    MODEL_TEXT.mermaidFix('graph TD\nA-->B', 'Parse error on line 2'),
    MODEL_TEXT.widgetFix('Free energy', '2. 机制', '增益', 'ReferenceError: gain is not defined', 'item-1', 'p0123456789'),
  ]) {
    assert.equal(userWords(text), '', `程序代写的不算用户的话：${text}`)
    assert.equal(parseAsk(text), null, `程序代写的也不是提问：${text}`)
  }
  const fix = MODEL_TEXT.widgetFix('Free energy', '2. 机制', '增益', 'ReferenceError', 'item-1', 'p0123456789')
  assert.ok(fix.startsWith('解读里的小实验运行出错：'), '前缀与服务端 reading-question.ts 对齐')
  assert.ok(fix.includes('reading_view({ itemId: "item-1", blockId: "p0123456789" })') && fix.includes('再用 reading_patch 只改出错的部分'), '修正请求指向按块读与局部修改')
  assert.ok(!/reading_write|reading_insert/.test(fix), '修正请求不再把模型推回整节重写')
  assert.equal(MODEL_TEXT.widgetSend(' 我猜 B '), '— 小实验\n\n我猜 B', 'the widget mark is its own first line')
  const typed = '这里的上界为什么成立？'
  const withList = `${typed}\n\n${MODEL_TEXT.uploadedMaterials}\n- paper.pdf: item-9`
  assert.equal(userWords(withList), typed, '上传清单不算用户的话')
  assert.equal(userWords('我说的话里提到 — 小实验 也没关系'), '我说的话里提到 — 小实验 也没关系', 'the mark counts only as the first line')
  assert.equal(userWords('请为《X》写一份解读。我自己还想补一句'), '请为《X》写一份解读。我自己还想补一句', 'a typed sentence that starts like the request stays the person\'s')
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
    // ---- Reading is first and the default; with no reading, the typewriter alone: no text, no button (writing starts from the Materials row) ----
    assert.equal($$('.studio-views [role=tab]')[0], tab('reading'))
    assert.equal(tab('reading').getAttribute('aria-selected'), 'true')
    await until(() => !!$('.reading-typewriter'), '空态没有打字机')
    await until(() => $$('.material').length === 2, '素材没有列出')
    assert.equal($('.reading-start button'), null, '空态没有按钮')
    // The drawing's own <text> (the title on the paper) is illustration; nothing outside the object may carry text
    const bare = $('.reading-start')!.cloneNode(true) as HTMLElement
    bare.querySelectorAll('.iso-host').forEach(node => node.remove())
    assert.equal(bare.textContent, '', '空态在物件之外没有文字')
    assert.deepEqual($$('.material-reading').map(node => node.textContent), [S.reading.write, S.reading.write])

    // ---- S3: the row action sends one visible message and switches to Reading; S5: the first section shows while the second is still being written ----
    await act(async () => tab('board').click())
    await act(async () => row(/Free energy|cortex/).querySelector<HTMLButtonElement>('.material-reading')!.click())
    assert.equal(tab('reading').getAttribute('aria-selected'), 'true', '写解读切到解读视图')
    await until(() => $$('.reading-section').length === 1, '第一节没有随工具完成出现')
    assert.equal($('.reading-more')?.textContent, S.reading.more, '已有一节后提示下一节')
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
    assert.ok(![...$$('.reading-ask button')].some(node => node.textContent === S.reading.ask.keep), 'no keep button before a question')
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
    await act(async () => document.body.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true })))
    assert.equal($('.reading-ask'), null, 'a press outside the window closes it')

    await act(async () => root.unmount())
    localStorage.setItem(SPRITE_KEY, JSON.stringify({ ...DEFAULT_SHAPE, open: true, docked: true }))
    root = createRoot(element)
    await act(async () => root.render(createElement(StudioApp, { connection })))
    await until(() => $('.reading-footprint')?.textContent === quote, 'footprint after opening the conversation')
    await act(async () => $('.reading-footprint')!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    await until(() => !!$('.sprite .mw-message.is-revealed .msg-ask-quote'), 'with the conversation open, the footprint scrolls the conversation to its question')
    assert.equal($('.sprite .mw-message.is-revealed .msg-ask-quote')!.textContent, quote)
    assert.ok($('.reading-ask'), 'the window still opens for a follow-up')
    assert.equal($$('.reading-ask-turn').length, 0, 'with the conversation open, answers are not shown twice')
    await act(async () => $<HTMLButtonElement>('.reading-ask .icon-btn')!.click())

    const phrase = 'keeps the brain in states'
    const walker = document.createTreeWalker($$('[data-paragraph]')[0]!, dom.window.NodeFilter.SHOW_TEXT)
    let node: Node | null = null
    while ((node = walker.nextNode()) && !node.textContent!.includes(phrase));
    const from = node!.textContent!.indexOf(phrase)
    await select(node!, from, node!, from + phrase.length)
    assert.ok($('.reading-ask'), 'a new selection opens the window')
    const asked = $$('.sprite .msg-ask-quote').length
    await typeInto($<HTMLTextAreaElement>('.reading-ask textarea')!, '为什么能保持？')
    await act(async () => $<HTMLTextAreaElement>('.reading-ask textarea')!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    await until(() => !$('.reading-ask'), 'with the conversation open, the window closes once the question is sent')
    await until(() => $$('.sprite .msg-ask-quote').length === asked + 1 && $$('.sprite .msg-ask-quote').at(-1)!.textContent === phrase, 'the question lands in the open conversation')
    await until(() => /KL 散度非负/.test($$('.sprite .mw-assistant').at(-1)?.textContent ?? ''), 'the answer streams into the open conversation')
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

test('Living reading UI: renders mixed table/diagram/widget blocks, refreshes on reading_insert, and routes widget __widgetSendMessage to the conversation', { timeout: 120000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-ui-living-reading-'))
  let calls = 0, itemId = '', sectionId = '', firstParaId = ''
  const call = (name: string, args: unknown) => toolReply(name, args, `call-${++calls}`)
  const fixture = fixtureProvider(async (request: ProviderRequest) => {
    const { text, results } = said(request)
    const item = /材料 id：([^）"\\]+)/.exec(text)?.[1]
    if (text.includes('写一份解读') && item) {
      if (results === 0) return call('reading_write', {
        itemId: item,
        title: '双通路',
        paragraphs: [
          { text: PARA_1, source: { kind: 'paper', page: 1, quote: 'Free energy bounds surprise in the cortex' } },
          { kind: 'table', title: '对照', columns: ['项', '值'], rows: [['前馈', '误差']], caption: '表注', source: { kind: 'inference' } },
          { kind: 'widget', title: '参数试探', html: '<div><p>sim</p></div>', caption: '交互实验', source: { kind: 'inference' } },
        ],
      })
      return textReply('写好了')
    }
    if (text.includes('我猜温度升高会更散')) {
      if (results === 0) return call('reading_insert', {
        itemId,
        sectionId,
        afterId: firstParaId,
        block: { kind: 'table', title: '追问补表', columns: ['温度', '分布'], rows: [['高', '更平']], source: { kind: 'inference' } },
      })
      return textReply('猜得有意思，我在第一段下面补了对照表。')
    }
    return textReply('好')
  })
  const service = await createHttpService({ dataRoot, token, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  const server = serve({ fetch: service.app.fetch, hostname: '127.0.0.1', port: 0 })
  await new Promise<void>(resolve => { if (server.listening) resolve(); else server.once('listening', () => resolve()) })
  const address = server.address() as { port: number }
  const connection = { baseUrl: `http://127.0.0.1:${address.port}`, token }
  const api = new LumenApi(connection)
  const element = document.createElement('div')
  document.body.appendChild(element)
  const root = createRoot(element)
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => element.querySelector<T>(selector)
  const $$ = <T extends HTMLElement = HTMLElement>(selector: string) => [...element.querySelectorAll<T>(selector)]
  try {
    ensureTopic(service, 'paper', '自由能')
    const form = new FormData()
    form.set('file', new File([new Uint8Array(pagedPdf([PAGE_1, PAGE_2]))], 'cortex.pdf'))
    form.set('topicId', 'paper')
    const uploaded = await service.app.request('/lumen/library', { method: 'POST', headers, body: form })
    assert.equal(uploaded.status, 201)
    itemId = (await uploaded.json()).item.id as string
    localStorage.setItem('lumen.studio.topic', 'paper')
    await act(async () => root.render(createElement(StudioApp, { connection })))
    await until(() => !!$('.material-reading'), '素材行没有出现')
    await act(async () => $<HTMLButtonElement>('.material-reading')!.click())
    await until(() => !!$('.reading-block-table') && !!$('.reading-block-widget iframe'), '表格与交互小部件没有渲染出来')
    assert.equal($('.reading-block-table .reading-block-title')?.textContent, '对照')
    assert.deepEqual($$('.reading-table td').map(node => node.textContent), ['前馈', '误差'])
    assert.equal($('.reading-block-widget .reading-block-caption')?.textContent, '交互实验')

    const initial = await (await service.app.request(`/lumen/topics/paper/readings/${itemId}`, { headers })).json()
    sectionId = initial.sections[0].id
    firstParaId = initial.sections[0].paragraphs[0].id

    // ---- In-place widget expand/collapse: closes open AskWindow first (single Esc owner), keeps same iframe DOM node, toggles fillHeight, Esc closes, and expanded WIDGET_SEND carries R13 mark ----
    const iframe = $<HTMLIFrameElement>('.reading-block-widget iframe')!
    await until(() => !$$('.topic .topic-light-running').length, '解读首轮没有结束')
    const paraNode = $('[data-paragraph]')!
    const range = document.createRange(); range.setStart(paraNode.firstChild!, 0); range.setEnd(paraNode.firstChild!, 11)
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range)
    await act(async () => { $('.reading-column')!.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true })) })
    assert.ok($('.reading-ask'), '展开小部件前已打开段内追问小窗')
    const toggleBtn = $<HTMLButtonElement>('.reading-widget-toggle')!
    assert.ok(toggleBtn, 'widget 顶部应有放大按钮')
    await act(async () => toggleBtn.click())
    assert.equal($('.reading-ask'), null, '放大 widget 前先关闭 AskWindow，避免 Esc 冲突')
    assert.ok($('.reading-widget.is-expanded'), '点放大后原地进入展开态')
    assert.ok($('.reading-widget.is-expanded .widget-frame-fill'), '展开态切到 fillHeight')
    assert.equal($<HTMLIFrameElement>('.reading-block-widget iframe'), iframe, '放大不重挂 iframe，保持同一 DOM 节点')

    // ---- Widget __widgetSendMessage in expanded state posts with R13 marker, AI responds via reading_insert, and the new block lands live ----
    await act(async () => {
      window.dispatchEvent(new dom.window.MessageEvent('message', {
        data: { type: 'lumen-widget:sendMessage', text: '我猜温度升高会更散' },
        source: iframe.contentWindow,
      }))
    })
    await until(() => $$('.reading-block-table').length === 2, 'reading_insert 补插的块没有实时刷新进解读')
    assert.equal($$('.reading-block-table .reading-block-title')[0]?.textContent, '追问补表', '补插块落在第一段正下方')
    await until(async () => {
      const [session] = (await api.sessions('paper')).items
      if (!session) return false
      const id = encodeURIComponent(`paper:${session.taskId}`)
      const response = await fetch(`${connection.baseUrl}/api/agent-controller/lumen/sessions/${id}/threads/${id}/messages`, { headers })
      const messages = (await response.json()).messages as MastraDBMessage[]
      const hasMarked = messages.some(message => messageRole(message) === 'user' && messageText(message).startsWith('— 小实验') && messageText(message).includes('我猜温度升高会更散'))
      const hasReply = messages.some(message => messageRole(message) === 'assistant' && messageText(message).includes('补了对照表'))
      return hasMarked && hasReply
    }, '放大态小部件发出的消息没有带 R13 标记进入对话并得到 AI 回复')

    // ---- Esc collapses expanded widget in place without remounting the iframe ----
    await act(async () => window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    assert.equal($('.reading-widget.is-expanded'), null, 'Esc 收起放大态')
    assert.equal($('.reading-widget .widget-frame-fill'), null, '收起后退出 fillHeight')
    assert.equal($<HTMLIFrameElement>('.reading-block-widget iframe'), iframe, '收起后仍是同一 iframe DOM 节点')

    // ---- R1: inline WIDGET_ESCAPE is a no-op; expanded WIDGET_ESCAPE checks e.source and collapses in place ----
    await act(async () => {
      window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'lumen-widget:escape' }, source: iframe.contentWindow }))
    })
    assert.equal($('.reading-widget.is-expanded'), null, '非放大态下 iframe 内按 Esc 不触发任何动作')
    await act(async () => toggleBtn.click())
    assert.ok($('.reading-widget.is-expanded'), '再次进入放大态')
    await act(async () => {
      window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'lumen-widget:escape' }, source: window }))
    })
    assert.ok($('.reading-widget.is-expanded'), '非本 iframe source 的 WIDGET_ESCAPE 必须忽略')
    await act(async () => {
      window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'lumen-widget:escape' }, source: iframe.contentWindow }))
    })
    assert.equal($('.reading-widget.is-expanded'), null, '放大态焦点在 iframe 内按 Esc 经 WIDGET_ESCAPE 收起')
    assert.equal($<HTMLIFrameElement>('.reading-block-widget iframe'), iframe, 'iframe 内 Esc 收起后仍是同一 iframe DOM 节点')
  } finally {
    await act(async () => root.unmount())
    element.remove()
    server.close()
    await service.close()
    await rm(dataRoot, { recursive: true, force: true })
  }
})

test('receiver 退出 fillHeight 时重置 _lastH 并重新上报自然高度，且捕获阶段转发 Escape', async () => {
  const { buildReceiverSrcdoc, WIDGET_ESCAPE, WIDGET_FINALIZE, WIDGET_RESIZE, WIDGET_THEME } = await import('../src/components/widget/receiver.ts')
  const srcdoc = buildReceiverSrcdoc('', false)
  const resizes: number[] = []
  let escapes = 0
  const rdom = new JSDOM(srcdoc, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(win) {
      win.ResizeObserver = class { observe() {} disconnect() {} } as unknown as typeof win.ResizeObserver
    },
  })
  try {
    const root = rdom.window.document.getElementById('__root')!
    root.getBoundingClientRect = () => ({ height: 240, width: 600, top: 0, left: 0, right: 600, bottom: 240, x: 0, y: 0, toJSON() {} })
    rdom.window.addEventListener('message', (e: MessageEvent) => {
      if (e.data?.type === WIDGET_RESIZE) resizes.push(e.data.height)
      if (e.data?.type === WIDGET_ESCAPE) escapes++
    })
    rdom.window.postMessage({ type: WIDGET_FINALIZE, html: '<div>hello</div>', generation: 1 }, '*')
    await delay(120)
    const countBefore = resizes.length
    assert.ok(countBefore >= 1 && resizes.at(-1) === 240, `首次终态应报自然高度 240，实际 ${JSON.stringify(resizes)}`)
    // Enter fillHeight (expanded) then leave fillHeight (collapsed): height is still 240, so only resetting _lastH forces a fresh report
    rdom.window.postMessage({ type: WIDGET_THEME, fillHeight: true }, '*')
    await delay(120)
    rdom.window.postMessage({ type: WIDGET_THEME, fillHeight: false }, '*')
    await delay(180)
    assert.ok(resizes.length > countBefore && resizes.at(-1) === 240, `退出 fillHeight 后应强制重报自然高度，实际 ${JSON.stringify(resizes)}`)
    // Capture-phase Escape forwards WIDGET_ESCAPE to parent; other keys do not
    root.dispatchEvent(new rdom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    root.dispatchEvent(new rdom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await delay(20)
    assert.equal(escapes, 1, '捕获阶段仅 Escape 应转发 WIDGET_ESCAPE')
  } finally {
    rdom.window.close()
  }
})

test('解读内放大 widget 不多占前 3 个自动运行名额，且 widget 发消息触发 reading_insert 本轮自动跟焦（8255d27）', async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-reading-slots-'))
  const service = await createHttpService({ dataRoot, token, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixtureProvider(async () => textReply('ok')).fetch } })
  const server = serve({ fetch: service.app.fetch, hostname: '127.0.0.1', port: 0 })
  await new Promise<void>(resolve => { if (server.listening) resolve(); else server.once('listening', () => resolve()) })
  const address = server.address() as { port: number }
  const connection = { baseUrl: `http://127.0.0.1:${address.port}`, token }
  const element = document.createElement('div')
  document.body.appendChild(element)
  const root = createRoot(element)
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => element.querySelector<T>(selector)
  const $$ = <T extends HTMLElement = HTMLElement>(selector: string) => [...element.querySelectorAll<T>(selector)]
  try {
    ensureTopic(service, 'paper', '槽位验证')
    const form = new FormData()
    form.set('file', new File([new Uint8Array(pagedPdf([PAGE_1]))], 'cortex.pdf'))
    form.set('topicId', 'paper')
    const uploaded = await service.app.request('/lumen/library', { method: 'POST', headers, body: form })
    const itemId = (await uploaded.json()).item.id as string
    // Seed 4 widgets directly through the store: first 3 active, 4th idle
    service.application.studio.readings.write('paper', itemId, {
      title: '四个活结构图',
      paragraphs: [1, 2, 3, 4].map(n => ({
        kind: 'widget' as const,
        title: `图 ${n}`,
        html: `<div>w${n}</div>`,
        source: { kind: 'inference' as const },
      })),
    }, { threadId: null, runId: null })
    localStorage.setItem('lumen.studio.topic', 'paper')
    await act(async () => root.render(createElement(StudioApp, { connection })))
    await until(() => $$('.reading-block-widget').length === 4, '四个 widget 块没有渲染')
    assert.equal($$('.reading-block-widget iframe').length, 3, '默认前 3 个自动运行')
    assert.equal($$('.reading-widget-idle').length, 1, '第 4 个保持占位待点')
    // Expand the first widget: still 3 active iframes and 1 idle placeholder
    await act(async () => $<HTMLButtonElement>('.reading-widget-toggle')!.click())
    assert.ok($('.reading-widget.is-expanded'), '第一个 widget 进入放大态')
    assert.equal($$('.reading-block-widget iframe').length, 3, '放大不新增挂载、不多占自动运行名额')
    assert.equal($$('.reading-widget-idle').length, 1, '第 4 个占位状态不受放大影响')
    // Pure check for 8255d27: a widgetSend user message followed by completed reading_insert focuses that item
    const insertFocus = latestReadingWrite([
      { id: 'u1', role: 'user', createdAt: new Date(1), content: { format: 2, parts: [{ type: 'text', text: MODEL_TEXT.widgetSend('增益调到 8') }] } } as MastraDBMessage,
      { id: 'a1', role: 'assistant', createdAt: new Date(2), content: { format: 2, parts: [{ type: 'tool-invocation', toolInvocation: { state: 'result', toolCallId: 'c-ins', toolName: 'reading_insert', args: { itemId, sectionId: 's1', block: { text: 'ok' } }, result: { ok: true } } }] } } as MastraDBMessage,
    ])
    assert.deepEqual(insertFocus, { callId: 'c-ins', itemId }, 'widget 发消息触发本轮 reading_insert 时自动跟焦（8255d27）')
  } finally {
    await act(async () => root.unmount())
    element.remove()
    server.close()
    await service.close()
    await rm(dataRoot, { recursive: true, force: true })
  }
})

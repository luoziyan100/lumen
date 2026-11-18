/**
 * [INPUT]: the object builders (studio/objects: escapeXml, wrapText, boxSvg/boxWords, typewriterSvg/paperLines, cabinetSvg, easelSvg), newestTakeaway, the real StudioApp
 *          against a real HTTP service with the Mastra Controller and a deterministic model (holds the first section, writes nothing for one material, holds a second conversation)
 * [OUTPUT]: evidence for the objects in the product: data text is escaped before it enters SVG (<, &, quotes, </text>) and parses back as the same text; the card and the paper
 *           wrap to their lines with …; the box shows the current topic's newest takeaway; the empty Reading view is the typewriter alone (no text, no button); the Materials row sends
 *           the same bytes from two topics and shows R1's 409, sending nothing; the typewriter types while the reading is requested with no section, and stops when the first section lands or
 *           the run ends; objects are aria-hidden and outside the tab order
 * [POS]: O1/O2/O4's mechanism tests. Layout, stillness, hit tests and motion are browser facts, covered by scripts/sprite/ui-assert-objects.mts, not here
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
import { LumenApi } from '../src/mastra/data/client.ts'
import { messageRole, messageText } from '../src/mastra/data/feed.ts'
import type { MastraDBMessage } from '@mastra/client-js'
import type { SedimentEntry } from '../src/mastra/data/client.ts'
import { escapeXml, wrapText } from '../src/mastra/studio/objects/iso.ts'
import { boxSvg, boxWords, BOX_CARD } from '../src/mastra/studio/objects/box.ts'
import { paperLines, typewriterSvg } from '../src/mastra/studio/objects/typewriter.ts'
import { cabinetSvg } from '../src/mastra/studio/objects/cabinet.ts'
import { easelSvg } from '../src/mastra/studio/objects/easel.ts'
import { newestTakeaway } from '../src/mastra/studio/useSediment.ts'
import { answered } from '../src/mastra/studio/reading-ask.ts'
import { zh, MODEL_TEXT } from './helpers/zh.ts'
const S = zh.studio

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
for (const name of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Element', 'Node', 'NodeFilter', 'Text', 'DocumentFragment', 'MutationObserver', 'localStorage', 'getComputedStyle', 'navigator', 'DOMParser']) {
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

const token = 'ui-objects-token-at-least-24-characters'
const headers = { Authorization: `Bearer ${token}` }
async function until(check: () => boolean | Promise<boolean>, message: string, ms = 20000) {
  const limit = Date.now() + ms
  while (!await check()) {
    if (Date.now() > limit) throw new Error(message)
    await act(async () => { await delay(20) })
  }
}
/** Parse markup as SVG/XML: a malformed document (an unescaped < or &) yields a parsererror element */
const parse = (markup: string) => new DOMParser().parseFromString(markup, 'image/svg+xml')
const texts = (markup: string) => [...parse(markup).querySelectorAll('text')].map(node => node.textContent)

test('escaping: titles and takeaways enter SVG as text, never as markup', () => {
  assert.equal(escapeXml(`a<b & "c" 'd' </text>`), 'a&lt;b &amp; &quot;c&quot; &#39;d&#39; &lt;/text&gt;')
  const hostile = [`<script>alert(1)</script>`, 'R&D & more', `"quoted" and 'single'`, '</text><text x="0">forged', '<![CDATA[x]]>']
  const blank = parse(boxSvg({ labels: S.objects.box, words: null }))
  for (const value of hostile) {
    // The box's front card
    const box = boxSvg({ labels: S.objects.box, words: { stamp: value, lines: [value] } })
    const doc = parse(box)
    assert.equal(doc.querySelector('parsererror'), null, `card markup stays well-formed: ${value}`)
    assert.equal(doc.querySelectorAll('script').length, 0)
    assert.equal(doc.querySelectorAll('text').length, blank.querySelectorAll('text').length + 2, 'exactly the stamp and one line are added; nothing forged')
    assert.ok(texts(box).filter(t => t === value).length === 2, `the stamp and the line read back as the same text: ${value}`)
    // The typewriter's paper: a title wraps across lines, and the joined lines read back as the title
    const lines = paperLines(value)
    const paper = typewriterSvg({ lines })
    assert.equal(parse(paper).querySelector('parsererror'), null, `paper markup stays well-formed: ${value}`)
    assert.equal(parse(paper).querySelectorAll('script').length, 0)
    assert.deepEqual(texts(paper).filter(t => lines.includes(t!)), lines, `each paper line reads back as written: ${value}`)
  }
  for (const markup of [cabinetSvg({ labels: S.objects.cabinet }), easelSvg(), typewriterSvg({ lines: [] })]) assert.equal(parse(markup).querySelector('parsererror'), null)
})

test('wrapping: the card takes two lines and the paper three, ending in … when the text runs over', () => {
  assert.deepEqual(wrapText('', 80, 5, 2), [])
  assert.deepEqual(wrapText('  short  ', 80, 5, 2), ['short'])
  const long = '预测往下走，误差往上报，大脑多半时间在猜，而且猜得相当好，只有落差才往上传。'
  const card = boxWords(long, '11-17')!
  assert.equal(card.lines.length, BOX_CARD.lines)
  assert.ok(card.lines[1]!.endsWith('…'), 'a takeaway longer than two lines ends in …')
  assert.equal(card.lines.join('').replace('…', ''), long.slice(0, card.lines.join('').length - 1))
  const latin = paperLines('Attention Is All You Need: a transformer architecture based solely on attention mechanisms, dispensing with recurrence and convolutions entirely')
  assert.equal(latin.length, 3)
  assert.ok(latin.slice(0, 2).every(line => !line.endsWith(' ') && !/\S-$/.test(line)), 'Latin lines break at spaces')
  assert.ok(latin[2]!.endsWith('…'))
  assert.equal(boxWords('   ', '11-17'), null, 'blank text leaves the card blank')
})

test('a request counts as answered once an assistant message follows it', () => {
  const message = (role: 'user' | 'assistant', text: string) => ({ id: `${role}-${text}`, role, createdAt: new Date(), content: { format: 2, parts: [{ type: 'text', text }] } }) as unknown as MastraDBMessage
  assert.equal(answered([], 'write'), false)
  assert.equal(answered([message('user', 'write')], 'write'), false, 'sent, nothing back yet')
  assert.equal(answered([message('user', 'write'), message('assistant', 'done')], 'write'), true)
  assert.equal(answered([message('user', 'write'), message('assistant', 'done'), message('user', 'write')], 'write'), false, 'the same request again waits for its own answer')
  assert.equal(answered([message('user', 'other'), message('assistant', 'done')], 'write'), false)
})

test('the box picks the current topic\'s newest takeaway', () => {
  const entry = (id: string, topicId: string, createdAt: string, text = id) => ({ id, topicId, text, createdAt, updatedAt: createdAt, origin: 'typed', state: 'unverified', quote: null, links: [] }) as unknown as SedimentEntry
  const items = [entry('a', 't1', '2026-11-17T08:00:00Z'), entry('b', 't1', '2026-11-17T09:00:00Z'), entry('c', 't2', '2026-11-17T10:00:00Z'), entry('d', 't1', '2026-11-16T23:00:00Z')]
  assert.equal(newestTakeaway(items, 't1')?.id, 'b', 'newest by when it was written, whatever the list order')
  assert.equal(newestTakeaway(items, 't2')?.id, 'c')
  assert.equal(newestTakeaway(items, 't3'), null, 'another topic\'s entries never count')
  assert.equal(newestTakeaway([], 't1'), null)
  // An edit does not make an entry newer: updatedAt is ignored
  assert.equal(newestTakeaway([entry('old', 't1', '2026-11-01T00:00:00Z'), { ...entry('new', 't1', '2026-11-02T00:00:00Z') }].map(e => e.id === 'old' ? { ...e, updatedAt: '2026-12-01T00:00:00Z' } : e), 't1')?.id, 'new')
})

test('Reading empty view: the typewriter alone; the Materials row writes (same message across topics, readable 409), and the typewriter types until the first section or the end of the run', { timeout: 180000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-ui-objects-'))
  let calls = 0, releaseFirst!: () => void, releaseHold!: () => void
  const first = new Promise<void>(resolve => { releaseFirst = resolve })
  const hold = new Promise<void>(resolve => { releaseHold = resolve })
  const call = (name: string, args: unknown) => toolReply(name, args, `call-${++calls}`)
  const fixture = fixtureProvider(async (request: ProviderRequest) => {
    const lastUser = request.messages.map(message => message.role).lastIndexOf('user')
    const text = JSON.stringify(request.messages[lastUser]), results = request.messages.slice(lastUser).filter(message => message.role === 'tool').length
    if (text.includes('hold')) { await hold; return textReply('ok') }
    const item = /材料 id：([^）"\\]+)/.exec(text)?.[1]
    if (text.includes('写一份解读') && item) {
      if (text.includes('《quiet》') || text.includes('《busy》')) return textReply('这一份我写不了。')       // the run ends with no section
      if (results === 0) { await first; return call('reading_write', { itemId: item, title: 'What the notes say', paragraphs: [{ text: 'The notes describe the brain as a predicting machine.', source: { kind: 'inference' } }] }) }
      return textReply('写好了')
    }
    return textReply('好')
  })
  const service = await createHttpService({ dataRoot, token, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  const server = serve({ hostname: '127.0.0.1', port: 0, fetch: request => service.app.fetch(request) })
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const connection = { baseUrl: `http://127.0.0.1:${address.port}`, token }
  const api = new LumenApi(connection)
  // Topics: 'button' and 'row' share one material (same message by two paths); 'busy' has a running conversation; 'quiet' gets no section
  for (const [id, title] of [['button', 'A 首个'], ['row', 'B 素材行'], ['busy', 'C 忙'], ['quiet', 'D 没写出']]) ensureTopic(service, id, title)
  const shared = (await api.upload({ topicId: 'button' }, new File(['# Predictive notes\n\nThe brain minimises free energy over time.'], 'notes.md', { type: 'text/markdown' }))).itemId
  service.application.studio.topics.reference('row', shared)
  await api.upload({ topicId: 'busy' }, new File(['# Busy notes\n\nAnything.'], 'busy.md', { type: 'text/markdown' }))
  await api.upload({ topicId: 'quiet' }, new File(['# Quiet notes\n\nNothing to say.'], 'quiet.md', { type: 'text/markdown' }))
  localStorage.clear()
  const element = document.createElement('div'); document.body.append(element)
  const root = createRoot(element)
  const $ = <T extends Element = HTMLElement>(selector: string) => element.querySelector<T & HTMLElement>(selector)
  const $$ = (selector: string) => [...element.querySelectorAll<HTMLElement>(selector)]
  const pick = async (title: string) => { await act(async () => $$('.studio-topics .topic').find(node => node.textContent!.includes(title))!.click()) }
  const stored = async (topicId: string) => {
    const sessions = (await api.sessions(topicId)).items
    const out: string[] = []
    for (const session of sessions) {
      const id = encodeURIComponent(`${topicId}:${session.taskId}`)
      const response = await fetch(`${connection.baseUrl}/api/agent-controller/lumen/sessions/${id}/threads/${id}/messages`, { headers })
      out.push(...((await response.json()).messages as MastraDBMessage[]).filter(message => messageRole(message) === 'user').map(messageText))
    }
    return out
  }
  const running = (topicId: string) => api.topics().then(result => !!result.items.find(topic => topic.id === topicId)?.running)
  try {
    await act(async () => root.render(createElement(StudioApp, { connection })))
    await until(() => $$('.studio-topics .topic').length === 4, '主题没有列出')

    // ---- One material, none picked: the paper shows its title; the typewriter is the whole empty view (no text, no button) and is decoration ----
    await pick('A 首个')
    await until(() => !!$('.reading-typewriter') && $$('.material').length === 1, '唯一素材时空态没有出现')
    assert.equal($('.reading-start button'), null, '空态没有按钮')
    const host = $('.reading-typewriter')!
    assert.equal(host.getAttribute('aria-hidden'), 'true')
    assert.equal(host.getAttribute('tabindex'), null, '物件不在 Tab 序列里')
    const title = (await api.library()).items.find(item => item.id === shared)!.title
    assert.ok(texts(host.innerHTML).includes(title), '纸上是资料标题')
    assert.ok(!host.classList.contains('is-typing'), '没请求时不打字')

    // ---- The Materials row sends; the typewriter types while the first section is held, and no line joins it ----
    await act(async () => $<HTMLButtonElement>('.material-reading')!.click())
    // The model holds the first section, so the run is live but the message is not stored yet (native Memory saves it with the step)
    await until(() => running('button'), '素材行没有发起运行')
    await until(() => !!$('.reading-typewriter.is-typing'), '请求后、第一节之前打字机在打字')
    assert.equal($('.reading-start [role=status]'), null, '打字就是状态，没有状态句')
    releaseFirst()
    await until(() => $$('.reading-section').length === 1, '第一节没有出现')
    await until(async () => (await stored('button')).length === 1, '素材行的请求没有存进对话')
    const first = (await stored('button'))[0]
    assert.equal($('.reading-typewriter'), null, '第一节一到，打字机就让位')
    assert.equal($('.is-typing'), null)

    // ---- The row in another topic with the same material sends the same bytes ----
    await until(async () => !(await running('button')), '第一个主题的运行没结束')
    await pick('B 素材行')
    await until(() => $$('.material').length === 1, '素材行没有出现')
    await act(async () => $<HTMLButtonElement>('.material-reading')!.click())
    await until(async () => (await stored('row')).length === 1, '素材行没有发出请求')
    assert.equal(first, (await stored('row'))[0], '两个主题的素材行发的是同一句')
    assert.equal(first, MODEL_TEXT.writeReading(title, shared))
    await until(async () => !(await running('row')), '第二个主题的运行没结束')

    // ---- R1: another conversation runs; the row shows the 409 words, nothing is sent and the typewriter does not type ----
    // The open conversation must be idle and not the running one, else the app follows the running one and the row is disabled instead (also correct, but no 409).
    // So the row first opens a conversation whose run ends with no section; only then does another conversation start and hold
    await pick('C 忙')
    await until(() => !!$('.reading-typewriter') && $$('.material').length === 1, '忙主题的空态没有出现')
    await act(async () => $<HTMLButtonElement>('.material-reading')!.click())
    await until(async () => (await stored('busy')).length === 1 && !(await running('busy')) && !$('.reading-typewriter.is-typing'), '忙主题的第一次请求没有结束')
    const other = { topicId: 'busy', taskId: 'other' }
    await api.open(other)
    const holding = api.session(other).sendMessage('hold')
    await until(() => running('busy'), '另一段对话没有跑起来')
    await until(() => !$<HTMLButtonElement>('.material-reading')!.disabled, '打开的对话空闲时素材行应可用')
    const before = (await stored('busy')).filter(text => text !== 'hold').length
    await act(async () => $<HTMLButtonElement>('.material-reading')!.click())
    await until(() => !!$('.studio-materials .mw-error')?.textContent, '素材行忙时没有显示可读的 409')
    assert.match($('.studio-materials .mw-error')!.textContent!, /一个主题同一时刻只跑一段对话/)
    assert.equal((await stored('busy')).filter(text => text !== 'hold').length, before, '忙时什么都没发')
    assert.equal($('.reading-typewriter.is-typing'), null, '被拒时不打字')
    releaseHold(); await holding
    await until(async () => !(await running('busy')), '另一段对话没结束')

    // ---- A run that ends with no section: typing stops with the run, the empty view stays the typewriter alone ----
    await pick('D 没写出')
    await until(() => !!$('.reading-typewriter') && $$('.material').length === 1, '没写出主题的空态没有出现')
    await act(async () => $<HTMLButtonElement>('.material-reading')!.click())
    await until(async () => (await stored('quiet')).length === 1, '没写出主题没有发出请求')
    await until(async () => !(await running('quiet')) && !$('.reading-typewriter.is-typing'), '运行结束后打字机仍在打字')
    assert.ok($('.reading-typewriter'), '没有节时打字机还在')
    assert.equal($('.reading-start [role=status]'), null, '运行结束后没有状态句')
    assert.equal($('.reading-start button'), null, '运行结束后也没有按钮')
  } finally {
    releaseFirst(); releaseHold()
    await act(async () => root.unmount())
    element.remove()
    server.close()
    await service.close()
    await rm(dataRoot, { recursive: true, force: true })
  }
})

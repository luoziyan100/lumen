/**
 * [INPUT]: src/i18n (registry, catalogs, Intl helpers, store, error mapping), the service's ERROR_CODES, a real HTTP service, real React components (jsdom)
 * [OUTPUT]: i18n evidence: en/zh key parity; every registered locale loads; plural/number/date/relative text per language; English on first launch,
 *           unknown stored values back to English, the choice survives a reload; <html lang> follows; error codes map to the UI language, unknown codes
 *           fall back to the service text, params are filled in; the code list equals the catalogs' keys; real service errors carry codes;
 *           a switch re-renders mounted components in place, and Settings › Appearance lists languages by native name
 * [POS]: unit and component level; the browser pass checks layout and the running app in both languages
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createElement, act } from 'react'
import { JSDOM } from 'jsdom'
import { serve } from '@hono/node-server'
import { createHttpService } from '../../mastra-service/src/server.ts'
import { fixtureProvider, textReply } from '../../mastra-service/tests/provider-fixture.ts'
import { ERROR_CODES } from '../../mastra-service/src/http/error-codes.ts'

const dom = new JSDOM('<!doctype html><html lang="x"><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
for (const name of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'DocumentFragment', 'MutationObserver', 'getComputedStyle', 'navigator', 'localStorage']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name as keyof typeof dom.window] })
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window) })
after(() => dom.window.close())
register('./helpers/tsx-loader.mjs', import.meta.url)
const i18n = await import('../src/i18n/index.ts')
const { en } = await import('../src/i18n/locales/en.ts')
const { zh } = await import('../src/i18n/locales/zh.ts')
const format = await import('../src/i18n/format.ts')
const { LumenApi, RequestError } = await import('../src/mastra/data/client.ts')
const { createRoot } = await import('react-dom/client')

/** Every path to a leaf, with the leaf's kind; functions count as leaves. */
function shape(value: unknown, path = ''): string[] {
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, item]) => shape(item, path ? `${path}.${key}` : key)).sort()
  return [`${path}:${typeof value}`]
}

test('en and zh have the same keys with the same kinds (also enforced by the Messages type)', () => {
  assert.deepEqual(shape(zh), shape(en))
  assert.ok(shape(en).length > 500, 'the catalogs carry the whole UI')
})

test('every registered locale loads, native names, one default', async () => {
  assert.deepEqual(i18n.localeNames(), [{ id: 'en', nativeName: 'English' }, { id: 'zh', nativeName: '中文' }])
  assert.equal(i18n.DEFAULT_LOCALE, 'en')
  for (const entry of i18n.LOCALES) assert.deepEqual(shape(await entry.load()), shape(en), entry.id)
})

test('plural, number, date and relative time follow the language through Intl', () => {
  assert.equal(format.plural('en', 1, { one: '# block', other: '# blocks' }), '1 block')
  assert.equal(format.plural('en', 3, { one: '# block', other: '# blocks' }), '3 blocks')
  assert.equal(format.plural('en', 1200, { one: '# block', other: '# blocks' }), '1,200 blocks')
  assert.equal(format.plural('zh-CN', 1, { one: '不该用', other: '# 块' }), '1 块', 'Chinese has one form')
  assert.equal(en.studio.board.removeBody(1), "Its 1 block and the board's version history will be deleted. This can't be undone.")
  assert.equal(en.studio.board.removeBody(2).startsWith('Its 2 blocks'), true)
  assert.equal(en.process.toolCount(1), '1 tool')
  assert.equal(format.formatNumber('en', 1234567), '1,234,567')
  assert.equal(format.formatNumber('zh-CN', 1234567), '1,234,567')
  const when = Date.UTC(2026, 10, 14, 9, 5)
  assert.equal(format.formatDateTime('en', when, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }), 'Nov 14, 2026, 9:05 AM')
  assert.equal(format.formatDateTime('zh-CN', when, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }), '2026年11月14日 09:05')
  assert.equal(format.formatDateTime('en', 'not a date'), '', 'invalid dates print nothing')
  assert.equal(format.formatRelative('en', -1, 'day'), 'yesterday')
  assert.equal(format.formatRelative('zh-CN', -1, 'day'), '昨天')
  assert.equal(en.greeting(9), 'Good morning'); assert.equal(en.greeting(12), 'Good afternoon'); assert.equal(en.greeting(22), 'Good evening')
  assert.equal(zh.greeting(12), '中午好'); assert.equal(zh.greeting(15), '下午好')
})

test('first launch is English; the choice persists; unknown values become English; <html lang> follows', async () => {
  localStorage.clear()
  assert.equal(i18n.loadLocale(), 'en', 'nothing stored')
  assert.equal(await i18n.bootstrapLocale(), 'en')
  assert.equal(document.documentElement.lang, 'en')
  assert.equal(i18n.t().studio.views.settled, 'Takeaways')
  assert.equal(await i18n.setLocale('zh'), 'zh')
  assert.deepEqual(JSON.parse(localStorage.getItem(i18n.LOCALE_STORAGE_KEY)!), { version: 1, locale: 'zh' })
  assert.equal(document.documentElement.lang, 'zh-CN')
  assert.equal(i18n.t().studio.views.settled, '沉淀')
  assert.equal(i18n.loadLocale(), 'zh', 'a reload reads the stored choice')
  for (const raw of ['{"version":1,"locale":"fr"}', '"zh"', 'not json', '{"locale":42}']) {
    localStorage.setItem(i18n.LOCALE_STORAGE_KEY, raw)
    assert.equal(i18n.loadLocale(), raw === '"zh"' ? 'zh' : 'en', raw)
  }
  assert.equal(i18n.normalizeLocale({ locale: 'zh' }), 'zh')
  assert.equal(i18n.normalizeLocale('de'), 'en')
  await i18n.setLocale('en')
})

test('error codes: a known code is said in the UI language with its params; an unknown code falls back to the service text', async () => {
  const body = { error: '这张白板满了（12/12）。…', code: 'board.sheet_full', params: { used: 12, capacity: 12 } }
  await i18n.setLocale('en', false)
  assert.equal(i18n.serviceErrorText(body, 'fallback'), 'This board is full (12/12). Click + to start a new one.')
  assert.equal(i18n.serviceErrorText({ error: '没有这张白板', code: 'board.sheet_not_found' }, 'x'), "This board doesn't exist.")
  assert.equal(i18n.serviceErrorText({ error: '未来的新错误', code: 'later.unknown' }, 'x'), '未来的新错误', 'unknown code: the service text')
  assert.equal(i18n.serviceErrorText({ error: 'Unauthorized' }, 'x'), 'Unauthorized', 'no code: the service text')
  assert.equal(i18n.serviceErrorText(null, 'Request failed (500)'), 'Request failed (500)', 'no body: the fallback')
  await i18n.setLocale('zh', false)
  assert.equal(i18n.serviceErrorText(body, 'fallback'), '这张白板满了（12/12）。点 ＋ 开一张新的。')
  assert.equal(i18n.serviceErrorText({ error: '…', code: 'upload.too_large', params: { limit: 25 } }, 'x'), '上传内容超过 25 MiB 请求上限，请缩小文件后重试')
  await i18n.setLocale('en', false)
})

test('the service code list and both catalogs have exactly the same error keys', () => {
  const codes = [...ERROR_CODES].sort()
  assert.equal(new Set(codes).size, codes.length, 'codes are unique')
  assert.deepEqual(Object.keys(en.errors).sort(), codes)
  assert.deepEqual(Object.keys(zh.errors).sort(), codes)
})

test('real service errors carry codes; LumenApi shows them in the UI language and keeps the Chinese text for models', async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-i18n-errors-')), token = 'i18n-errors-token-at-least-24-characters'
  const fixture = fixtureProvider(() => textReply('好'))
  const service = await createHttpService({ dataRoot, token, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  const server = serve({ hostname: '127.0.0.1', port: 0, fetch: request => service.app.fetch(request) })
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve))
  const port = (server.address() as { port: number }).port, api = new LumenApi({ baseUrl: `http://127.0.0.1:${port}`, token })
  try {
    const raw = await fetch(`http://127.0.0.1:${port}/lumen/sheets/missing`, { headers: api.headers() })
    assert.deepEqual({ status: raw.status, body: await raw.json() }, { status: 404, body: { error: '没有这张白板', code: 'board.sheet_not_found' } })
    await i18n.setLocale('en', false)
    await assert.rejects(api.sheet('missing'), (error: unknown) => error instanceof RequestError && error.message === "This board doesn't exist." && error.detail?.error === '没有这张白板')
    await i18n.setLocale('zh', false)
    await assert.rejects(api.sheet('missing'), (error: unknown) => error instanceof Error && error.message === '没有这张白板')
    // an upload over the request limit: the 413 comes from the service, with the limit as a param
    const big = new File([new Uint8Array(25 * 1024 * 1024 - 64)], 'big.pdf', { type: 'application/pdf' })
    const topic = await api.createTopic('上传')
    await i18n.setLocale('en', false)
    await assert.rejects(api.upload({ topicId: topic.id }, big), (error: unknown) => error instanceof Error && error.message === "Couldn't upload “big.pdf”: The upload is over the 25 MiB request limit. Use a smaller file and try again.")
    await i18n.setLocale('zh', false)
    await assert.rejects(api.upload({ topicId: topic.id }, big), (error: unknown) => error instanceof Error && error.message === '附件「big.pdf」上传失败：上传内容超过 25 MiB 请求上限，请缩小文件后重试')
  } finally {
    await i18n.setLocale('en', false)
    server.close(); await service.close()
    await rm(dataRoot, { recursive: true, force: true })
  }
})

test('switching re-renders mounted components in place; Settings › Appearance lists languages by native name', async () => {
  const { ViewNav } = await import('../src/mastra/studio/ViewNav.tsx')
  const { PreferencePane } = await import('../src/mastra/views/chrome/Appearance.tsx')
  const { DEFAULT_APPEARANCE } = await import('../src/appearance/index.ts')
  await i18n.setLocale('en', false)
  const element = document.createElement('div'); document.body.append(element)
  const root = createRoot(element)
  const view = () => createElement('div', null, createElement('header', null, createElement(ViewNav, { view: 'board', onView() {} })), createElement(PreferencePane, { state: DEFAULT_APPEARANCE, onChange() {} }))
  try {
    await act(async () => root.render(view()))
    const tabs = () => [...element.querySelectorAll('.studio-views:not(.studio-views-ghost) [role=tab]')].map(tab => tab.getAttribute('aria-label'))
    const headings = () => [...element.querySelectorAll('.pref-h')].map(node => node.firstChild?.textContent)
    const picker = () => element.querySelector('.pref-language')!
    assert.deepEqual(tabs(), ['Board', 'Takeaways', 'Concept map', 'Ideas', 'All'])
    assert.equal(headings()[0], 'Language', 'the language row comes first')
    assert.match(picker().textContent ?? '', /English/)
    const marker = element.querySelector('.pref-pane')
    await act(async () => { await i18n.setLocale('zh', false) })
    assert.deepEqual(tabs(), ['白板', '沉淀', '概念图', '灵感', '全部'])
    assert.equal(headings()[0], '语言')
    assert.match(picker().textContent ?? '', /中文/)
    assert.equal(element.querySelector('.pref-pane'), marker, 'the same DOM node: re-rendered, not remounted')
  } finally {
    await act(async () => root.unmount()); element.remove()
    await i18n.setLocale('en', false)
  }
})

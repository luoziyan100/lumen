/**
 * [INPUT]: 真实 StudioApp（素材栏 + 阅读器）与 React DOM、真实 HTTP 服务与资料库（catalog.sqlite + library/）；arXiv 在研究网络 fetch 边界换成可控桩，原生 invoke 在 __TAURI_INTERNALS__ 边界记录
 * [OUTPUT]: L3/L5 界面证据：arXiv 摘要页链接经服务收进主题后素材行主行是 API 标题（title 属性给全名、CSS 单行省略）、副行只有链接短写（chrome C6：title 给完整 URL，没有 AI 找来/年份/读到哪）、阅读器头部用新标题；
 *           桌面里「系统打开」只把条目 id 交给 open_library_item、「保存」仍走保存对话框且文件名补上扩展名；saveName 规则
 * [POS]: 界面接线验收；省略号与明暗/尺寸的真实渲染在浏览器断言里核对，原生打开预览在装机后核对，这里不宣称覆盖 WebKit
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire, register } from 'node:module'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { createElement, act } from 'react'
import { JSDOM } from 'jsdom'
import { serve } from '@hono/node-server'
import { createHttpService } from '../../mastra-service/src/server.ts'
import { ensureTopic } from '../../mastra-service/tests/topic-fixture.ts'
import { atom, titledPdf } from '../../mastra-service/tests/studio/library-fixtures.ts'
import { zh } from './helpers/zh.ts'
const S = zh.studio, C = zh.chat

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
for (const name of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Element', 'Node', 'NodeFilter', 'Text', 'DocumentFragment', 'MutationObserver', 'localStorage', 'getComputedStyle', 'navigator']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name as keyof typeof dom.window] })
}
// jsdom 的 FileReader 只认 jsdom 自己的 Blob，而 fetch 给的是 Node Blob（WebKit 里是同一种）；测试环境补一个只够 readAsDataURL 的读取器
Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: class {
  result: string | null = null; onload: (() => void) | null = null; onerror: (() => void) | null = null
  readAsDataURL(blob: Blob) { void blob.arrayBuffer().then(bytes => { this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`; this.onload?.() }, () => this.onerror?.()) }
} })
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } })
Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) })
Object.defineProperty(dom.window.HTMLElement.prototype, 'scrollTo', { configurable: true, value(this: HTMLElement, options: ScrollToOptions) { this.scrollTop = Number(options?.top ?? 0) } })
after(() => dom.window.close())
// pdf.js 的 worker 入口：`?url` 指向真实 worker 文件（同 pdf-fit.test.ts），阅读器真的把 PDF 读出来
const worker = pathToFileURL(createRequire(import.meta.url).resolve('pdfjs-dist/build/pdf.worker.min.mjs')).href
register('./helpers/tsx-loader.mjs', import.meta.url)
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(specifier, context, next) { if (specifier.endsWith('?url')) return { url: 'data:text/javascript,export default ${JSON.stringify(worker)}', shortCircuit: true }; return next(specifier, context) } export async function load(url, context, next) { const result = await next(url, context); if (url.endsWith('/WidgetFrame.tsx')) return { ...result, source: String(result.source).replaceAll('import.meta.env.BASE_URL', JSON.stringify('/')) }; return result }`), import.meta.url)
const { createRoot } = await import('react-dom/client')
const { StudioApp } = await import('../src/mastra/studio/StudioApp.tsx')
const { saveName } = await import('../src/mastra/views/reader/DocumentReader.tsx')
const { shortLink } = await import('../src/mastra/studio/Materials.tsx')

async function until(check: () => boolean, message: string, ms = 15000) {
  const limit = Date.now() + ms
  while (!check()) {
    if (Date.now() > limit) throw new Error(message)
    await act(async () => { await delay(20) })
  }
}

const TITLE = 'Banding instabilities in poroelastic media under flow-driven compaction: a long title that still has to fit one line'

test('saveName：没有扩展名按原件类型补，已有的不重复', () => {
  assert.equal(saveName('Attention Is All You Need', 'application/pdf'), 'Attention Is All You Need.pdf')
  assert.equal(saveName('report.md', 'text/markdown'), 'report.md')
  assert.equal(saveName('paper.PDF', 'application/pdf'), 'paper.PDF')
  assert.equal(saveName('笔记', 'text/plain; charset=utf-8'), '笔记.txt')
  assert.equal(saveName('blob', 'application/octet-stream'), 'blob')
})

test('素材与阅读器：arXiv 链接收成 PDF，主行 API 标题、副行只有链接短写、阅读器头部新标题；桌面系统打开只交条目 id，保存仍走对话框', { timeout: 90000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-library-ui-')), token = 'library-ui-token-at-least-24-characters'
  const pdf = titledPdf({ lines: [[17, 'Banding instabilities']] })
  const fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input instanceof Request ? input.url : input))
    if (url.hostname === 'export.arxiv.org') return new Response(atom('2611.14235', TITLE, ['A. Author', 'B. Author', 'C. Author', 'D. Author'], '2026-11-18T00:00:00Z'), { headers: { 'content-type': 'application/atom+xml' } })
    if (/^https:\/\/arxiv\.org\/pdf\/2611\.14235(v\d+)?$/.test(url.href)) return new Response(new Uint8Array(pdf), { headers: { 'content-type': 'application/pdf' } })
    return new Response('not found', { status: 404 })
  }) as typeof globalThis.fetch
  const service = await createHttpService({ dataRoot, token, research: { fetch } })
  const server = serve({ hostname: '127.0.0.1', port: 0, fetch: service.app.fetch })
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const connection = { baseUrl: `http://127.0.0.1:${address.port}`, token }
  ensureTopic(service, 'banding', '压实里的条带')
  localStorage.clear()
  const element = document.createElement('div'); document.body.append(element)
  const root = createRoot(element)
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => element.querySelector<T>(selector)
  const $$ = (selector: string) => [...element.querySelectorAll<HTMLElement>(selector)]
  const button = (name: string) => [...element.querySelectorAll<HTMLButtonElement>('.studio-reader button')].find(item => item.getAttribute('aria-label') === name)
  const calls: Array<[string, Record<string, unknown>]> = []
  try {
    // 右栏不再加链接（chrome C3）：链接经服务端未改的资料库接口收进主题，与对话里模型取链接走同一入口
    const added = await service.app.request('/lumen/library', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://arxiv.org/abs/2611.14235v1', topicId: 'banding' }) })
    assert.equal(added.status, 201, await added.clone().text())
    const sourceUrl = (await added.json() as { item: { sourceUrl: string } }).item.sourceUrl
    await act(async () => root.render(createElement(StudioApp, { connection })))
    await until(() => $$('.material').length === 1, `链接没有出现在素材里：${$('.studio-materials')?.textContent}`)

    // ---- L3：主行是 API 标题，悬停 title 给全名；副行只有链接短写（C6），悬停给完整 URL ----
    const title = $('.material-title')!
    assert.deepEqual([title.textContent, title.getAttribute('title')], [TITLE, TITLE])
    const css = await readFile(new URL('../src/mastra/studio/studio.css', import.meta.url), 'utf8')
    const link = $('.material-link')!
    assert.match(sourceUrl, /^https:\/\/arxiv\.org\/abs\/2611\.14235/)
    assert.deepEqual([link.textContent, link.getAttribute('title')], [shortLink(sourceUrl), sourceUrl])
    assert.match(link.textContent!, /^arxiv\.org\/abs\/2611\.14235/)
    assert.deepEqual([...$('.material-text')!.children].map(node => node.textContent), [TITLE, shortLink(sourceUrl)], 'C6：行里只有标题与链接两段文字')
    assert.doesNotMatch($('.material-open')!.textContent!, /AI 找来|读到|未打开|2026(?!\.)/, 'C6：没有 AI 找来、读到哪、年份')
    assert.match(css, /\.material-link \{[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/, '副行单行省略')
    assert.match(css, /\.material-title \{[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/, '主行单行省略')

    // ---- 阅读器头部用新标题 ----
    await act(async () => $('.material-open')!.click())
    await until(() => !!button(S.reader.open), '阅读器没有读出原件')
    const head = $('.studio-reader .reader-title')!
    assert.deepEqual([head.textContent, head.getAttribute('title')], [TITLE, TITLE])
    const itemId = (await (await service.app.request('/lumen/library', { headers: { Authorization: `Bearer ${token}` } })).json()).items[0].id

    // ---- L5：桌面里系统打开只交 id；保存仍是保存对话框（save_workspace_file），文件名补 .pdf ----
    Object.assign(globalThis, { isTauri: true })
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: { invoke: async (command: string, args: Record<string, unknown>) => { calls.push([command, args]); return null } } })
    await act(async () => button(S.reader.open)!.click())
    await until(() => calls.length === 1, '系统打开没有调用原生')
    assert.deepEqual(calls[0], ['open_library_item', { itemId }])
    await act(async () => button(C.download)!.click())
    await until(() => calls.length === 2, `保存没有调用原生：${$('.studio-reader [role=alert]')?.textContent}`)
    assert.equal(calls[1]![0], 'save_workspace_file')
    assert.equal(calls[1]![1].name, `${TITLE}.pdf`)
    assert.equal(Buffer.from(String(calls[1]![1].contentBase64), 'base64').subarray(0, 5).toString(), '%PDF-')
    assert.equal($('.studio-reader [role=alert]')?.textContent ?? null, null)
  } finally {
    Object.assign(globalThis, { isTauri: false })
    await act(async () => root.unmount())
    element.remove()
    server.close()
    await service.close()
    await rm(dataRoot, { recursive: true, force: true })
  }
})

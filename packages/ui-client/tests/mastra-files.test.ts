/**
 * [INPUT]: 工作区引用解析、真实 DocumentReader 及 HTTP 文件响应（含 ETag/304）
 * [OUTPUT]: 当前稿路径边界、阅读器版本检查与资料库读取、附件完整读取与上传失败保留
 * [POS]: 文件预览路由边界，不替代原生阅读器验收
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import './helpers/zh.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { workspaceLink, writableDocument } from '../src/mastra/data/file-links.ts'

test('附件读取失败不发送请求，完整上传保留字节和名称并展示服务错误', async () => {
  const { createServer } = await import('node:http')
  const { LumenApi } = await import('../src/mastra/data/client.ts')
  const binary = new Uint8Array([0, 1, 128, 255]), name = '“标准录音 21”-转文本结果(1).txt'
  let requests = 0, reject = false
  const received: File[] = []
  const server = createServer(async (req, res) => {
    requests++
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
    const form = await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': req.headers['content-type']! } }).formData()
    received.push(form.get('file') as File)
    res.writeHead(reject ? 413 : 200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(reject ? { error: '上传内容超过 25 MiB 请求上限' } : { item: { id: 'item-file', title: name, kind: 'text', size: 4, mediaType: 'text/plain' } }))
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const api = new LumenApi({ baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}`, token: 'test' })
  const identity = { topicId: 'p', taskId: 't' }
  class UnreadableFile extends File {
    override async arrayBuffer(): Promise<ArrayBuffer> { throw new DOMException('Denied', 'NotReadableError') }
  }
  class IncompleteFile extends File {
    override async arrayBuffer(): Promise<ArrayBuffer> { return new ArrayBuffer(0) }
  }
  try {
    for (const FileType of [UnreadableFile, IncompleteFile]) await assert.rejects(api.upload(identity, new FileType([binary], name)), /无法完整读取附件.*重新选择/)
    await assert.rejects(api.upload(identity, new File([new Uint8Array(25 * 1024 * 1024)], name)), /过大/)
    assert.equal(requests, 0)
    const file = new File([binary], name, { type: 'text/plain' })
    assert.deepEqual(await api.upload(identity, file), { itemId: 'item-file', name, size: 4, mediaType: 'text/plain' })
    assert.equal(received[0]!.name, name)
    assert.deepEqual(new Uint8Array(await received[0]!.arrayBuffer()), binary)
    reject = true
    await assert.rejects(api.upload(identity, file), /标准录音.*25 MiB/)
  } finally { await new Promise<void>(done => server.close(() => done())) }
})

test('文内引用限制在当前文件范围，PDF页码独立于文件路径', () => {
  assert.deepEqual(workspaceLink('papers/paper.pdf#page=3'), { path: 'papers/paper.pdf', scope: 'work', page: 3 })
  assert.deepEqual(workspaceLink('../材料.pdf#page=2', { path: 'notes/report.md', scope: 'memory' }), { path: '材料.pdf', scope: 'memory', page: 2 })
  for (const href of ['/etc/passwd', '%2fetc/passwd', '../../outside', 'file:///etc/passwd', 'https://example.org', 'notes%5csecret', '#section']) assert.equal(workspaceLink(href), null)
})

test('当前稿仅绑定主题工作区可写文本，资料与内部文件不可绑定', () => {
  assert.equal(writableDocument({ scope: 'work', path: 'notes/report.md' }), 'notes/report.md')
  for (const scope of ['memory', 'you', 'library'] as const) assert.equal(writableDocument({ scope, path: 'notes/report.md' }), null)
  for (const path of ['library/report.md', 'cache/report.md', 'workers/report.md', 'report.html', 'paper.pdf', '../private.md', 'notes/../../private.md']) assert.equal(writableDocument({ scope: 'work', path }), null)
})

test('阅读器：运行中按 ETag 低频检查版本，未变不重建沙箱，变了才换内容；资料库条目不需要会话身份', async () => {
  const { register } = await import('node:module')
  const { JSDOM } = await import('jsdom')
  const { createServer } = await import('node:http')
  const { createElement, act } = await import('react')
  const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost/' })
  for (const name of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'localStorage', 'getComputedStyle', 'MutationObserver', 'navigator']) Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name as keyof typeof dom.window] })
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Object.defineProperty(window, 'matchMedia', { value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) })
  register('./helpers/tsx-loader.mjs', import.meta.url)
  register('data:text/javascript,' + encodeURIComponent(`export async function resolve(specifier, context, next) { if (specifier.endsWith('?url')) return { url: 'data:text/javascript,export default \"test-worker-url\"', shortCircuit: true }; return next(specifier, context) } export async function load(url, context, next) { const result = await next(url, context); if (/\\/src\\/.*\\.tsx$/.test(url)) return { ...result, source: String(result.source).replaceAll('import.meta.env.BASE_URL', JSON.stringify('/')) }; return result }`), import.meta.url)
  const { createRoot } = await import('react-dom/client')
  const { DocumentReader } = await import('../src/mastra/views/reader/DocumentReader.tsx')
  const { LumenApi } = await import('../src/mastra/data/client.ts')
  let content = '<p>版本一</p>', copied = ''
  const reads: string[] = []
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { async writeText(text: string) { copied = text } } })
  const server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://localhost')
    if (url.pathname === '/lumen/library/item-1/content') { reads.push('library'); res.setHeader('Content-Type', 'text/plain'); res.end('资料原文'); return }
    const etag = `"${Buffer.from(content).toString('base64')}"`
    reads.push(`${url.searchParams.get('topicId')}:${url.searchParams.get('scope')}:${url.searchParams.get('path')}`)
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag }); res.end(); return }
    res.writeHead(200, { 'Content-Type': 'text/html', ETag: etag }); res.end(content)
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const api = new LumenApi({ baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}`, token: 'test' })
  const element = document.createElement('div'); document.body.append(element); const root = createRoot(element)
  async function wait(check: () => boolean) { for (let i = 0; i < 300 && !check(); i++) await act(async () => { await new Promise(done => setTimeout(done, 10)) }); assert.ok(check()) }
  try {
    await act(async () => root.render(createElement(DocumentReader, { api, identity: null, target: { scope: 'library', path: 'item-1' }, title: '资料', onClose() {} })))
    await wait(() => /资料原文/.test(element.textContent!))
    assert.deepEqual(reads, ['library'])
    const target = { scope: 'work' as const, path: 'report.html' }
    await act(async () => root.render(createElement(DocumentReader, { api, identity: { topicId: 'p', taskId: 't' }, target, live: true, onClose() {} })))
    await wait(() => !!element.querySelector('iframe'))
    const frame = element.querySelector('iframe')!, first = reads.length
    assert.equal(reads.at(-1), 'p:work:report.html')
    await act(async () => { await new Promise(done => setTimeout(done, 5100)) })
    await wait(() => reads.length > first)
    assert.equal(element.querySelector('iframe'), frame, '未变（304）时沙箱不能重建')
    content = '<p>版本二</p>'
    await act(async () => { await new Promise(done => setTimeout(done, 5300)) })
    await act(async () => element.querySelector<HTMLButtonElement>('[aria-label="复制源码"]')!.click())
    assert.match(copied, /版本二/)
    let closed = 0
    await act(async () => root.render(createElement(DocumentReader, { api, identity: { topicId: 'p', taskId: 't' }, target, onClose() { closed++ } })))
    await act(async () => element.querySelector<HTMLButtonElement>('[aria-label="关闭阅读器"]')!.click())
    assert.equal(closed, 1)
  } finally { await act(async () => root.unmount()); element.remove(); dom.window.close(); await new Promise<void>(done => server.close(() => done())) }
})

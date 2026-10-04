/**
 * [INPUT]: 工作区引用解析、资产hook、真实Files/目录轨及HTTP文件响应
 * [OUTPUT]: 当前稿路径边界、身份隔离、新产物通知、卷帘交互、附件完整读取与批量上传失败保留
 * [POS]: 文件预览路由边界，不替代原生阅读器验收
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
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
    res.end(JSON.stringify(reject ? { error: '上传内容超过 25 MiB 请求上限' } : { path: 'library/file.txt', name, size: 4, mediaType: 'text/plain' }))
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const api = new LumenApi({ baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}`, token: 'test' })
  const identity = { projectId: 'p', taskId: 't' }
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
    assert.equal((await api.upload(identity, file)).name, name)
    assert.equal(received[0]!.name, name)
    assert.deepEqual(new Uint8Array(await received[0]!.arrayBuffer()), binary)
    reject = true
    await assert.rejects(api.upload(identity, file), /标准录音.*25 MiB/)
  } finally { await new Promise<void>(done => server.close(() => done())) }
})

test('文内引用限制在当前文件范围，PDF页码独立于文件路径', () => {
  assert.deepEqual(workspaceLink('papers/paper.pdf#page=3'), { path: 'papers/paper.pdf', scope: 'task', page: 3 })
  assert.deepEqual(workspaceLink('../材料.pdf#page=2', { path: 'notes/report.md', scope: 'source' }), { path: '材料.pdf', scope: 'source', page: 2 })
  for (const href of ['/etc/passwd', '%2fetc/passwd', '../../outside', 'file:///etc/passwd', 'https://example.org', 'notes%5csecret', '#section']) assert.equal(workspaceLink(href), null)
})

test('当前稿仅绑定任务可写文本，资料与内部文件不可绑定', () => {
  assert.equal(writableDocument({ scope: 'task', path: 'notes/report.md' }), 'notes/report.md')
  for (const scope of ['shared', 'source', 'memory'] as const) assert.equal(writableDocument({ scope, path: 'notes/report.md' }), null)
  for (const path of ['library/report.md', 'cache/report.md', 'workers/report.md', 'report.html', 'paper.pdf', '../private.md', 'notes/../../private.md']) assert.equal(writableDocument({ scope: 'task', path }), null)
})

test('工作区隐藏仍读取共享/本会话产物，只为新路径通知展开，内部目录不进产物列表', async () => {
  const { register } = await import('node:module')
  const { JSDOM } = await import('jsdom')
  const { createServer } = await import('node:http')
  const { createElement, act } = await import('react')
  const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost/' })
  for (const name of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'localStorage', 'getComputedStyle', 'MutationObserver', 'navigator']) Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name as keyof typeof dom.window] })
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Object.defineProperty(window, 'matchMedia', { value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) })
  register('./helpers/tsx-loader.mjs', import.meta.url)
  register('data:text/javascript,' + encodeURIComponent(`export async function resolve(specifier, context, next) { if (specifier.endsWith('?url')) return { url: 'data:text/javascript,export default \"test-worker-url\"', shortCircuit: true }; return next(specifier, context) } export async function load(url, context, next) { const result = await next(url, context); if(url.endsWith('/WidgetFrame.tsx')) return {...result, source: String(result.source).replaceAll('import.meta.env.BASE_URL', JSON.stringify('/'))}; return result }`), import.meta.url)
  const { createRoot } = await import('react-dom/client')
  const { Files } = await import('../src/mastra/views/Files.tsx')
  const { WorkspaceRail } = await import('../src/mastra/views/workspace/Rail.tsx')
  const { useWorkspace } = await import('../src/mastra/views/workspace/useWorkspace.ts')
  const { LumenApi } = await import('../src/mastra/data/client.ts')
  let content = '<p>版本一</p>', reads = 0, uploads = 0, copied = ''
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { async writeText(text: string) { copied = text } } })
  let added = false, current: ReturnType<typeof useWorkspace> | undefined
  const visited: string[] = []
  const server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://localhost'), path = url.searchParams.get('path') ?? '.'
    if (url.pathname === '/lumen/files') { reads++; res.setHeader('Content-Type', 'text/html'); res.end(content); return }
    if (url.pathname === '/lumen/uploads') { uploads++; res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: '首个文件上传失败' })); return }
    visited.push(path)
    const entries = url.searchParams.get('scope') === 'shared' ? [{ name: 'paper.pdf', type: 'file' }] : path === '.' ? [{ name: 'workers', type: 'directory' }, { name: 'output', type: 'directory' }, ...(added ? [{ name: 'new.md', type: 'file' }] : [])] : [{ name: 'report.md', type: 'file' }]
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(url.pathname.endsWith('snapshot') ? { displayState: { tasks: [], isRunning: false } } : { entries }))
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const api = new LumenApi({ baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}`, token: 'test' })
  const element = document.createElement('div'); document.body.append(element); const root = createRoot(element)
  const frames: Array<{ task: string; assets: number; display: boolean }> = []
  function Probe({ task = 't' }: { task?: string }) { current = useWorkspace(api, task ? { projectId: 'p', taskId: task } : null, 0); frames.push({ task, assets: current.assets.length, display: current.display !== null }); return null }
  async function wait(check: () => boolean) { for (let i = 0; i < 100 && !check(); i++) await act(async () => { await new Promise(done => setTimeout(done, 10)) }); assert.ok(check()) }
  try {
    await act(async () => root.render(createElement(Probe)))
    await wait(() => current?.assets.length === 2)
    assert.equal(current!.revealVersion, 1); assert.ok(!visited.includes('workers'))
    assert.deepEqual(current!.assets.map(file => `${file.scope}:${file.path}`), ['shared:paper.pdf', 'task:output/report.md'])
    const requests = visited.length
    await act(async () => current!.refresh()); await wait(() => visited.length > requests)
    await act(async () => { await new Promise(done => setTimeout(done, 40)) })
    assert.equal(current!.revealVersion, 1)
    added = true; await act(async () => current!.refresh()); await wait(() => current!.assets.length === 3)
    assert.equal(current!.revealVersion, 2)
    await act(async () => root.render(createElement(Probe, { task: 'other' })))
    assert.deepEqual(frames.find(frame => frame.task === 'other'), { task: 'other', assets: 0, display: false })
    await wait(() => current!.assets.length === 3)
    await act(async () => root.render(createElement(Probe, { task: '' })))
    assert.deepEqual(frames.find(frame => frame.task === ''), { task: '', assets: 0, display: false })
    await act(async () => root.render(createElement(Probe, { task: 't' })))
    await wait(() => current!.assets.length === 3)
    const state = current!
    let opened = ''
    await act(async () => root.render(createElement(WorkspaceRail, { workspace: state, onOpen: file => { opened = file.path }, onBrowse() {}, onUpload() {} })))
    assert.equal(element.querySelectorAll('.rail-group').length, 2)
    assert.match(element.querySelector('aside')!.getAttribute('style')!, /300px/)
    const file = [...element.querySelectorAll<HTMLButtonElement>('.ws-item')].find(button => button.textContent === 'report.md')!
    await act(async () => file.click()); assert.equal(opened, 'output/report.md')
    await act(async () => element.querySelector<HTMLButtonElement>('.rail-toggle')!.click())
    const fold = element.querySelector('.rail-dir-body')!.closest('[aria-hidden]')!
    assert.equal(fold.getAttribute('aria-hidden'), 'true'); assert.ok(fold.hasAttribute('inert'))
    let bound = 0
    const running = { ...state, display: { ...state.display!, isRunning: true } }
    const target = { scope: 'task' as const, path: 'report.html' }
    await act(async () => root.render(createElement(Files, { api, identity: { projectId: 'p', taskId: 't' }, revision: 0, workspace: running, target, onOpenDocument() { bound++ } })))
    await wait(() => !!element.querySelector('iframe'))
    const frame = element.querySelector('iframe')!, firstReads = reads
    await act(async () => { await new Promise(done => setTimeout(done, 5100)) })
    await wait(() => reads > firstReads)
    assert.equal(element.querySelector('iframe'), frame); assert.equal(bound, 1)
    assert.equal(element.querySelector('[role=status]'), null)
    content = '<p>版本二</p>'
    await act(async () => { await new Promise(done => setTimeout(done, 5100)) })
    await act(async () => { await new Promise(done => setTimeout(done, 200)) })
    await act(async () => element.querySelector<HTMLButtonElement>('[aria-label="复制源码"]')!.click())
    assert.match(copied, /版本二/)
    assert.equal(bound, 1)
    await act(async () => root.render(createElement(Files, { api, identity: { projectId: 'p', taskId: 't' }, revision: 0, workspace: state, target })))
    await act(async () => element.querySelector<HTMLButtonElement>('[aria-label="返回工作目录"]')!.click())
    const input = element.querySelector<HTMLInputElement>('input[type=file]')!
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['one'], 'one.txt'), new File(['two'], 'two.txt')] })
    await act(async () => input.dispatchEvent(new dom.window.Event('change', { bubbles: true })))
    await wait(() => !!element.querySelector('[role=alert]'))
    assert.match(element.querySelector('[role=alert]')!.textContent!, /上传失败/)
    assert.equal(uploads, 1)


  } finally { await act(async () => root.unmount()); element.remove(); dom.window.close(); await new Promise<void>(done => server.close(() => done())) }
})

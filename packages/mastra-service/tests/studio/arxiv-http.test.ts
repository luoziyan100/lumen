/**
 * [INPUT]: 真实 createHttpService（本机 TCP）、真实 catalog.sqlite 与 library/ 文件、Mastra Controller 工具循环与确定性模型；arXiv 与网页在 fetch 边界换成可控桩，不打真网
 * [OUTPUT]: HTTP 链接入库：abs/html/pdf 各写法都收 PDF、标题与作者/年份来自 arXiv API、同一论文去重；API 失败回退到 PDF 文档信息或首页大字；
 *           模型工具 fetch_url/extract_pdf 的 to_library 遇 arXiv 同样收 PDF；原件本机位置接口；旧库（缺新列）升级后照常读与收入；
 *           迁移只归服务启动：补取命令（子进程）遇未迁移旧库拒绝且不改表，新服务首启补列、再启幂等，之后补取以 schema=false 打开只填数据
 * [POS]: L1/L2/L3 服务端入口的行为证据；纯函数与补取在 library-titles.test.ts
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { createHttpService } from '../../src/server.ts'
import { researchHttp } from '../../src/research/http.ts'
import { backfillLibrary } from '../../src/studio/backfill.ts'
import { openStudio } from '../../src/studio/studio.ts'
import { fixtureProvider, textReply, toolReply, type ProviderRequest } from '../provider-fixture.ts'
import { ensureTopic } from '../topic-fixture.ts'
import { atom, titledPdf } from './library-fixtures.ts'

const PAPERS: Record<string, { pdf: Buffer; title: string; authors: string[]; published: string }> = {
  '1706.03762': { pdf: titledPdf({ info: 'untitled', lines: [[17, 'Attention Is All You Need'], [10, 'Abstract']], rotated: 'arXiv:1706.03762v7 [cs.CL]' }), title: 'Attention Is All You Need',
    authors: ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar', 'Jakob Uszkoreit', 'Llion Jones'], published: '2017-06-12T17:57:34Z' },
  '2611.14235': { pdf: titledPdf({ info: 'Banding instabilities (from PDF info)', lines: [[17, 'Banding instabilities']] }), title: 'Banding instabilities in poroelastic\n  media under flow-driven compaction',
    authors: ['A. Author', 'B. Author'], published: '2026-11-18T00:00:00Z' },
  '2104.09864': { pdf: titledPdf({ lines: [[17, 'RoFormer: Enhanced Transformer'], [17, 'with Rotary Position Embedding'], [11, 'Jianlin Su']] }), title: 'RoFormer: Enhanced Transformer with Rotary Position Embedding',
    authors: ['Jianlin Su', 'Yu Lu', 'Shengfeng Pan', 'Ahmed Murtadha', 'Bo Wen', 'Yunfeng Liu'], published: '2021-04-20T09:54:06Z' },
}

/** 可控网络：arXiv PDF 与 API 计数；apiDown 时 API 返回 404；abs/html 页面返回 HTML（不该被收成正文） */
function network() {
  const state = { apiDown: false, pdf: 0, api: 0, page: 0 }
  const fetch: typeof globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input instanceof Request ? input.url : input))
    if (url.hostname === 'export.arxiv.org' && url.pathname === '/api/query') {
      state.api++
      if (state.apiDown) return new Response('unavailable', { status: 404 })
      const id = url.searchParams.get('id_list')!, paper = PAPERS[id.replace(/v\d+$/, '')]
      return new Response(paper ? atom(id, paper.title, paper.authors, paper.published) : '<feed></feed>', { headers: { 'content-type': 'application/atom+xml' } })
    }
    const pdf = url.hostname === 'arxiv.org' ? url.pathname.match(/^\/pdf\/(.+)$/)?.[1]?.replace(/v\d+$/, '') : undefined
    if (pdf && PAPERS[pdf]) { state.pdf++; return new Response(new Uint8Array(PAPERS[pdf].pdf), { headers: { 'content-type': 'application/pdf' } }) }
    state.page++
    return new Response(`<html><head><title>[${url.pathname.split('/').pop()}] abstract page</title></head><body><p>ABSTRACT PAGE TEXT</p></body></html>`, { headers: { 'content-type': 'text/html' } })
  }) as typeof globalThis.fetch
  return { state, fetch }
}

test('HTTP 链接入库：arXiv abs/html/pdf 都收 PDF，标题/作者/年份来自 API，同一论文去重；API 失败回退 PDF 规则；原件位置接口', { timeout: 60000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-arxiv-http-'))
  const net = network()
  const token = 'arxiv-http-token-at-least-24-characters'
  const service = await createHttpService({ dataRoot, token, research: { fetch: net.fetch } })
  const server = serve({ hostname: '127.0.0.1', port: 0, fetch: service.app.fetch })
  if (!server.listening) await new Promise<void>(done => server.once('listening', done))
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const base = `http://127.0.0.1:${address.port}/lumen`, auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const addLink = async (url: string) => { const response = await fetch(`${base}/library`, { method: 'POST', headers: auth, body: JSON.stringify({ url }) }); return { status: response.status, body: await response.json() } }
  try {
    const abs = await addLink('https://arxiv.org/abs/2611.14235')
    assert.equal(abs.status, 201)
    assert.deepEqual([abs.body.item.kind, abs.body.item.mediaType, abs.body.item.title, abs.body.item.titleSource, abs.body.item.arxivId, abs.body.item.year, abs.body.item.authors, abs.body.item.sourceUrl],
      ['pdf', 'application/pdf', 'Banding instabilities in poroelastic media under flow-driven compaction', 'arxiv', '2611.14235', 2026, 'A. Author, B. Author', 'https://arxiv.org/abs/2611.14235'])
    assert.equal(net.state.page, 0, '没有去取 abs 网页')
    const original = await fetch(`${base}/library/${abs.body.item.id}/content`, { headers: auth })
    assert.equal(Buffer.from(await original.arrayBuffer()).subarray(0, 5).toString(), '%PDF-')
    // 同一篇的其他写法：html 全文页、带版本的 PDF、export 变体 → 同一份 PDF，去重返回已有条目
    for (const url of ['https://arxiv.org/html/2611.14235v1', 'https://export.arxiv.org/pdf/2611.14235v1.pdf', 'https://www.arxiv.org/abs/2611.14235']) {
      const again = await addLink(url)
      assert.deepEqual([again.status, again.body.created, again.body.item.id], [200, false, abs.body.item.id], url)
    }
    const attention = await addLink('https://arxiv.org/pdf/1706.03762v7')
    assert.deepEqual([attention.body.item.title, attention.body.item.authors, attention.body.item.year], ['Attention Is All You Need', 'Ashish Vaswani, Noam Shazeer, Niki Parmar et al.', 2017])

    // ---- API 失败：不阻塞入库，标题回到 PDF 规则（这份没有可用 Info → 首页大字），编号照存以便补取 ----
    net.state.apiDown = true
    const rope = await addLink('https://arxiv.org/abs/2104.09864')
    assert.deepEqual([rope.status, rope.body.item.kind, rope.body.item.title, rope.body.item.titleSource, rope.body.item.arxivId, rope.body.item.authors],
      [201, 'pdf', 'RoFormer: Enhanced Transformer with Rotary Position Embedding', 'heading', '2104.09864', null])
    net.state.apiDown = false

    // ---- 原件本机位置：只认条目 id；不存在的 id 404 ----
    const location = await (await fetch(`${base}/library/${abs.body.item.id}/location`, { headers: auth })).json()
    const root = await realpath(join(dataRoot, 'library'))
    assert.deepEqual(location, { root, path: join(root, abs.body.item.id, '2611.14235.pdf') })
    assert.equal((await fetch(`${base}/library/..%2F..%2Fcatalog.sqlite/location`, { headers: auth })).status, 404)
    assert.equal((await fetch(`${base}/library/${abs.body.item.id}/location`)).status, 401)
  } finally {
    server.close()
    await service.close()
    await rm(dataRoot, { recursive: true, force: true })
  }
})

test('API 失败且 PDF 有可用文档信息：标题取 Info；非 arXiv 的 PDF 链接同样按 Info/首页大字取标题', { timeout: 60000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-arxiv-info-'))
  const net = network()
  const other = titledPdf({ info: 'The Dynamo and the Computer', lines: [[20, 'Ignored Heading']] })
  const fetch = (async (input: string | URL | Request) => String(input instanceof Request ? input.url : input) === 'https://paper.example/dynamo.pdf'
    ? new Response(new Uint8Array(other), { headers: { 'content-type': 'application/pdf' } }) : net.fetch(input)) as typeof globalThis.fetch
  const service = await createHttpService({ dataRoot, token: 'arxiv-info-token-at-least-24-characters', research: { fetch } })
  const post = async (url: string) => (await (await service.app.request('/lumen/library', { method: 'POST', headers: { Authorization: 'Bearer arxiv-info-token-at-least-24-characters', 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })).json()).item
  try {
    net.state.apiDown = true
    const banding = await post('https://arxiv.org/abs/2611.14235')
    assert.deepEqual([banding.title, banding.titleSource, banding.arxivId], ['Banding instabilities (from PDF info)', 'info', '2611.14235'])
    const dynamo = await post('https://paper.example/dynamo.pdf')
    assert.deepEqual([dynamo.title, dynamo.titleSource, dynamo.arxivId], ['The Dynamo and the Computer', 'info', null])
  } finally { await service.close(); await rm(dataRoot, { recursive: true, force: true }) }
})

const said = (request: ProviderRequest) => {
  const lastUser = request.messages.map(message => message.role).lastIndexOf('user')
  return { text: JSON.stringify(request.messages[lastUser]), answered: request.messages.slice(lastUser).some(message => message.role === 'tool') }
}

test('模型工具：fetch_url 收 arXiv 摘要页、extract_pdf 收 arXiv PDF，都进资料库成 PDF 与 API 标题；已取到的 PDF 不重取', { timeout: 60000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-arxiv-tools-'))
  const net = network()
  let calls = 0
  const fixture = fixtureProvider(request => {
    const { text, answered } = said(request)
    if (answered) return textReply('已处理')
    if (text.includes('收摘要页')) return toolReply('fetch_url', { url: 'https://arxiv.org/abs/1706.03762', to_library: true }, `call-${++calls}`)
    if (text.includes('收PDF')) return toolReply('extract_pdf', { source: 'https://arxiv.org/pdf/2104.09864v5', to_library: true }, `call-${++calls}`)
    return toolReply('list_materials', {}, `call-${++calls}`)
  })
  const token = 'arxiv-tools-token-at-least-24-characters'
  const service = await createHttpService({ dataRoot, token, research: { fetch: net.fetch }, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  const materials = async () => (await (await service.app.request('/lumen/topics/p/materials', { headers: { Authorization: `Bearer ${token}` } })).json()).items as Array<Record<string, unknown>>
  try {
    ensureTopic(service, 'p')
    await service.catalog.createSession('p', 'a')
    const session = await service.application.session('p', 'a')
    await session.sendMessage({ content: '收摘要页' })
    let items = await materials()
    assert.deepEqual(items.map(item => [item.kind, item.title, item.arxivId, item.addedBy]), [['pdf', 'Attention Is All You Need', '1706.03762', 'ai']])
    const pdfBefore = net.state.pdf
    await session.sendMessage({ content: '收PDF' })
    items = await materials()
    const rope = items.find(item => item.arxivId === '2104.09864v5')
    assert.deepEqual([rope?.kind, rope?.title, rope?.year], ['pdf', 'RoFormer: Enhanced Transformer with Rotary Position Embedding', 2021])
    assert.equal(net.state.pdf - pdfBefore, 1, 'extract_pdf 取过一次 PDF，收入时不再重取')
  } finally { await service.close(); await rm(dataRoot, { recursive: true, force: true }) }
})

test('旧库升级：缺新列的 catalog.sqlite 由服务打开后照常列出并收入新链接', { timeout: 60000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-arxiv-legacy-'))
  const old = new DatabaseSync(join(dataRoot, 'catalog.sqlite'))
  old.exec(`CREATE TABLE library_items (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('file','pdf','web')), title TEXT NOT NULL, file TEXT NOT NULL, source_url TEXT,
    sha256 TEXT NOT NULL UNIQUE, media_type TEXT NOT NULL, size INTEGER NOT NULL, added_by TEXT NOT NULL CHECK (added_by IN ('you','ai')), created_at TEXT NOT NULL) STRICT`)
  old.prepare('INSERT INTO library_items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('legacy-1', 'web', '[2611.14235] Old', '_2611.txt', 'https://arxiv.org/abs/2611.14235', 'ff', 'text/plain', 3, 'you', '2026-11-01T00:00:00.000Z')
  old.close()
  const net = network()
  const token = 'arxiv-legacy-token-at-least-24-characters'
  const service = await createHttpService({ dataRoot, token, research: { fetch: net.fetch } })
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  try {
    const listed = (await (await service.app.request('/lumen/library', { headers })).json()).items
    assert.deepEqual(listed.map((item: Record<string, unknown>) => [item.id, item.title, item.authors, item.year, item.arxivId, item.titleSource]), [['legacy-1', '[2611.14235] Old', null, null, null, null]])
    const added = await (await service.app.request('/lumen/library', { method: 'POST', headers, body: JSON.stringify({ url: 'https://arxiv.org/abs/1706.03762' }) })).json()
    assert.equal(added.item.title, 'Attention Is All You Need')
  } finally { await service.close(); await rm(dataRoot, { recursive: true, force: true }) }
})

const columns = (path: string) => { const db = new DatabaseSync(path, { readOnly: true }); try { return db.prepare('PRAGMA table_info(library_items)').all().map(row => String(row.name)) } finally { db.close() } }
const backfillCli = fileURLToPath(new URL('../../src/studio/backfill.ts', import.meta.url))

test('迁移归服务启动：补取命令遇未迁移的旧库拒绝且不改表；新服务首启补列、再启幂等，两次都能读写；之后补取以只填数据方式打开可运行', { timeout: 120000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-arxiv-migrate-')), catalog = join(dataRoot, 'catalog.sqlite')
  const old = new DatabaseSync(catalog)
  old.exec(`CREATE TABLE library_items (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('file','pdf','web')), title TEXT NOT NULL, file TEXT NOT NULL, source_url TEXT,
    sha256 TEXT NOT NULL UNIQUE, media_type TEXT NOT NULL, size INTEGER NOT NULL, added_by TEXT NOT NULL CHECK (added_by IN ('you','ai')), created_at TEXT NOT NULL) STRICT`)
  old.prepare('INSERT INTO library_items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('legacy-1', 'pdf', '1706.03762', '1706.03762.pdf', 'https://arxiv.org/pdf/1706.03762', 'aa', 'application/pdf', 3, 'you', '2026-11-01T00:00:00.000Z')
  old.close()
  const before = columns(catalog)
  const run = (...argv: string[]) => promisify(execFile)(process.execPath, ['--experimental-strip-types', '--no-warnings', backfillCli, '--data-root', dataRoot, ...argv]).then(() => ({ ok: true, stderr: '' }), (error: { stderr: string }) => ({ ok: false, stderr: error.stderr }))
  try {
    // ---- 旧库：补取命令拒绝，表结构一列不动 ----
    const refused = await run('--dry-run')
    assert.equal(refused.ok, false)
    assert.match(refused.stderr, /还没被含本次迁移的服务打开过.*library_items\.authors/)
    assert.deepEqual(columns(catalog), before)
    // ---- 新服务首次启动补齐四列，旧行可读、新条目可写（具名列 INSERT） ----
    const net = network(), token = 'arxiv-migrate-token-at-least-24-characters', headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    for (const round of [1, 2]) {
      const service = await createHttpService({ dataRoot, token, research: { fetch: net.fetch } })
      try {
        assert.deepEqual(columns(catalog), [...before, 'authors', 'year', 'arxiv_id', 'title_source'], `第 ${round} 次启动`)
        const listed = (await (await service.app.request('/lumen/library', { headers })).json()).items
        assert.ok(listed.some((item: { id: string; title: string }) => item.id === 'legacy-1' && item.title === '1706.03762'))
        const url = round === 1 ? 'https://arxiv.org/abs/2611.14235' : 'https://arxiv.org/abs/2104.09864'
        const added = await service.app.request('/lumen/library', { method: 'POST', headers, body: JSON.stringify({ url }) })
        assert.equal(added.status, 201, `第 ${round} 次启动后收入`)
      } finally { await service.close() }
    }
    // ---- 服务启动过之后，补取按 schema=false 打开（与命令行同一路径）只填数据；网络用桩，不打真网 ----
    const studio = openStudio(dataRoot, { schema: false })
    try {
      const plan = await backfillLibrary(studio, researchHttp(net.fetch), { dryRun: true, apiGapMs: 0 })
      assert.equal(plan.find(row => row.id === 'legacy-1')?.after.title, 'Attention Is All You Need')
    } finally { studio.close() }
    assert.deepEqual(columns(catalog), [...before, 'authors', 'year', 'arxiv_id', 'title_source'])
  } finally { await rm(dataRoot, { recursive: true, force: true }) }
})

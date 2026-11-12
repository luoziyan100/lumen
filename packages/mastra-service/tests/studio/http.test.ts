/**
 * [INPUT]: 真实 createHttpService、本机 HTTP、LibSQL/SQLite 与 library/ 文件；研究网络在 fetch 边界替换为本地夹具
 * [OUTPUT]: studio HTTP 证明：认证、主题与状态灯字段、白板 ETag/304、上传与链接入库去重、原件读取、引用增删与可读错误
 * [POS]: S1 的 HTTP 验收；不经模型，白板没有对人的写接口（R4）
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serve } from '@hono/node-server'
import { createHttpService } from '../../src/server.ts'

test('studio HTTP：主题、白板 ETag、资料库上传/链接去重、原件与引用', { timeout: 60000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-studio-http-'))
  const pages: Record<string, { body: string; type: string }> = {
    'https://paper.example/dynamo.pdf': { body: '%PDF-1.4 The Dynamo and the Computer', type: 'application/pdf' },
    'https://blog.example/diffusion': { body: '<html><head><title>Diffusion &amp; Lag</title></head><body><p>Electricity took decades.</p><script>x()</script></body></html>', type: 'text/html; charset=utf-8' },
  }
  const researchFetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input), page = pages[url]
    return page ? new Response(page.body, { headers: { 'content-type': page.type } }) : new Response('missing', { status: 404 })
  }) as typeof fetch
  const token = 'studio-http-token-at-least-24-characters'
  const service = await createHttpService({ dataRoot, token, research: { fetch: researchFetch } })
  const server = serve({ hostname: '127.0.0.1', port: 0, fetch: service.app.fetch })
  if (!server.listening) await new Promise<void>(done => server.once('listening', done))
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const base = `http://127.0.0.1:${address.port}/lumen`
  const auth = { Authorization: `Bearer ${token}` }
  const json = (path: string, method = 'GET', body?: unknown) => fetch(`${base}${path}`, {
    method, headers: { ...auth, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const upload = (name: string, bytes: string, topicId?: string) => {
    const form = new FormData()
    form.set('file', new File([bytes], name, { type: name.endsWith('.md') ? 'text/markdown' : '' }))
    if (topicId) form.set('topicId', topicId)
    return fetch(`${base}/library`, { method: 'POST', headers: auth, body: form })
  }
  try {
    assert.equal((await fetch(`${base}/topics`)).status, 401)

    // ---- 主题：新建自带白板，列表带状态灯字段 ----
    const created = await json('/topics', 'POST', { title: 'AI 产业与技术扩散' })
    assert.equal(created.status, 201)
    const topic = await created.json() as { id: string; title: string }
    const listed = await (await json('/topics')).json() as { items: Array<{ id: string; running: boolean; waiting: boolean }> }
    assert.deepEqual(listed.items.map(item => [item.id, item.running, item.waiting]), [[topic.id, false, false]])
    assert.equal((await (await json(`/topics/${topic.id}`, 'PATCH', { title: '技术扩散' })).json() as { title: string }).title, '技术扩散')
    assert.equal((await json('/topics', 'POST', { title: '' })).status, 400)
    const missing = await json('/topics/nope')
    assert.equal(missing.status, 404)
    assert.match((await missing.json() as { error: string }).error, /没有这个主题/)

    // ---- 白板：列表、＋ 新开、ETag 与 304 ----
    const sheets = await (await json(`/topics/${topic.id}/sheets`)).json() as { items: Array<{ id: string; used: number; capacity: number }>; writable: string }
    assert.equal(sheets.items.length, 1)
    assert.equal(sheets.writable, sheets.items[0]!.id)
    const first = await fetch(`${base}/sheets/${sheets.writable}`, { headers: auth })
    const etag = first.headers.get('ETag')!
    assert.ok(etag)
    assert.deepEqual((await first.json() as { blocks: unknown[] }).blocks, [])
    assert.equal((await fetch(`${base}/sheets/${sheets.writable}`, { headers: { ...auth, 'If-None-Match': etag } })).status, 304)
    service.studio.board.draw(topic.id, { kind: 'text', title: '先画一块', content: { markdown: '价值 = 能力 × 互补性变革' } }, { threadId: null, runId: 'run-http' })
    const changed = await fetch(`${base}/sheets/${sheets.writable}`, { headers: { ...auth, 'If-None-Match': etag } })
    assert.equal(changed.status, 200, '白板变了，ETag 失效')
    assert.equal((await changed.json() as { blocks: unknown[] }).blocks.length, 1)
    const added = await json(`/topics/${topic.id}/sheets`, 'POST', { title: '电和 AI' })
    assert.equal(added.status, 201)
    assert.equal((await (await json(`/topics/${topic.id}/sheets`)).json() as { writable: string }).writable, (await added.json() as { id: string }).id)
    assert.equal((await json(`/sheets/${sheets.writable}/blocks`, 'POST', { kind: 'text' })).status, 404, '人没有区块写接口')

    // ---- 资料库：上传（带主题即引用）、重复去重、原件读取 ----
    const uploaded = await upload('曾鸣：AI 产业.md', '# 技术扩散\n\n笔记正文', topic.id)
    assert.equal(uploaded.status, 201)
    const note = await uploaded.json() as { item: { id: string; kind: string; addedBy: string; mediaType: string }; created: boolean; referenced: boolean }
    assert.deepEqual([note.item.kind, note.item.addedBy, note.item.mediaType, note.created, note.referenced], ['file', 'you', 'text/markdown', true, true])
    const duplicate = await upload('重复.md', '# 技术扩散\n\n笔记正文')
    assert.equal(duplicate.status, 200)
    assert.deepEqual([(await duplicate.json() as { item: { id: string } }).item.id], [note.item.id])
    const content = await fetch(`${base}/library/${note.item.id}/content`, { headers: auth })
    assert.equal(await content.text(), '# 技术扩散\n\n笔记正文')
    assert.equal(content.headers.get('Content-Type'), 'text/markdown')
    assert.equal((await fetch(`${base}/library/${note.item.id}/content`, { headers: { ...auth, 'If-None-Match': content.headers.get('ETag')! } })).status, 304)

    // ---- 链接：PDF 存原件，网页存正文与标题 ----
    const pdf = await (await json('/library', 'POST', { url: 'https://paper.example/dynamo.pdf', topicId: topic.id })).json() as { item: { id: string; kind: string; sourceUrl: string; title: string } }
    assert.deepEqual([pdf.item.kind, pdf.item.sourceUrl, pdf.item.title], ['pdf', 'https://paper.example/dynamo.pdf', 'dynamo'])
    const web = await (await json('/library', 'POST', { url: 'https://blog.example/diffusion' })).json() as { item: { id: string; kind: string; title: string }; referenced: boolean }
    assert.deepEqual([web.item.kind, web.item.title, web.referenced], ['web', 'Diffusion & Lag', false])
    const page = await (await fetch(`${base}/library/${web.item.id}/content`, { headers: auth })).text()
    assert.match(page, /Electricity took decades\./)
    assert.doesNotMatch(page, /x\(\)|<p>/, '网页存抽出的正文，不存脚本和标签')
    const dead = await json('/library', 'POST', { url: 'https://blog.example/gone' })
    assert.equal(dead.status, 400)
    assert.match((await dead.json() as { error: string }).error, /链接没有取到.*HTTP 404/)
    assert.equal(((await (await json('/library')).json()) as { items: unknown[] }).items.length, 3)

    // ---- 引用：增、列、删；删不存在的引用给可读 404 ----
    assert.equal((await json(`/topics/${topic.id}/materials`, 'POST', { itemId: web.item.id })).status, 201)
    const materials = await (await json(`/topics/${topic.id}/materials`)).json() as { items: Array<{ id: string; readProgress: number; citedBy: number }> }
    assert.deepEqual(materials.items.map(item => item.id), [note.item.id, pdf.item.id, web.item.id])
    assert.equal((await json(`/topics/${topic.id}/materials/${web.item.id}`, 'DELETE')).status, 204)
    const gone = await json(`/topics/${topic.id}/materials/${web.item.id}`, 'DELETE')
    assert.equal(gone.status, 404)
    assert.match((await gone.json() as { error: string }).error, /没有引用这份材料/)
    assert.equal((await json(`/topics/${topic.id}/materials`, 'POST', { itemId: 'missing' })).status, 404)
  } finally {
    server.close()
    await service.close()
    await rm(dataRoot, { recursive: true, force: true })
  }
})

/**
 * [INPUT]: 官方 MastraClient/Hono HTTP 服务与确定性 provider 网络响应
 * [OUTPUT]: HTTP/SSE 全链、持久消息补取、认证、资料库上传与主题工作区文件版本、超限/残缺上传状态验证
 * [POS]: P0 新服务/客户端纵向链路；无旧协议参与
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serve } from '@hono/node-server'
import { MastraClient } from '@mastra/client-js'
import { createHttpService } from '../src/server.ts'
import { fixtureProvider, textReply } from './provider-fixture.ts'

const token = 'test-local-token-at-least-24-characters'

test('新客户端通过官方 HTTP/SSE 执行，重连可读取持久消息', { timeout: 25000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-http-'))
  const fixture = fixtureProvider(() => textReply('研究结果：已读材料'))
  const service = await createHttpService({ dataRoot, token,
    model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'research-test', fetch: fixture.fetch },
  })
  const server = serve({ fetch: service.app.fetch, hostname: '127.0.0.1', port: 0 })
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const baseUrl = `http://127.0.0.1:${address.port}`
  let unsubscribe: (() => void) | undefined
  try {
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    assert.equal((await fetch(`${baseUrl}/lumen/health`)).status, 401)
    assert.equal((await fetch(`${baseUrl}/api/agents`)).status, 401)
    assert.equal((await fetch(`${baseUrl}/lumen/health`, { headers: { ...headers, Origin: 'https://untrusted.example' } })).status, 403)
    const topic = await fetch(`${baseUrl}/lumen/topics`, { method: 'POST', headers, body: JSON.stringify({ title: '研究' }) })
    assert.equal(topic.status, 201)
    const p = (await topic.json() as { id: string }).id
    const created = await fetch(`${baseUrl}/lumen/topics/${p}/sessions`, { method: 'POST', headers, body: JSON.stringify({ taskId: 't' }) })
    assert.equal(created.status, 201)
    assert.equal((await fetch(`${baseUrl}/lumen/uploads?topicId=${p}&taskId=t`, { method: 'POST', headers })).status, 404)
    // ---- 附件只进资料库并引用到主题；原件按内容指纹做 ETag ----
    const form = new FormData()
    const binary = new Uint8Array([0, 1, 2, 128, 255])
    form.set('file', new File([binary], '材料.bin', { type: 'application/octet-stream' }))
    form.set('topicId', p)
    const uploaded = await fetch(`${baseUrl}/lumen/library`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
    assert.equal(uploaded.status, 201)
    const { item, referenced } = await uploaded.json() as { item: { id: string }; referenced: boolean }
    assert.equal(referenced, true)
    const downloaded = await fetch(`${baseUrl}/lumen/library/${item.id}/content`, { headers })
    assert.deepEqual(new Uint8Array(await downloaded.arrayBuffer()), binary)
    const etag = downloaded.headers.get('etag')
    assert.ok(etag)
    assert.equal((await fetch(`${baseUrl}/lumen/library/${item.id}/content`, { headers: { ...headers, 'If-None-Match': etag } })).status, 304)
    // ---- 主题工作区文件：按修改时间与大小做 ETag，同主题的对话看到同一份 ----
    const workspace = await service.application.workspaceFor(p)
    await workspace.filesystem!.writeFile('notes/data.bin', binary)
    const file = `${baseUrl}/lumen/files?topicId=${p}&taskId=t&binary=1&path=notes%2Fdata.bin`
    const first = await fetch(file, { headers })
    assert.deepEqual(new Uint8Array(await first.arrayBuffer()), binary)
    const fileTag = first.headers.get('etag')
    assert.ok(fileTag)
    assert.equal((await fetch(file, { headers: { ...headers, 'If-None-Match': fileTag } })).status, 304)
    await workspace.filesystem!.writeFile('notes/data.bin', new Uint8Array([9, 8, 7, 6, 5]))
    const rewritten = await fetch(file, { headers: { ...headers, 'If-None-Match': fileTag } })
    assert.equal(rewritten.status, 200)
    assert.notEqual(rewritten.headers.get('etag'), fileTag)
    assert.deepEqual(new Uint8Array(await rewritten.arrayBuffer()), new Uint8Array([9, 8, 7, 6, 5]))
    assert.match(await (await fetch(`${baseUrl}/lumen/assets?topicId=${p}&taskId=t&path=notes`, { headers })).text(), /data.bin/)
    const oversized = new FormData()
    oversized.set('file', new File([new Uint8Array(25 * 1024 * 1024)], '会议记录.txt'))
    oversized.set('topicId', p)
    const rejected = await fetch(`${baseUrl}/lumen/library`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: oversized })
    assert.equal(rejected.status, 413)
    assert.match((await rejected.json()).error, /25 MiB/)
    const incomplete = await fetch(`${baseUrl}/lumen/library`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data; boundary=missing-boundary' }, body: '',
    })
    assert.equal(incomplete.status, 400)
    assert.match((await incomplete.json()).error, /不完整/)
    assert.equal((await (await fetch(`${baseUrl}/lumen/topics/${p}/materials`, { headers })).json()).items.length, 1)
    const client = new MastraClient({ baseUrl, headers: { Authorization: `Bearer ${token}` } })
    const session = client.getAgentController('lumen').session(`${p}:t`)
    let finish!: () => void
    const done = new Promise<void>(resolve => { finish = resolve })
    const seen: string[] = []
    const sub = await session.subscribe({ onEvent: event => {
      seen.push(event.type)
      if (event.type === 'agent_end') finish()
    } })
    unsubscribe = sub.unsubscribe
    await session.sendMessage('请阅读论文材料')
    const titled = await fetch(`${baseUrl}/lumen/topics/${p}/sessions/t`, { headers })
    assert.equal((await titled.json()).title, '请阅读论文材料')
    await done
    assert.ok(seen.includes('message_end'))
    unsubscribe(); unsubscribe = undefined
    const reconnected = new MastraClient({ baseUrl, headers: { Authorization: `Bearer ${token}` } })
    const history = await reconnected.getAgentController('lumen').session(`${p}:t`).listMessages(`${p}:t`)
    assert.match(JSON.stringify(history), /研究结果/)
  } finally {
    unsubscribe?.()
    if ('closeAllConnections' in server) server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await service.close()
    await rm(dataRoot, { recursive: true, force: true })
  }
})

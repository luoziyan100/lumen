/**
 * [INPUT]: 官方 MastraClient/Hono HTTP 服务与确定性 provider 网络响应
 * [OUTPUT]: HTTP/SSE 全链、持久消息补取、认证及超限/残缺上传状态验证
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
    const project = await fetch(`${baseUrl}/lumen/projects`, { method: 'POST', headers, body: JSON.stringify({ id: 'p', name: '研究' }) })
    assert.equal(project.status, 201)
    const created = await fetch(`${baseUrl}/lumen/sessions`, { method: 'POST', headers, body: JSON.stringify({ projectId: 'p', taskId: 't' }) })
    assert.equal(created.status, 200)
    const form = new FormData()
    const binary = new Uint8Array([0, 1, 2, 128, 255])
    form.set('file', new File([binary], '材料.pdf', { type: 'application/pdf' }))
    const uploaded = await fetch(`${baseUrl}/lumen/uploads?projectId=p&taskId=t`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
    assert.equal(uploaded.status, 200)
    const asset = await uploaded.json() as { path: string }
    const downloaded = await fetch(`${baseUrl}/lumen/files?projectId=p&taskId=t&binary=1&path=${encodeURIComponent(asset.path)}`, { headers })
    assert.deepEqual(new Uint8Array(await downloaded.arrayBuffer()), binary)
    const etag = downloaded.headers.get('etag')
    assert.ok(etag)
    const unchanged = await fetch(`${baseUrl}/lumen/files?projectId=p&taskId=t&binary=1&path=${encodeURIComponent(asset.path)}`, {
      headers: { ...headers, 'If-None-Match': etag },
    })
    assert.equal(unchanged.status, 304)
    const fileSession = await service.application.session('p', 't')
    const workspace = await service.application.controller.resolveWorkspace({ session: fileSession })
    await workspace!.filesystem!.writeFile(asset.path, new Uint8Array([9, 8, 7, 6, 5]))
    const rewritten = await fetch(`${baseUrl}/lumen/files?projectId=p&taskId=t&binary=1&path=${encodeURIComponent(asset.path)}`, {
      headers: { ...headers, 'If-None-Match': etag },
    })
    assert.equal(rewritten.status, 200)
    assert.notEqual(rewritten.headers.get('etag'), etag)
    assert.deepEqual(new Uint8Array(await rewritten.arrayBuffer()), new Uint8Array([9, 8, 7, 6, 5]))
    const assets = await fetch(`${baseUrl}/lumen/assets?projectId=p&taskId=t&path=library`, { headers })
    assert.match(await assets.text(), /材料.pdf/)
    const oversized = new FormData()
    oversized.set('file', new File([new Uint8Array(25 * 1024 * 1024)], '会议记录.txt'))
    const rejected = await fetch(`${baseUrl}/lumen/uploads?projectId=p&taskId=t`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: oversized,
    })
    assert.equal(rejected.status, 413)
    assert.match((await rejected.json()).error, /25 MiB/)
    const incomplete = await fetch(`${baseUrl}/lumen/uploads?projectId=p&taskId=t`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data; boundary=missing-boundary' }, body: '',
    })
    assert.equal(incomplete.status, 400)
    assert.match((await incomplete.json()).error, /不完整/)
    const afterRejected = await fetch(`${baseUrl}/lumen/assets?projectId=p&taskId=t&path=library`, { headers })
    assert.equal((await afterRejected.json()).entries.length, 1)
    const client = new MastraClient({ baseUrl, headers: { Authorization: `Bearer ${token}` } })
    const session = client.getAgentController('lumen').session('p:t')
    let finish!: () => void
    const done = new Promise<void>(resolve => { finish = resolve })
    const seen: string[] = []
    const sub = await session.subscribe({ onEvent: event => {
      seen.push(event.type)
      if (event.type === 'agent_end') finish()
    } })
    unsubscribe = sub.unsubscribe
    await session.sendMessage('请阅读论文材料')
    const titled = await fetch(`${baseUrl}/lumen/projects/p/sessions/t`, { headers })
    assert.equal((await titled.json()).title, '请阅读论文材料')
    await done
    assert.ok(seen.includes('message_end'))
    unsubscribe(); unsubscribe = undefined
    const reconnected = new MastraClient({ baseUrl, headers: { Authorization: `Bearer ${token}` } })
    const history = await reconnected.getAgentController('lumen').session('p:t').listMessages('p:t')
    assert.match(JSON.stringify(history), /研究结果/)
  } finally {
    unsubscribe?.()
    if ('closeAllConnections' in server) server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await service.close()
    await rm(dataRoot, { recursive: true, force: true })
  }
})

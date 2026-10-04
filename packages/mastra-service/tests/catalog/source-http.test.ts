/**
 * [INPUT]: 真实本机 HTTP、Mastra 运行/挂起及两个外部资料目录
 * [OUTPUT]: 资料绑定路由认证、运行限制及 HTTP/工具双视图缓存失效证明
 * [POS]: 后端组合验收；仅模型网络替换，运行状态、文件系统和 HTTP 都真实执行
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serve } from '@hono/node-server'
import { createHttpService } from '../../src/server.ts'
import { fixtureProvider, textReply, toolReply } from '../provider-fixture.ts'

test('真实 HTTP 资料重绑同时刷新文件与模型视图，运行和待答期间409，移除后不能读取旧缓存', { timeout: 90000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-source-http-'))
  const dataRoot = join(root, 'data'), first = join(root, 'first'), second = join(root, 'second')
  await Promise.all([dataRoot, first, second].map(path => mkdir(path, { mode: 0o700 })))
  await writeFile(join(first, 'paper.txt'), 'SOURCE-A-41')
  await writeFile(join(second, 'paper.txt'), 'SOURCE-B-73')
  let entered!: () => void, release!: () => void, serial = 0
  const active = new Promise<void>(done => { entered = done })
  const held = new Promise<void>(done => { release = done })
  let mode: 'read' | 'hold' | 'ask' = 'read'
  const fixture = fixtureProvider(async request => {
    if (mode === 'hold') { entered(); await held; return textReply('本轮完成') }
    if (mode === 'ask') return toolReply('ask_user', { question: '下一步读取哪个章节？' }, `source-ask-${++serial}`)
    const lastUser = request.messages.map(message => message.role).lastIndexOf('user')
    const turn = request.messages.slice(lastUser)
    const result = turn.find(message => message.role === 'tool')
    return result ? textReply(`资料读取完成：${String(result.content)}`) : toolReply('read_project_file', { scope: 'source', path: 'paper.txt' }, `source-read-${++serial}`)
  })
  const token = 'source-binding-http-at-least-24-characters'
  const service = await createHttpService({ dataRoot, token,
    model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'source-test', fetch: fixture.fetch } })
  const server = serve({ hostname: '127.0.0.1', port: 0, fetch: service.app.fetch })
  if (!server.listening) await new Promise<void>(done => server.once('listening', done))
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const request = (path: string, method = 'GET', body?: unknown) => fetch(`${baseUrl}/lumen${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  })
  const endpoint = '/projects/p/source'
  const sourceFile = '/files?projectId=p&taskId=t&scope=source&path=paper.txt'
  let running: Promise<unknown> | undefined
  try {
    assert.equal((await fetch(`${baseUrl}/lumen${endpoint}`)).status, 401)
    assert.equal((await request('/projects', 'POST', { id: 'p', name: '资料绑定研究' })).status, 201)
    assert.equal((await request('/sessions', 'POST', { projectId: 'p', taskId: 't' })).status, 200)
    assert.equal((await request('/projects/missing/source')).status, 404)
    assert.deepEqual(await (await request(endpoint)).json(), { path: null, readOnly: true })
    assert.equal((await request(endpoint, 'PATCH', { path: first })).status, 200)
    assert.equal((await (await request(sourceFile)).json()).content, 'SOURCE-A-41')
    const oldHttpView = await service.application.projectFiles('p', 'source')
    const session = await service.application.session('p', 't')
    await session.sendMessage({ content: '读取当前绑定资料' })
    const oldToolView = await service.application.projectFiles('p', 'source', true)
    assert.match(String(fixture.requests.at(-1)!.messages.at(-1)?.content), /SOURCE-A-41/)
    assert.equal((await request(endpoint, 'PATCH', { path: second })).status, 200)
    assert.equal((await (await request(sourceFile)).json()).content, 'SOURCE-B-73')
    assert.notEqual(await service.application.projectFiles('p', 'source'), oldHttpView)
    assert.notEqual(await service.application.projectFiles('p', 'source', true), oldToolView)
    await session.sendMessage({ content: '再次读取当前绑定资料' })
    assert.match(String(fixture.requests.at(-1)!.messages.at(-1)?.content), /SOURCE-B-73/)
    mode = 'hold'
    running = session.sendMessage({ content: '执行一轮研究' })
    await active
    assert.equal((await request(endpoint, 'PATCH', { path: first })).status, 409)
    assert.equal((await (await request(endpoint)).json()).path, await realpath(second))
    release(); await running; running = undefined
    mode = 'ask'
    await session.sendMessage({ content: '先向我确认问题' })
    assert.ok(session.displayState.get().pendingSuspensions.size > 0)
    assert.equal((await request(endpoint, 'PATCH', { path: null })).status, 409)
    assert.equal((await (await request(endpoint)).json()).path, await realpath(second))
    assert.equal((await request('/stop', 'POST', { projectId: 'p', taskId: 't' })).status, 200)
    assert.equal((await request(endpoint, 'PATCH', { path: null })).status, 200)
    assert.deepEqual(await (await request(endpoint)).json(), { path: null, readOnly: true })
    assert.equal((await request(sourceFile)).status, 404)
    await assert.rejects(() => service.application.projectFiles('p', 'source', true), /尚未绑定/)
    assert.equal(await readFile(join(first, 'paper.txt'), 'utf8'), 'SOURCE-A-41')
    assert.equal(await readFile(join(second, 'paper.txt'), 'utf8'), 'SOURCE-B-73')
  } finally {
    release(); await running?.catch(() => {})
    if ('closeAllConnections' in server) server.closeAllConnections()
    await new Promise<void>((done, fail) => server.close(error => error ? fail(error) : done()))
    await service.close()
    await rm(root, { recursive: true, force: true })
  }
})

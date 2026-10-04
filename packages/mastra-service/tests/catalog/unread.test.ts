/**
 * [INPUT]: 真实 Mastra 持久消息、产品目录 HTTP、SQLite 阅读游标与确定性模型网络
 * [OUTPUT]: 新消息未读、已读幂等、迟到确认、重开和历史继续研究、真实TCP手动未读持久化与授权的行为证据
 * [POS]: 验证阅读游标不改写框架 thread 时间/元数据，不能用旧页面确认掩盖新消息
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHttpService } from '../../src/server.ts'
import type { SessionSummary, Page } from '../../src/catalog/types.ts'
import { fixtureProvider, textReply } from '../provider-fixture.ts'

test('已读以实际持久消息为准，迟到确认不清新消息，确认不改变原生排序与元数据', { timeout: 90000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-unread-'))
  const fixture = fixtureProvider(() => textReply('本轮研究已完成'))
  const token = 'unread-catalog-at-least-24-characters'
  const options = { dataRoot, token, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'unread-test', fetch: fixture.fetch } }
  let service = await createHttpService(options)
  const request = (path: string, method = 'GET', body?: unknown) => service.app.request(`/lumen${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const status = async () => (await (await request('/projects/default/sessions')).json() as Page<SessionSummary>).items.find(item => item.taskId === 'research')!
  const read = async (messageId: string) => {
    const response = await request('/projects/default/sessions/research/read', 'POST', { messageId })
    assert.equal(response.status, 200)
    return response.json() as Promise<{ changed: boolean }>
  }
  try {
    assert.equal((await request('/sessions', 'POST', { projectId: 'default', taskId: 'research' })).status, 200)
    assert.equal((await status()).unread, false)
    assert.equal((await status()).lastMessageId, null)
    assert.deepEqual(await read('no-message'), { changed: false })
    const session = await service.application.session('default', 'research')
    await session.sendMessage({ content: '第一轮' })
    const first = await status()
    assert.equal(first.unread, true)
    assert.ok(first.lastMessageId)
    const memory = service.application.memory
    const before = await memory.getThreadById({ threadId: 'default:research' })
    assert.deepEqual(await read(first.lastMessageId!), { changed: true })
    assert.deepEqual(await read(first.lastMessageId!), { changed: false })
    assert.deepEqual(await memory.getThreadById({ threadId: 'default:research' }), before)
    assert.equal((await status()).unread, false)
    await session.sendMessage({ content: '第二轮' })
    const next = await status()
    assert.equal(next.unread, true)
    assert.notEqual(next.lastMessageId, first.lastMessageId)
    assert.deepEqual(await read(first.lastMessageId!), { changed: false })
    assert.equal((await status()).unread, true)
    assert.equal((await request('/projects/unknown/sessions/research/read', 'POST', { messageId: next.lastMessageId })).status, 404)
    assert.equal((await request('/projects/default/sessions/research/read', 'POST', { messageId: null })).status, 400)
    assert.deepEqual(await read(next.lastMessageId!), { changed: true })
    await service.close()
    service = await createHttpService(options)
    assert.equal((await status()).lastMessageId, next.lastMessageId)
    assert.equal((await status()).unread, false)
    const restored = await service.application.session('default', 'research')
    await restored.sendMessage({ content: '重开后新增一轮' })
    assert.equal((await status()).unread, true)
    assert.notEqual((await status()).lastMessageId, next.lastMessageId)
  } finally { await service.close(); await rm(dataRoot, { recursive: true, force: true }) }
})

test('没有旧游标的导入消息默认已读，导入会话的新原生消息仍为未读', { timeout: 90000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-imported-unread-'))
  const fixture = fixtureProvider(() => textReply('从历史研究继续'))
  const token = 'unread-imported-at-least-24-characters'
  const service = await createHttpService({ dataRoot, token,
    model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'unread-test', fetch: fixture.fetch } })
  try {
    const { memory } = service.application
    await service.catalog.createSession('default', 'legacy')
    await memory.updateThread({ id: 'default:legacy', metadata: { legacy: { version: 1 } } })
    await memory.saveMessages({ messages: [{ id: 'legacy-original', threadId: 'default:legacy', resourceId: 'default:legacy',
      role: 'assistant', createdAt: new Date('2025-01-01T00:00:00Z'), content: {
        format: 2, parts: [{ type: 'text', text: '历史结论' }], metadata: { legacy: { eventId: 'old-event' } },
      } }] })
    const imported = await service.catalog.getSession('default', 'legacy')
    assert.equal(imported.lastMessageId, 'legacy-original')
    assert.equal(imported.unread, false)
    const session = await service.application.session('default', 'legacy')
    await session.sendMessage({ content: '继续这个历史研究' })
    const continued = await service.catalog.getSession('default', 'legacy')
    assert.notEqual(continued.lastMessageId, imported.lastMessageId)
    assert.equal(continued.unread, true)
    assert.deepEqual(await service.catalog.markSessionRead('default', 'legacy', imported.lastMessageId!), { changed: false })
    assert.equal((await service.catalog.getSession('default', 'legacy')).unread, true)
  } finally { await service.close(); await rm(dataRoot, { recursive: true, force: true }) }
})

test('真实 HTTP 手动未读持久化、空会话切换、认证和归属验证且不改变thread', { timeout: 90000 }, async () => {
  const { serve } = await import('@hono/node-server')
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-manual-unread-'))
  const fixture = fixtureProvider(() => textReply('未调用模型'))
  const token = 'manual-unread-at-least-24-characters'
  const options = { dataRoot, token, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'unread-test', fetch: fixture.fetch } }
  let service = await createHttpService(options)
  const server = serve({ hostname: '127.0.0.1', port: 0, fetch: request => service.app.fetch(request) })
  if (!server.listening) await new Promise<void>(done => server.once('listening', done))
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const base = `http://127.0.0.1:${address.port}/lumen`
  const endpoint = '/projects/default/sessions/manual/unread'
  const request = (path: string, body: unknown, bearer = token) => fetch(base + path, { method: 'POST', headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  try {
    await service.catalog.createSession('default', 'manual')
    const { memory } = service.application
    const before = await memory.getThreadById({ threadId: 'default:manual' })
    assert.equal((await request(endpoint, { unread: true }, 'incorrect')).status, 401)
    assert.equal((await request('/projects/unknown/sessions/manual/unread', { unread: true })).status, 404)
    await service.catalog.createProject('Other', 'other')
    assert.equal((await request('/projects/other/sessions/manual/unread', { unread: true })).status, 404)
    assert.equal((await request(endpoint, { unread: 'true' })).status, 400)
    assert.deepEqual(await (await request(endpoint, { unread: true })).json(), { changed: true })
    assert.equal((await service.catalog.getSession('default', 'manual')).unread, true)
    assert.deepEqual(await (await request(endpoint, { unread: true })).json(), { changed: false })
    assert.equal((await request(endpoint, { unread: false })).status, 200)
    assert.equal((await service.catalog.getSession('default', 'manual')).unread, false)
    await memory.saveMessages({ messages: [{ id: 'manual-message', threadId: 'default:manual', resourceId: 'default:manual', role: 'assistant', createdAt: new Date(), content: { format: 2, parts: [{ type: 'text', text: '已有结论' }] } }] })
    const withMessage = await memory.getThreadById({ threadId: 'default:manual' })
    await request(endpoint, { unread: false })
    assert.equal((await service.catalog.getSession('default', 'manual')).unread, false)
    await request(endpoint, { unread: true })
    assert.deepEqual(await memory.getThreadById({ threadId: 'default:manual' }), withMessage)
    assert.equal(withMessage?.createdAt.getTime(), before?.createdAt.getTime())
    await service.close(); service = await createHttpService(options)
    assert.equal((await service.catalog.getSession('default', 'manual')).unread, true)
    await request(endpoint, { unread: false })
    assert.equal((await service.catalog.getSession('default', 'manual')).unread, false)
  } finally { await new Promise<void>(done => server.close(() => done())); await service.close(); await rm(dataRoot, { recursive: true, force: true }) }
})

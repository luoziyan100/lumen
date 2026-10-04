/**
 * [INPUT]: 原生路由策略、真实 Mastra HTTP 服务与官方客户端
 * [OUTPUT]: 身份重绑定、scope 旁路、任务材料混读与历史读取无写入的 HTTP 回归证据
 * [POS]: 验证框架入口无法绕过产品会话生命周期，同时正常消息/SSE 仍可使用
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

test('原生 HTTP 固定任务身份，拒绝重绑定及 scope，正常 SDK 消息仍落盘', { timeout: 25000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-native-boundary-'))
  const token = 'native-policy-token-at-least-24-characters'
  const fixture = fixtureProvider(() => textReply('BOUND_TO_TASK_A'))
  const service = await createHttpService({ dataRoot, token,
    model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch },
  })
  const network = serve({ fetch: service.app.fetch, hostname: '127.0.0.1', port: 0 })
  if (!network.listening) await new Promise<void>(resolve => network.once('listening', resolve))
  const address = network.address()
  assert.ok(address && typeof address !== 'string')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const base = '/api/agent-controller/lumen/sessions/p%3Aa'
  let unsubscribe: (() => void) | undefined
  try {
    assert.equal((await fetch(`${baseUrl}/lumen/projects`, { method: 'POST', headers, body: JSON.stringify({ id: 'p', name: '研究' }) })).status, 201)
    for (const taskId of ['a', 'b']) assert.equal((await fetch(`${baseUrl}/lumen/sessions`, { method: 'POST', headers, body: JSON.stringify({ projectId: 'p', taskId }) })).status, 200)
    const client = new MastraClient({ baseUrl, headers })
    const session = client.getAgentController('lumen').session('p:a')
    const state = await session.state()
    assert.equal(state.threadId, 'p:a')
    const a = await service.application.session('p', 'a'), b = await service.application.session('p', 'b')
    for (const [current, text] of [[a, 'TASK_A_ONLY'], [b, 'TASK_B_ONLY']] as const) {
      await (await service.application.controller.resolveWorkspace({ session: current }))!.filesystem!.writeFile('marker.md', text)
    }
    for (const path of [`${base}/resource`, `${base}/thread`, '/api/agents/research/generate', '/api/agent-controller/lumen/sessions']) {
      const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers, body: JSON.stringify({ newResourceId: 'p:b', threadId: 'p:b', resourceId: 'p:a' }) })
      assert.equal(response.status, 404, path)
    }
    for (const path of [`${base}/messages?sessionScope=other`, `${base}/messages?sessionScope=`, `${base}?threadId=p%3Ab`]) {
      const response = await fetch(`${baseUrl}${path}`, { method: path.includes('/messages') ? 'POST' : 'GET', headers,
        ...(path.includes('/messages') ? { body: JSON.stringify({ message: 'UNTRACKED_RUN' }) } : {}),
      })
      assert.equal(response.status, 400, path)
    }
    const wrongThread = await fetch(`${baseUrl}${base}/threads/p%3Ab/messages`, { headers })
    assert.equal(wrongThread.status, 404)
    assert.equal(fixture.requests.length, 0)
    assert.equal(a.identity.getResourceId(), 'p:a')
    assert.equal(await service.application.controller.getSessionByResource('p:b'), b)
    assert.equal(await service.application.controller.getSessionByResource('p:a', 'other'), undefined)
    let finish!: () => void
    const done = new Promise<void>(resolve => { finish = resolve })
    const subscription = await session.subscribe({ onEvent: event => { if (event.type === 'agent_end') finish() } })
    unsubscribe = subscription.unsubscribe
    await session.sendMessage('Read task A')
    await done
    assert.match(JSON.stringify(await session.listMessages('p:a')), /BOUND_TO_TASK_A/)
    const file = await fetch(`${baseUrl}/lumen/files?projectId=p&taskId=a&path=marker.md`, { headers })
    assert.deepEqual(await file.json(), { content: 'TASK_A_ONLY' })
  } finally {
    unsubscribe?.()
    if ('closeAllConnections' in network) network.closeAllConnections()
    await new Promise<void>((resolve, reject) => network.close(error => error ? reject(error) : resolve()))
    await service.close()
    await rm(dataRoot, { recursive: true, force: true })
  }
})

test('只读原生历史不创建运行会话，不写模型配置、改排序时间或重存消息', { timeout: 25000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-history-readonly-'))
  const token = 'readonly-history-token-at-least-24-characters'
  const fixture = fixtureProvider(() => textReply('不应请求模型'))
  const service = await createHttpService({ dataRoot, token,
    model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  const network = serve({ fetch: service.app.fetch, hostname: '127.0.0.1', port: 0 })
  if (!network.listening) await new Promise<void>(resolve => network.once('listening', resolve))
  const address = network.address(); assert.ok(address && typeof address !== 'string')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const headers = { Authorization: `Bearer ${token}` }
  try {
    await service.catalog.createSession('default', 'history', '保留历史顺序')
    const { memory, controller } = service.application
    await memory.saveMessages({ messages: [{ id: 'original-message', role: 'assistant', threadId: 'default:history', resourceId: 'default:history',
      createdAt: new Date('2025-01-01T00:00:00Z'), content: { format: 2, parts: [{ type: 'text', text: '  原始正文\n' }] } }] })
    const thread = await memory.getThreadById({ threadId: 'default:history' }); assert.ok(thread)
    await memory.saveThread({ thread: { ...thread, updatedAt: new Date('2025-01-02T00:00:00Z') } })
    const beforeThread = await memory.getThreadById({ threadId: 'default:history' })
    const beforeMessages = await memory.recall({ threadId: 'default:history', perPage: false, hideSignals: false })
    const client = new MastraClient({ baseUrl, headers })
    const result = await client.getAgentController('lumen').session('default:history').listMessages('default:history', { perPage: 20 })
    assert.equal(result.messages[0]?.id, 'original-message')
    assert.deepEqual(await memory.getThreadById({ threadId: 'default:history' }), beforeThread)
    assert.deepEqual(await memory.recall({ threadId: 'default:history', perPage: false, hideSignals: false }), beforeMessages)
    assert.equal(await controller.getSessionByResource('default:history'), undefined)
    assert.equal(fixture.requests.length, 0)
    const missing = await fetch(`${baseUrl}/api/agent-controller/lumen/sessions/default%3Amissing/threads/default%3Amissing/messages`, { headers })
    assert.equal(missing.status, 404)
  } finally {
    if ('closeAllConnections' in network) network.closeAllConnections()
    await new Promise<void>((resolve, reject) => network.close(error => error ? reject(error) : resolve()))
    await service.close(); await rm(dataRoot, { recursive: true, force: true })
  }
})

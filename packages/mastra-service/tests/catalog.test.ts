/**
 * [INPUT]: 新 HTTP 服务、真实 Node SQLite 与 Mastra Memory、确定性模型网络
 * [OUTPUT]: 主题下会话的元数据、分页、重开与主题隔离的行为证据
 * [POS]: 验证产品目录直接使用原生 thread，不靠另一份会话表或运行状态副本
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHttpService } from '../src/server.ts'
import type { AgentControllerWireEvent } from '@mastra/core/agent-controller'
import type { Page, SessionSummary } from '../src/catalog/types.ts'
import type { Topic } from '../src/studio/types.ts'
import { fixtureProvider, textReply, toolReply } from './provider-fixture.ts'
import { ensureTopic } from './topic-fixture.ts'

const token = 'catalog-token-at-least-24-characters'
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

function endpoint(service: Awaited<ReturnType<typeof createHttpService>>) {
  return async <T>(path: string, method = 'GET', body?: unknown, status = 200): Promise<T> => {
    const response = await service.app.request(`/lumen${path}`, {
      method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const value = response.status === 204 ? null : await response.json()
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(value)}`)
    return value as T
  }
}

test('原生 thread 目录经执行和存储重开保留标题、置顶与主题隔离', { timeout: 25000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-catalog-'))
  const fixture = fixtureProvider(() => textReply('研究目录持久化成功'))
  const options = { dataRoot, token, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } }
  let service = await createHttpService(options)
  try {
    let request = endpoint(service)
    const p = (await request<Topic>('/topics', 'POST', { title: '论文研究' }, 201)).id
    const q = (await request<Topic>('/topics', 'POST', { title: '另一主题' }, 201)).id
    await request('/topics/missing/sessions', 'POST', { taskId: 't' }, 404)
    for (const topic of [p, q]) await request(`/topics/${topic}/sessions`, 'POST', { taskId: 'same', title: `${topic} 的研究` }, 201)
    await request(`/topics/${p}/sessions/same`, 'PATCH', { title: '方法比较', pinned: true, archived: true })
    await request(`/topics/${p}/sessions`, 'POST', { taskId: 'same' }, 201)
    const session = await service.application.session(p, 'same')
    await session.sendMessage({ content: '核对目录持久化' })
    const first = await request<SessionSummary>(`/topics/${p}/sessions/same`)
    assert.equal(first.title, '方法比较')
    assert.equal(first.topicId, p)
    assert.equal(first.pinned, true)
    assert.equal(first.archived, true)
    assert.equal((await request<SessionSummary>(`/topics/${q}/sessions/same`)).pinned, false)
    assert.equal((await request<Page<SessionSummary>>(`/topics/${p}/sessions`)).total, 0)
    assert.equal((await request<Page<SessionSummary>>(`/topics/${p}/sessions?archived=true`)).items[0]?.threadId, `${p}:same`)
    await service.close()
    service = await createHttpService(options)
    request = endpoint(service)
    assert.equal((await request<Topic>(`/topics/${p}`)).title, '论文研究')
    const reopened = await request<SessionSummary>(`/topics/${p}/sessions/same`)
    assert.equal(reopened.title, first.title)
    assert.equal(reopened.pinned, true)
    assert.equal(reopened.archived, true)
    const restored = await service.application.session(p, 'same')
    assert.match(JSON.stringify(await restored.thread.listMessages({ threadId: `${p}:same` })), /研究目录持久化成功/)
    assert.equal((await request<Page<SessionSummary>>(`/topics/${q}/sessions`)).items[0]?.threadId, `${q}:same`)
    assert.equal((await request<SessionSummary>(`/topics/${p}/sessions/same`)).createdAt, first.createdAt)
  } finally { await service.close(); await rm(dataRoot, { recursive: true, force: true }) }
})

test('目录分页、归档与并发修改遵守主题边界，归档主题不能开新对话', { timeout: 25000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-catalog-'))
  const fixture = fixtureProvider(() => textReply('unused'))
  const service = await createHttpService({ dataRoot, token,
    model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  try {
    const request = endpoint(service)
    const p = (await request<Topic>('/topics', 'POST', { title: '初始名' }, 201)).id
    for (const taskId of ['a', 'b', 'c']) await request(`/topics/${p}/sessions`, 'POST', { taskId }, 201)
    await Promise.all([
      request(`/topics/${p}/sessions/a`, 'PATCH', { pinned: true }),
      request(`/topics/${p}/sessions/a`, 'PATCH', { title: '并发重命名' }),
    ])
    const updated = await request<SessionSummary>(`/topics/${p}/sessions/a`)
    assert.equal(updated.pinned, true)
    assert.equal(updated.title, '并发重命名')
    const first = await request<Page<SessionSummary>>(`/topics/${p}/sessions?perPage=2`)
    const second = await request<Page<SessionSummary>>(`/topics/${p}/sessions?perPage=2&page=1`)
    assert.equal(first.total, 3)
    assert.equal(first.hasMore, true)
    assert.equal(second.hasMore, false)
    assert.equal(new Set([...first.items, ...second.items].map(item => item.taskId)).size, 3)
    await request(`/topics/${p}`, 'PATCH', { archived: true })
    await request(`/topics/${p}/sessions`, 'POST', { taskId: 'new' }, 409)
    assert.equal((await request<SessionSummary>(`/topics/${p}/sessions/a`)).taskId, 'a')
    await request(`/topics/${p}`, 'PATCH', { archived: false })
    await request(`/topics/${p}/sessions`, 'POST', { taskId: 'new' }, 201)
    await request(`/topics/${p}/sessions?perPage=0`, 'GET', undefined, 400)
    await request(`/topics/${p}/sessions/a`, 'PATCH', { topicId: 'other' }, 400)
    assert.equal((await service.app.request('/lumen/projects', { headers })).status, 404)
  } finally { await service.close(); await rm(dataRoot, { recursive: true, force: true }) }
})

test('会话授权只做归属检查，描述入口才读取最新消息', { timeout: 25000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-catalog-auth-'))
  const fixture = fixtureProvider(() => textReply('unused'))
  const service = await createHttpService({ dataRoot, token,
    model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  try {
    ensureTopic(service, 'default')
    await service.catalog.createSession('default', 'auth')
    const memory = service.application.memory as any
    const recall = memory.recall.bind(memory)
    let calls = 0
    memory.recall = async (...args: any[]) => { calls++; return recall(...args) }
    await service.catalog.requireSession('default', 'auth')
    assert.equal(calls, 0)
    await service.catalog.getSession('default', 'auth')
    assert.equal(calls, 1)
  } finally { await service.close(); await rm(dataRoot, { recursive: true, force: true }) }
})

test('重连快照保留真实审批与问答挂起，并按官方 wire 形状序列化 Map 和日期', { timeout: 25000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-snapshot-'))
  const fixture = fixtureProvider(request => {
    const results = request.messages.filter(message => message.role === 'tool')
    if (JSON.stringify(results).includes('方法章节')) return textReply('按方法章节继续')
    if (results.length) return toolReply('ask_user', { question: '重点看什么章节？' }, 'call-ask')
    return toolReply('write_file', { path: 'notes/progress.md', content: '已读取材料' }, 'call-write')
  })
  const service = await createHttpService({ dataRoot, token,
    model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  try {
    const request = endpoint(service)
    ensureTopic(service, 'default')
    await request('/topics/default/sessions', 'POST', { taskId: 'snapshot' }, 201)
    const session = await service.application.session('default', 'snapshot')
    await session.permissions.setForTool({ toolName: 'write_file', policy: 'ask' })
    await session.permissions.setForTool({ toolName: 'ask_user', policy: 'allow' })
    let approved!: () => void
    const pending = new Promise<void>(resolve => { approved = resolve })
    session.subscribe(event => { if (event.type === 'tool_approval_required') approved() })
    const running = session.sendMessage({ content: '帮我读论文' })
    await pending
    type Snapshot = { displayState: Extract<AgentControllerWireEvent, { type: 'display_state_changed' }>['displayState'] }
    const approval = await request<Snapshot>('/snapshot?topicId=default&taskId=snapshot')
    const [parked] = Object.values(approval.displayState.pendingApprovals)
    assert.equal(parked?.toolName, 'write_file')
    session.respondToToolApproval({ toolCallId: parked!.toolCallId, decision: 'approve' })
    await running
    const suspended = await request<Snapshot>('/snapshot?topicId=default&taskId=snapshot')
    const prompt = Object.values(suspended.displayState.pendingSuspensions)[0]
    assert.equal(prompt?.toolName, 'ask_user')
    const changed = Object.values(suspended.displayState.modifiedFiles)[0]
    assert.equal(typeof changed?.firstModified, 'string')
    await session.respondToToolSuspension({ toolCallId: prompt!.toolCallId, resumeData: '方法章节' })
    const completed = await request<Snapshot>('/snapshot?topicId=default&taskId=snapshot')
    assert.equal(Object.keys(completed.displayState.pendingSuspensions).length, 0)
    assert.equal(completed.displayState.isRunning, false)
    await request('/snapshot?topicId=unknown&taskId=snapshot', 'GET', undefined, 404)
  } finally { await service.close(); await rm(dataRoot, { recursive: true, force: true }) }
})

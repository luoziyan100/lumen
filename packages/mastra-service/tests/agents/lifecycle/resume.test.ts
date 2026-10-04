/**
 * [INPUT]: 完整HTTP/Controller、原生专家委派与Memory、隔离目录模型协议夹具
 * [OUTPUT]: 同专家显式继续、原目录/上下文、重启恢复和跨任务拒绝的集成证据
 * [POS]: 验证真实原生委派链，历史副作用不因继续重放
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, stat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHttpService } from '../../../src/server.ts'
import { fixtureProvider, textReply, toolReply } from '../../provider-fixture.ts'

test('显式继续复用原专家上下文及目录，重启后仍可继续；跨任务或模型另建专家均拒绝', { timeout: 30000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-resume-'))
  let childCalls = 0, continuedId = '', phase = 'first', inherited = false
  const parentCalls = new Map<string, number>()
  const fixture = fixtureProvider(request => {
    const isParent = request.tools?.some(tool => tool.function.name === 'agent-reader')
    const messages = JSON.stringify(request.messages)
    if (isParent) {
      const count = parentCalls.get(phase) ?? 0; parentCalls.set(phase, count + 1)
      if (count) return textReply('专家结果已接收')
      return toolReply(phase === 'ignores-id' ? 'agent-reader' : 'agent-searcher', { prompt: phase === 'first' ? '首次检索' : '继续检索', ...(phase === 'continue' ? { threadId: continuedId } : {}) }, `delegate-${phase}`)
    }
    childCalls++
    if (phase === 'first') return textReply('FIRST_SPECIALIST_CONTEXT：证据在原目录，尚需复核')
    inherited = messages.includes('FIRST_SPECIALIST_CONTEXT')
    return textReply('CONTINUED_CONTEXT_CONFIRMED')
  })
  const options = { dataRoot: root, token: 'resume-test-token-with-sufficient-length', model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } }
  let service = await createHttpService(options)
  const headers = { Authorization: `Bearer ${options.token}`, 'Content-Type': 'application/json' }
  const post = (body: unknown) => service.app.request('/lumen/specialists/continue', { method: 'POST', headers, body: JSON.stringify(body) })
  try {
    await service.catalog.createProject('项目', 'p'); await service.catalog.createSession('p', 'task')
    let session = await service.application.session('p', 'task')
    await session.permissions.setForTool({ toolName: 'agent-searcher', policy: 'allow' })
    await session.sendMessage({ content: '委派检索' })
    const first = (await service.application.specialistHistory.list('p:task'))[0]!
    assert.ok(first); assert.equal(first.status, 'completed'); assert.ok(first.threads.length)
    continuedId = first.id
    await service.application.specialistHistory.prepare('p:task', continuedId, 'simulated-crash-intent')
    await service.close(); service = await createHttpService(options)
    session = await service.application.session('p', 'task')
    await session.permissions.setForTool({ toolName: 'agent-searcher', policy: 'allow' })
    phase = 'continue'
    const response = await post({ projectId: 'p', taskId: 'task', specialistId: continuedId, prompt: '补充复核' })
    assert.equal(response.status, 200, await response.clone().text())
    const result = await response.json()
    assert.equal(result.record.id, first.id); assert.equal(result.record.directory, first.directory)
    assert.equal(result.record.continuations, 1); assert.equal(result.record.threads.length, first.threads.length + 1)
    assert.equal(inherited, true); assert.equal(childCalls, 2)
    await service.catalog.createSession('p', 'other')
    const wrong = await post({ projectId: 'p', taskId: 'other', specialistId: continuedId, prompt: '错误任务' })
    assert.equal(wrong.status, 409); assert.equal(childCalls, 2)
    await session.permissions.setForTool({ toolName: 'agent-reader', policy: 'allow' })
    phase = 'ignores-id'
    const ignored = await post({ projectId: 'p', taskId: 'task', specialistId: continuedId, prompt: '必须继续' })
    assert.equal(ignored.status, 409); assert.equal(childCalls, 2)
    assert.equal((await service.application.specialistHistory.list('p:task')).length, 1)
    phase = 'approval'
    await session.permissions.setForTool({ toolName: 'agent-searcher', policy: 'ask' })
    const waiting = await post({ projectId: 'p', taskId: 'task', specialistId: continuedId, prompt: '审批后继续原专家' })
    assert.equal(waiting.status, 202, await waiting.clone().text()); assert.equal(childCalls, 2)
    const duplicate = await post({ projectId: 'p', taskId: 'task', specialistId: continuedId, prompt: '重复提交' })
    assert.equal(duplicate.status, 409)
    const approval = session.displayState.get().pendingApproval; assert.ok(approval)
    let ended!: () => void
    const end = new Promise<void>(resolve => { ended = resolve })
    const unsubscribe = session.subscribe(event => { if (event.type === 'agent_end') ended() })
    const approved = await service.app.request('/api/agent-controller/lumen/sessions/p%3Atask/tool-approval', { method: 'POST', headers,
      body: JSON.stringify({ toolCallId: approval.toolCallId, approved: true }) })
    assert.equal(approved.status, 200); await end; unsubscribe()
    assert.equal(childCalls, 3)
    const afterApproval = (await service.application.specialistHistory.list('p:task'))[0]!
    assert.equal(afterApproval.id, first.id); assert.equal(afterApproval.directory, first.directory)
    assert.equal(afterApproval.continuations, 2)

  } finally { await service.close(); await rm(root, { recursive: true, force: true }) }
})


test('专家中断后显式继续读取既有历史与原产物，不重放已经完成的写工具', { timeout: 20000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-resume-interrupted-'))
  let phase = 'first', parentCalls = 0, childCalls = 0, inherited = false, reached!: () => void
  const reachedPending = new Promise<void>(resolve => { reached = resolve })
  const fixture = fixtureProvider(async (request, signal) => {
    if (request.tools?.some(tool => tool.function.name === 'agent-reader')) {
      if (parentCalls++) return textReply('已接收专家回报')
      return toolReply('agent-searcher', { prompt: phase === 'first' ? '写入一次后研究' : '仅基于旧事实总结，禁止重新写入' }, `delegate-${phase}`)
    }
    childCalls++
    if (phase === 'resume') { inherited = JSON.stringify(request.messages).includes('SAVED_ONCE'); return textReply('从已有事实继续，无需重放写入') }
    if (childCalls === 1) return toolReply('write_file', { path: 'once.txt', content: 'SAVED_ONCE' }, 'write-once')
    reached()
    await new Promise<void>((_resolve, reject) => {
      if (signal?.aborted) reject(signal.reason)
      else signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
    return textReply('不应到达')
  })
  const token = 'interrupted-specialist-test-token-long-enough'
  const service = await createHttpService({ dataRoot: root, token, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  let sending: Promise<unknown> | undefined
  try {
    await service.catalog.createProject('项目', 'p'); await service.catalog.createSession('p', 'task')
    const session = await service.application.session('p', 'task')
    await session.permissions.setForTool({ toolName: 'agent-searcher', policy: 'allow' })
    sending = session.sendMessage({ content: '委派研究' })
    await reachedPending; await service.application.stop('p', 'task'); await sending.catch(() => {})
    const before = (await service.application.specialistHistory.list('p:task'))[0]!
    assert.ok(before.threads.length); assert.notEqual(before.status, 'running')
    const file = join(root, 'projects', 'p', 'tasks', 'task', before.directory, 'once.txt')
    assert.equal(await readFile(file, 'utf8'), 'SAVED_ONCE')
    const writtenAt = (await stat(file)).mtimeMs
    phase = 'resume'; parentCalls = 0
    const response = await service.app.request('/lumen/specialists/continue', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'p', taskId: 'task', specialistId: before.id, prompt: '基于已保存事实继续' }) })
    assert.equal(response.status, 200, await response.clone().text())
    assert.equal(inherited, true); assert.equal((await stat(file)).mtimeMs, writtenAt)
    const after = (await service.application.specialistHistory.list('p:task'))[0]!
    assert.equal(after.id, before.id); assert.equal(after.directory, before.directory); assert.equal(after.continuations, 1)
  } finally { await service.application.stop('p', 'task').catch(() => {}); await sending?.catch(() => {}); await service.close(); await rm(root, { recursive: true, force: true }) }
})

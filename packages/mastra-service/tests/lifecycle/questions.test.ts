/**
 * [INPUT]: 真实 Mastra/LibSQL 关闭重开、官方 HTTP/SSE 客户端与确定性模型边界
 * [OUTPUT]: ask_user 跨进程恢复、答案持久化、重复/失效回复 409 与明确取消不复活
 * [POS]: 验证原生 suspended snapshot 恢复，而非只在同一进程保留工具调用 ID
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { MastraServer, type HonoBindings, type HonoVariables } from '@mastra/hono'
import { MastraClient } from '@mastra/client-js'
import { createApplication } from '../../src/application.ts'
import { restoreSuspendedQuestions, cancelSuspendedQuestions } from '../../src/lifecycle/questions.ts'
import { nativeRoutePolicy } from '../../src/http/native-routes.ts'
import { suspensionResponses } from '../../src/http/suspensions.ts'
import { fixtureProvider, textReply, toolReply } from '../provider-fixture.ts'

function settings(fetch: typeof globalThis.fetch) {
  return { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch }
}

async function askBeforeClose(app: Awaited<ReturnType<typeof createApplication>>) {
  const session = await app.session('p', 'ask')
  const unsubscribe = session.subscribe(event => {
    if (event.type === 'tool_approval_required') session.respondToToolApproval({ toolCallId: event.toolCallId, decision: 'approve' })
  })
  try { await session.sendMessage({ content: '阅读论文并提问' }) }
  finally { unsubscribe() }
  assert.equal(session.displayState.get().pendingSuspensions.size, 1)
  await app.close()
}

test('ask_user 关闭重开恢复原生提问，HTTP 回复进入历史且重复/跨任务回复返回 409', { timeout: 25000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-question-restart-'))
  const fixture = fixtureProvider(request => request.messages.some(message => message.role === 'tool')
    ? textReply('按方法章节继续研究') : toolReply('ask_user', { question: '阅读哪个章节？', options: [{ label: '方法' }, { label: '结果' }] }))
  let app = await createApplication({ dataRoot, model: settings(fixture.fetch) })
  let network: ReturnType<typeof serve> | undefined
  let unsubscribe: (() => void) | undefined
  try {
    await askBeforeClose(app)
    app = await createApplication({ dataRoot, model: { ...settings(fixture.fetch), model: 'after-restart' } })
    const session = await app.session('p', 'ask')
    const context = { session, agent: app.mastra.getAgent('research') }
    const priorRequests = fixture.requests.length
    await restoreSuspendedQuestions(context)
    assert.equal(session.displayState.get().pendingSuspensions.size, 1)
    assert.equal(await restoreSuspendedQuestions(context), 0)
    assert.equal(fixture.requests.length, priorRequests)
    assert.deepEqual(session.displayState.get().pendingSuspensions.get('call-1')?.suspendPayload, {
      question: '阅读哪个章节？', options: [{ label: '方法' }, { label: '结果' }], selectionMode: 'single_select',
    })
    const http = new Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>()
    http.use('*', nativeRoutePolicy((project, task) => app.session(project, task),
      (project, task) => app.memory.getThreadById({ threadId: `${project}:${task}`, resourceId: `${project}:${task}` })))
    http.use('*', suspensionResponses(async (project, task) => ({ session: await app.session(project, task), agent: app.mastra.getAgent('research') })))
    await new MastraServer({ app: http, mastra: app.mastra }).init()
    network = serve({ fetch: http.fetch, hostname: '127.0.0.1', port: 0 })
    if (!network.listening) await new Promise<void>(resolve => network!.once('listening', resolve))
    const address = network.address()
    assert.ok(address && typeof address !== 'string')
    const baseUrl = `http://127.0.0.1:${address.port}`
    const answer = (resourceId: string, toolCallId: string) => fetch(`${baseUrl}/api/agent-controller/lumen/sessions/${encodeURIComponent(resourceId)}/tool-suspension`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toolCallId, resumeData: '方法章节' }),
    })
    for (const [resourceId, toolCallId] of [['p:ask', 'expired'], ['p:other', 'call-1']]) {
      const response = await answer(resourceId!, toolCallId!)
      assert.equal(response.status, 409)
      assert.match((await response.json() as { error: string }).error, /答案未提交/)
    }
    assert.equal(fixture.requests.length, priorRequests)
    const client = new MastraClient({ baseUrl }).getAgentController('lumen').session('p:ask')
    await assert.rejects(client.respondToToolSuspension('expired', '方法章节'), /答案未提交/)
    let finish!: () => void
    const done = new Promise<void>(resolve => { finish = resolve })
    unsubscribe = (await client.subscribe({ onEvent: event => { if (event.type === 'agent_end') finish() } })).unsubscribe
    const responses = await Promise.all([answer('p:ask', 'call-1'), answer('p:ask', 'call-1')])
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409])
    await done
    const history = JSON.stringify(await client.listMessages('p:ask'))
    assert.match(history, /User answered: 方法章节/)
    assert.match(history, /按方法章节继续研究/)
    assert.equal(fixture.requests.at(-1)?.model, 'after-restart')
    assert.equal((await answer('p:ask', 'call-1')).status, 409)
    assert.equal((await context.agent.listSuspendedRuns({ threadId: 'p:ask', resourceId: 'p:ask' })).runs.length, 0)
  } finally {
    unsubscribe?.()
    if (network) {
      if ('closeAllConnections' in network) network.closeAllConnections()
      await new Promise<void>((resolve, reject) => network!.close(error => error ? reject(error) : resolve()))
    }
    await app.close()
    await rm(dataRoot, { recursive: true, force: true })
  }
})

test('用户明确取消的问题持久化为 canceled，重启不会复活提问或重放模型', { timeout: 25000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-question-cancel-'))
  const fixture = fixtureProvider(() => toolReply('ask_user', { question: '还需要继续吗？' }))
  let app = await createApplication({ dataRoot, model: settings(fixture.fetch) })
  try {
    await askBeforeClose(app)
    app = await createApplication({ dataRoot, model: settings(fixture.fetch) })
    let session = await app.session('p', 'ask')
    const context = { session, agent: app.mastra.getAgent('research') }
    await restoreSuspendedQuestions(context)
    assert.equal(session.displayState.get().pendingSuspensions.size, 1)
    const history = await session.thread.listMessages({ threadId: 'p:ask' })
    assert.equal(await cancelSuspendedQuestions(context, (await app.storage.getStore('workflows'))!), 1)
    session.abort()
    await app.close()
    const priorRequests = fixture.requests.length
    app = await createApplication({ dataRoot, model: settings(fixture.fetch) })
    session = await app.session('p', 'ask')
    assert.equal(await restoreSuspendedQuestions({ session, agent: app.mastra.getAgent('research') }), 0)
    assert.equal(session.displayState.get().pendingSuspensions.size, 0)
    assert.deepEqual(await session.thread.listMessages({ threadId: 'p:ask' }), history)
    assert.equal(fixture.requests.length, priorRequests)
  } finally { await app.close(); await rm(dataRoot, { recursive: true, force: true }) }
})

test('同进程提问后立即停止等待自身落盘，不等待其他任务且重启不复活', { timeout: 25000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-question-stop-'))
  let started!: () => void
  const blocking = new Promise<void>(resolve => { started = resolve })
  let otherAborted = false
  const fixture = fixtureProvider(async (request, signal) => {
    if (!JSON.stringify(request.messages).includes('OTHER_TASK')) return toolReply('ask_user', { question: '选择章节？' })
    started()
    await new Promise<void>((_resolve, reject) => {
      const abort = () => { otherAborted = true; reject(new DOMException('Cancelled', 'AbortError')) }
      if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true })
    })
    return textReply('不会完成')
  })
  let app = await createApplication({ dataRoot, model: settings(fixture.fetch) })
  let deadline: ReturnType<typeof setTimeout> | undefined
  try {
    const other = await app.session('p', 'other')
    const running = other.sendMessage({ content: 'OTHER_TASK' }).catch(error => { assert.match(String(error), /abort|cancel/i) })
    await blocking
    const question = await app.session('p', 'ask')
    await question.sendMessage({ content: '请先询问' })
    assert.equal(question.displayState.get().pendingSuspensions.size, 1)
    await Promise.race([app.stop('p', 'ask'), new Promise<never>((_resolve, reject) => {
      deadline = setTimeout(() => reject(new Error('单任务停止错误地等待其他任务')), 3000)
    })])
    clearTimeout(deadline)
    assert.equal(otherAborted, false)
    assert.equal(question.displayState.get().pendingSuspensions.size, 0)
    await app.stop('p', 'other')
    await running
    await app.close()
    const priorRequests = fixture.requests.length
    app = await createApplication({ dataRoot, model: settings(fixture.fetch) })
    assert.equal((await app.session('p', 'ask')).displayState.get().pendingSuspensions.size, 0)
    assert.equal(fixture.requests.length, priorRequests)
  } finally { clearTimeout(deadline); await app.close(); await rm(dataRoot, { recursive: true, force: true }) }
})

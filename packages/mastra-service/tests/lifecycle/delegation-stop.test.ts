/**
 * [INPUT]: 真实 Controller 委派、后台子 Agent、按任务输出排空与模型 HTTP 夹具
 * [OUTPUT]: 子运行按父任务归属排空；停止一个父任务不等待另一任务的子模型
 * [POS]: 原生子记忆 resource 与父任务不同，生命周期必须使用受信 Controller 身份
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scheduler } from 'node:timers/promises'
import { createApplication } from '../../src/application.ts'
import { trackAgentDrain } from '../../src/drain.ts'
import { fixtureProvider, textReply, toolReply } from '../provider-fixture.ts'

test('真实后台专家按父任务排空，停止 A 不等待 B 的专家模型', { timeout: 60000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-delegation-stop-'))
  const started = new Map<string, () => void>()
  const waiting = new Map(['A', 'B'].map(id => [id, new Promise<void>(resolve => { started.set(id, resolve) })]))
  const aborted = new Set<string>()
  const fixture = fixtureProvider(async (request, signal) => {
    const id = JSON.stringify(request.messages).includes('CHILD_A') ? 'A' : 'B'
    if (!request.tools?.some(tool => tool.function.name === 'agent-reader')) {
      started.get(id)!()
      await new Promise<void>((_resolve, reject) => {
        const stop = () => { aborted.add(id); reject(new DOMException('Cancelled', 'AbortError')) }
        if (signal?.aborted) stop(); else signal?.addEventListener('abort', stop, { once: true })
      })
      return textReply('不会完成')
    }
    return request.messages.some(message => message.role === 'tool') ? textReply('专家正在研究')
      : toolReply('agent-reader', { prompt: `CHILD_${id}`, _background: { disposition: 'deferred' } }, `delegate-${id}`)
  })
  const app = await createApplication({ dataRoot, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  try {
    const a = await app.session('p', 'a'), b = await app.session('p', 'b')
    const drain = trackAgentDrain((await app.specialistProjects.get('p')).agents.reader!)
    for (const session of [a, b]) session.subscribe(event => {
      if (event.type === 'tool_approval_required') session.respondToToolApproval({ toolCallId: event.toolCallId, decision: 'approve' })
    })
    const sends = [a.sendMessage({ content: 'CHILD_A' }), b.sendMessage({ content: 'CHILD_B' })]
    await Promise.all(waiting.values())
    let drained = false
    const pending = drain('p:a').then(() => { drained = true })
    await scheduler.yield()
    assert.equal(drained, false, '子 Agent 的独立 memory.resource 不应使父任务排空提前完成')
    await app.stop('p', 'a')
    await pending
    assert.equal(aborted.has('A'), true)
    assert.equal(aborted.has('B'), false)
    await app.stop('p', 'b')
    await Promise.all(sends)
  } finally { await app.close(); await rm(dataRoot, { recursive: true, force: true }) }
})

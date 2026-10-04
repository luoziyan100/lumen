/**
 * [INPUT]: 新 HTTP 服务、原生 Controller/后台任务、可阻塞的 provider 响应
 * [OUTPUT]: 双会话子代取消隔离与完整应用退出证据
 * [POS]: 验证产品组合路径，不用单独 Agent 实验替代集成验收
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { createHttpService } from '../src/server.ts'
import { fixtureProvider, textReply, toolReply } from './provider-fixture.ts'

function blockedChildren() {
  const started = new Set<string>(), aborted = new Set<string>()
  const release = new Map<string, () => void>()
  const fixture = fixtureProvider(async (request, signal) => {
    const label = JSON.stringify(request.messages).includes('CHILD_A') ? 'A' : 'B'
    const child = request.messages.some(m => m.role === 'system' && String(m.content).includes('只读材料'))
    if (!child) {
      if (request.messages.some(m => m.role === 'tool')) return textReply(`父任务 ${label} 继续`)
      return toolReply('agent-reader', { prompt: `CHILD_${label}`, _background: { disposition: 'deferred' } })
    }
    started.add(label)
    await new Promise<void>((resolve, reject) => {
      release.set(label, resolve)
      const abort = () => { aborted.add(label); reject(new DOMException('Cancelled', 'AbortError')) }
      if (signal?.aborted) abort()
      else signal?.addEventListener('abort', abort, { once: true })
    })
    return textReply(`EVIDENCE_${label}`)
  })
  return { fixture, started, aborted, release }
}

async function until(predicate: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 10000
  while (!await predicate()) {
    assert.ok(Date.now() < deadline, '等待真实框架状态超时')
    await setTimeout(10)
  }
}

test('产品 HTTP 单子取消隔离另一任务，剩余子代完成并持久化', { timeout: 25000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-collaboration-'))
  const { fixture, started, aborted, release } = blockedChildren()
  const token = 'integration-token-at-least-24-characters'
  const service = await createHttpService({ dataRoot: root, token,
    model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch },
  })
  try {
    const a = await service.application.session('p', 'a'), b = await service.application.session('p', 'b')
    for (const session of [a, b]) session.subscribe(event => {
      if (event.type === 'tool_approval_required') session.respondToToolApproval({ toolCallId: event.toolCallId, decision: 'approve' })
    })
    const running = Promise.all([a.sendMessage({ content: 'CHILD_A' }), b.sendMessage({ content: 'CHILD_B' })])
    await until(() => started.size === 2)
    const manager = service.application.mastra.backgroundTaskManager!
    const tasks = await manager.listTasks({ resourceId: 'p:a' })
    assert.equal(tasks.tasks.length, 1)
    const id = tasks.tasks[0]!.id
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    const wrong = await service.app.request(`/lumen/children/${id}/cancel`, { method: 'POST', headers, body: JSON.stringify({ projectId: 'p', taskId: 'b' }) })
    assert.equal(wrong.status, 404)
    assert.equal(aborted.size, 0)
    const result = await service.app.request(`/lumen/children/${id}/cancel`, { method: 'POST', headers, body: JSON.stringify({ projectId: 'p', taskId: 'a' }) })
    assert.equal(result.status, 200)
    assert.ok(aborted.has('A'))
    assert.ok(!aborted.has('B'))
    release.get('B')!()
    await running
    await until(async () => (await manager.listTasks({ resourceId: 'p:b' })).tasks[0]?.status === 'completed')
    assert.equal((await manager.getTask(id))?.status, 'cancelled')
    const history = JSON.stringify(await b.thread.listMessages({ threadId: 'p:b' }))
    assert.match(history, /EVIDENCE_B/)
  } finally { await service.close(); await rm(root, { recursive: true, force: true }) }
})

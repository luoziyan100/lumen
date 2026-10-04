/**
 * [INPUT]: 独占临时数据根、真实 Mastra Agent/后台任务与模型网络夹具
 * [OUTPUT]: 经 IPC 报告已真实开始的 reader 子任务，供父进程 SIGKILL
 * [POS]: 崩溃恢复的子进程夹具；另以原生存储播种 pending/suspended/completed 对照行
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { open } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { createApplication } from '../../src/application.ts'
import { fixtureProvider, textReply, toolReply } from '../provider-fixture.ts'

const root = process.argv[2]!
const lock = await open(join(root, 'mastra-service.lock'), 'wx', 0o600)
await lock.writeFile(JSON.stringify({ pid: process.pid }))
let readerStarted = false
const fixture = fixtureProvider(async request => {
  if (request.messages.some(message => message.role === 'system' && String(message.content).includes('只读材料'))) {
    readerStarted = true
    await new Promise<never>(() => {})
  }
  return request.messages.some(message => message.role === 'tool')
    ? textReply('Parent continues')
    : toolReply('agent-reader', { prompt: 'CRASH_CHILD_REQUEST', _background: { disposition: 'deferred' } })
})
const app = await createApplication({ dataRoot: root,
  model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch },
})
const session = await app.session('p', 'crash')
session.subscribe(event => {
  if (event.type === 'tool_approval_required') session.respondToToolApproval({ toolCallId: event.toolCallId, decision: 'approve' })
})
void session.sendMessage({ content: 'CRASH_CHILD_REQUEST' }).catch(() => {})
const tasks = await app.mastra.backgroundTaskManager!.getStorage()
const deadline = Date.now() + 10000
for (;;) {
  const running = (await tasks.listTasks({ status: 'running', resourceId: 'p:crash' })).tasks[0]
  if (running && readerStarted) {
    await tasks.createTask({ ...running, id: 'pending-on-crash', status: 'pending', startedAt: undefined, maxRetries: 3 })
    await tasks.createTask({ ...running, id: 'suspended-control', status: 'suspended', suspendedAt: new Date(), suspendPayload: { question: 'Keep this answer pending' } })
    await tasks.createTask({ ...running, id: 'completed-control', status: 'completed', completedAt: new Date(), result: 'KEEP_RESULT' })
    process.send?.({ taskId: running.id })
    break
  }
  if (Date.now() >= deadline) throw new Error('The real child did not start')
  await setTimeout(10)
}

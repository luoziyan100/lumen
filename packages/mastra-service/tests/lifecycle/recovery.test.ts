/**
 * [INPUT]: 真实 reader 子进程、LibSQL 与启动结算入口
 * [OUTPUT]: SIGKILL 后遗留任务终态、消息保留、无模型重放的回归证据
 * [POS]: 只在已确认子进程死亡并重新取得临时根锁后运行结算，验证真实重启边界
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, open, rm, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LibSQLStore } from '@mastra/libsql'
import { createApplication } from '../../src/application.ts'
import { INTERRUPTED_CHILD_MESSAGE, recoverInterruptedChildren } from '../../src/lifecycle/recovery.ts'
import { fixtureProvider, textReply } from '../provider-fixture.ts'

test('进程崩溃后只结算遗留子任务，保留挂起/完成记录与消息且不重放模型', { timeout: 25000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-crash-recovery-'))
  const child = spawn(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('./crash-worker.ts', import.meta.url)), root], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  const exited = once(child, 'exit')
  let diagnostics = ''
  child.stderr?.on('data', data => { diagnostics += String(data) })
  let storage: LibSQLStore | undefined
  let lock: Awaited<ReturnType<typeof open>> | undefined
  let app: Awaited<ReturnType<typeof createApplication>> | undefined
  try {
    const [message] = await Promise.race([
      once(child, 'message'), exited.then(() => { throw new Error(`Worker exited before crashing: ${diagnostics}`) }),
    ])
    const { taskId } = message as { taskId: string }
    assert.equal(typeof taskId, 'string')
    child.kill('SIGKILL')
    await exited
    // -------- 测试已等待 owner 退出，才显式移除残留锁并重获独占 --------
    await unlink(join(root, 'mastra-service.lock'))
    lock = await open(join(root, 'mastra-service.lock'), 'wx', 0o600)
    storage = new LibSQLStore({ id: 'recovery', url: `file:${join(root, 'mastra.sqlite')}` })
    await storage.init()
    const tasks = (await storage.getStore('backgroundTasks'))!
    const memory = (await storage.getStore('memory'))!
    const before = await tasks.getTask(taskId)
    const history = await memory.listMessages({ threadId: 'p:crash', perPage: false })
    assert.equal(before?.status, 'running')
    assert.match(JSON.stringify(history), /CRASH_CHILD_REQUEST/)
    assert.equal(await recoverInterruptedChildren(tasks, { exclusiveStartup: true }), 2)
    for (const id of [taskId, 'pending-on-crash']) {
      const settled = await tasks.getTask(id)
      assert.equal(settled?.status, 'failed')
      assert.equal(settled?.error?.message, INTERRUPTED_CHILD_MESSAGE)
      assert.ok(settled?.completedAt)
      assert.equal(settled?.resourceId, 'p:crash')
    }
    const recovered = await tasks.getTask(taskId)
    assert.equal(recovered?.threadId, before?.threadId)
    assert.equal(recovered?.toolCallId, before?.toolCallId)
    assert.deepEqual(recovered?.args, before?.args)
    assert.equal((await tasks.getTask('suspended-control'))?.status, 'suspended')
    assert.deepEqual((await tasks.getTask('suspended-control'))?.suspendPayload, { question: 'Keep this answer pending' })
    assert.equal((await tasks.getTask('completed-control'))?.result, 'KEEP_RESULT')
    assert.deepEqual(await memory.listMessages({ threadId: 'p:crash', perPage: false }), history)
    assert.equal(await recoverInterruptedChildren(tasks, { exclusiveStartup: true }), 0)
    await storage.close(); storage = undefined
    const fixture = fixtureProvider(() => textReply('MUST_NOT_REPLAY'))
    app = await createApplication({ dataRoot: root,
      model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch },
    })
    const restored = await app.session('p', 'crash')
    assert.equal(restored.identity.getResourceId(), 'p:crash')
    assert.equal(fixture.requests.length, 0)
    assert.match(JSON.stringify(await restored.thread.listMessages({ threadId: 'p:crash' })), /CRASH_CHILD_REQUEST/)
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    await exited
    await app?.close()
    await storage?.close()
    await lock?.close()
    await rm(root, { recursive: true, force: true })
  }
})

/**
 * [INPUT]: Mastra 原生 agents 委派与 BackgroundTaskManager，provider 网络夹具
 * [OUTPUT]: 单子任务取消与父运行继续执行的机制证据
 * [POS]: P0 委派路径选择实验，不维护自定义子代理调度器
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Agent } from '@mastra/core/agent'
import { Mastra } from '@mastra/core/mastra'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { createModelGateway, modelId } from '../src/model.ts'
import { fixtureProvider, textReply, toolReply } from './provider-fixture.ts'

test('原生后台委派支持单子取消且父运行继续执行', { timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-background-'))
  let childStarted!: () => void
  const started = new Promise<void>(resolve => { childStarted = resolve })
  let childAborted = false, delegated = false
  const fixture = fixtureProvider(async (request, signal) => {
    if (request.messages.some(m => m.role === 'system' && String(m.content).includes('CHILD_WORKER'))) {
      childStarted()
      await new Promise<void>((_resolve, reject) => {
        const abort = () => { childAborted = true; reject(new DOMException('Cancelled', 'AbortError')) }
        if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true })
      })
      return textReply('unreachable')
    }
    if (!delegated) {
      delegated = true
      const tool = request.tools?.find(t => t.function.name.includes('reader'))
      assert.ok(tool)
      return toolReply(tool.function.name, { prompt: 'Read the paper', _background: { disposition: 'deferred' } })
    }
    return textReply('父 Agent 可继续处理其他工作')
  })
  const settings = { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'research-test', fetch: fixture.fetch }
  const storage = new LibSQLStore({ id: 'background-test', url: `file:${join(root, 'mastra.sqlite')}` })
  const memory = new Memory({ storage, options: { semanticRecall: false, workingMemory: { enabled: false } } })
  const reader = new Agent({ id: 'reader', name: 'Reader', description: 'Read papers', instructions: 'CHILD_WORKER', model: modelId(settings), memory })
  const parent = new Agent({ id: 'parent', name: 'Parent', instructions: 'Delegate paper reading', model: modelId(settings), memory,
    agents: { reader }, backgroundTasks: { tools: { reader: { enabled: true } } },
  })
  const mastra = new Mastra({ agents: { parent, reader }, storage, gateways: { lumen: createModelGateway(settings) },
    backgroundTasks: { enabled: true, recoverStaleTasksOnStart: false, defaultRetries: { maxRetries: 0 }, backpressure: 'reject' },
  })
  try {
    const stream = await parent.stream('Research the paper', { memory: { thread: 'parent-thread', resource: 'parent' }, maxSteps: 5 })
    const consuming = stream.consumeStream()
    await started
    const manager = mastra.backgroundTaskManager
    assert.ok(manager)
    const tasks = await manager.listTasks({ threadId: 'parent-thread' })
    assert.equal(tasks.tasks.length, 1)
    await manager.cancel(tasks.tasks[0]!.id)
    await consuming
    assert.ok(childAborted)
    assert.equal((await manager.getTask(tasks.tasks[0]!.id))?.status, 'cancelled')
    assert.match(await stream.text, /父 Agent/)
  } finally { await mastra.shutdown(); await storage.close(); await rm(root, { recursive: true, force: true }) }
})

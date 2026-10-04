/**
 * [INPUT]: 应用原生 task_* 工具、Controller 展示状态与真实 LibSQL 关闭重开
 * [OUTPUT]: 任务写入/更新/完成/检查同源，任务状态跨重启保留
 * [POS]: 任务清单沿框架 threadState 持久化，不另建 todo 存储
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TASK_STATE_TYPE, type TaskItemSnapshot } from '@mastra/core/tools'
import { createApplication } from '../../src/application.ts'
import { fixtureProvider, textReply, toolReply } from '../provider-fixture.ts'

test('原生 task_* 状态落盘，关闭重开仍可展示并核对完成', { timeout: 15000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-native-tasks-'))
  let step = 0, checkOnly = false
  const fixture = fixtureProvider(request => {
    if (checkOnly) {
      if (step++ === 0) return toolReply('task_check', {}, 'recheck')
      const result = JSON.parse(String(request.messages.at(-1)?.content))
      assert.equal(result.summary.allCompleted, true)
      return textReply('重启后任务仍已完成')
    }
    const replies = [toolReply('task_write', { tasks: [{ id: 'read', content: '阅读正文', status: 'pending', activeForm: '正在阅读正文' }] }, 'create'),
      toolReply('task_update', { id: 'read', status: 'in_progress' }, 'update'),
      toolReply('task_complete', { id: 'read' }, 'complete'), toolReply('task_check', {}, 'check')]
    return replies[step++] ?? textReply('任务完成')
  })
  const model = { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch }
  let app = await createApplication({ dataRoot, model })
  try {
    let session = await app.session('p', 'task')
    session.subscribe(event => { if (event.type === 'tool_approval_required') session.respondToToolApproval({ toolCallId: event.toolCallId, decision: 'approve' }) })
    await session.sendMessage({ content: '跟踪研究进展' })
    assert.equal(session.displayState.get().tasks[0]?.status, 'completed')
    await app.close()
    app = await createApplication({ dataRoot, model })
    session = await app.session('p', 'task')
    const persisted = await (await app.storage.getStore('threadState'))!.getState({ threadId: 'p:task', type: TASK_STATE_TYPE }) as TaskItemSnapshot[]
    assert.deepEqual(persisted.map(task => [task.id, task.status]), [['read', 'completed']])
    assert.deepEqual(session.displayState.get().tasks.map(task => [task.id, task.status]), [['read', 'completed']])
    step = 0; checkOnly = true
    session.subscribe(event => { if (event.type === 'tool_approval_required') session.respondToToolApproval({ toolCallId: event.toolCallId, decision: 'approve' }) })
    await session.sendMessage({ content: '重启后核对进展' })
    assert.match(JSON.stringify(await session.thread.listMessages({ threadId: 'p:task' })), /重启后任务仍已完成/)
  } finally { await app.close(); await rm(dataRoot, { recursive: true, force: true }) }
})

import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { Thread } from '../../src/core/thread.ts'
import { runAgent } from '../../src/core/loop.ts'
import { DEFAULT_LIMITS } from '../../src/core/limits.ts'
import type { AgentEvent } from '../../src/core/types.ts'
import { openDatabase } from '../../src/storage/db.ts'
import { TaskStore } from '../../src/storage/task-store.ts'
import { rebuildThread } from '../../src/storage/resume.ts'
import { ScriptedModel, assistantToolCall, assistantReply, fixedTool, noopCtx } from '../helpers/scripted-model.ts'

async function makeStore(t: TestContext): Promise<TaskStore> {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-resume-'))
  const db = openDatabase(path.join(base, 'lumen.sqlite'))
  t.after(() => {
    db.close()
    return rm(base, { recursive: true, force: true })
  })
  return new TaskStore(db)
}

test('resume：任务中途中断 → 从事件重建线程 → 续跑到完成（经真实循环）', async (t) => {
  const store = await makeStore(t)
  const SYSTEM = '你是 Lumen 研究 agent'
  const USER = '今天有什么论文'
  const task = store.createTask('p', USER)
  store.updateTaskStatus(task.id, 'running')

  // 把内核事件落进 task_events（这正是 M4 runtime 的 emit 接法）
  const emit = (event: AgentEvent): void => {
    store.appendEvent(task.id, event.kind, event.payload)
  }

  // —— 第一次运行：模型搜了一轮，但第 2 次响应"丢了"（脚本只有 1 条）→ 中断 ——
  const model1 = new ScriptedModel([assistantToolCall('s1', 'search')])
  const thread1 = new Thread([
    { role: 'system', content: SYSTEM },
    { role: 'user', content: USER },
  ])
  const run1 = await runAgent({
    thread: thread1,
    model: model1,
    tools: [fixedTool('search', 'SEARCH_RESULT_42')],
    limits: DEFAULT_LIMITS,
    ctx: noopCtx({ emit }),
  })
  assert.equal(run1.status, 'error', '第二次模型调用失败 → 中断')
  store.updateTaskStatus(task.id, 'interrupted')

  // 事件里应已持久化 model_step + tool_call + tool_result
  const kinds = store.listEvents(task.id).map((e) => e.kind)
  assert.ok(kinds.includes('tool_result'), '中断前 tool_result 已落库')
  assert.deepEqual(
    store.findInterrupted().map((x) => x.id),
    [task.id],
  )

  // —— 恢复：从事件重建线程 ——
  const rebuilt = rebuildThread(store.listEvents(task.id), { systemPrompt: SYSTEM, userText: USER })
  const roles = rebuilt.messages.map((m) => m.role)
  assert.deepEqual(roles, ['system', 'user', 'assistant', 'tool_result'])
  assert.equal(rebuilt.messages[3].content, 'SEARCH_RESULT_42')

  // —— 第二次运行：用重建线程续跑，模型这次直接收尾 ——
  const model2 = new ScriptedModel([assistantReply('基于已搜到的结果完成')])
  const run2 = await runAgent({
    thread: rebuilt,
    model: model2,
    tools: [fixedTool('search', 'SEARCH_RESULT_42')],
    limits: DEFAULT_LIMITS,
    ctx: noopCtx({ emit }),
  })

  assert.equal(run2.status, 'done')
  // 续跑时模型第一次调用就看到了中断前的工具结果（连续性）
  const firstResumeCall = model2.calls[0]
  assert.ok(
    firstResumeCall.find((m) => m.role === 'tool_result' && m.content === 'SEARCH_RESULT_42'),
    '续跑的模型必须看到中断前已搜到的结果',
  )
})

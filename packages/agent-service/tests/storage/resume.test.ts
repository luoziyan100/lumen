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
import { rebuildThread, INTERRUPTED_TOOL_RESULT } from '../../src/storage/resume.ts'
import { AgentRuntime } from '../../src/runtime/agent-runtime.ts'
import { ENV_TOOLS } from '../../src/tools/env/fs-tools.ts'
import { buildRoles } from '../../src/agents/roles.ts'
import { buildClaudeRequest } from '../../src/adapters/claude.ts'
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

test('resume×spawn：经真实 runtime 落库后重建，主线程只含 main 事件，worker 内部步骤不混入', async (t: TestContext) => {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-resume-spawn-'))
  const db = openDatabase(path.join(base, 'lumen.sqlite'))
  t.after(() => {
    db.close()
    return rm(base, { recursive: true, force: true })
  })
  const store = new TaskStore(db)

  const mainModel = new ScriptedModel([
    assistantToolCall('s', 'spawn', { role: 'searcher', scope: '扫今天', prompt: '搜并记笔记' }),
    assistantReply('已综合 worker 结果'),
  ])
  const workerModel = new ScriptedModel([
    assistantToolCall('w', 'write_file', { path: 'notes/found.md', content: '命中 3 篇' }),
    assistantReply('Scope: 扫今天\n命中: 3 篇'),
  ])
  const runtime = new AgentRuntime({
    store,
    model: mainModel,
    sessionDir: path.join(base, 'sessions'),
    workspacesDir: path.join(base, 'workspaces'),
    mainTools: ENV_TOOLS,
    roles: buildRoles(ENV_TOOLS, { model: workerModel }),
  })
  const taskId = runtime.submit({ projectId: 'p', userText: '今天有什么' })
  await runtime.waitFor(taskId)

  // worker 的事件确实落了库（可观测），且带角色标记
  const workerEvents = store.listEvents(taskId).filter((e) => e.agent_role === 'searcher')
  assert.ok(workerEvents.length >= 2, 'worker 的 model_step/tool_result 应落库且标记角色')

  // 但重建出的主线程必须与 main 当时所见一致：看不到 worker 内部
  const rebuilt = rebuildThread(store.listEvents(taskId), { systemPrompt: 'S', userText: '今天有什么' })
  const assistants = rebuilt.messages.filter((m) => m.role === 'assistant')
  const toolResults = rebuilt.messages.filter((m) => m.role === 'tool_result')
  assert.equal(assistants.length, 2, '主线程只有 main 的两次 assistant（spawn + 收尾）')
  assert.equal(toolResults.length, 1, '主线程只有 spawn 的压缩返回这一条 tool_result')
  assert.equal(toolResults[0].toolCallId, 's')
  assert.match(toolResults[0].content, /命中: 3 篇/, 'spawn 压缩返回保留（main 当时看到的）')
  assert.ok(
    !rebuilt.messages.some((m) => m.toolCallId === 'w'),
    'worker 内部 write_file 的 tool_result 不得混入主线程',
  )
})

test('悬空 tool_use：中断落在工具批次中间 → 重建合成"已中断"结果，配对完整且 provider 合法', async (t: TestContext) => {
  const store = await makeStore(t)
  const task = store.createTask('p', '查两件事')
  store.updateTaskStatus(task.id, 'running')

  // assistant 一轮发了两个 tool_call，但只有第一个的结果在崩溃前落了库
  store.appendEvent(task.id, 'model_step', {
    content: '',
    toolCalls: [
      { id: 'c1', name: 'search', arguments: {} },
      { id: 'c2', name: 'search', arguments: {} },
    ],
  }, 'main')
  store.appendEvent(task.id, 'tool_result', { id: 'c1', name: 'search', llmContent: 'RESULT_1' }, 'main')

  const rebuilt = rebuildThread(store.listEvents(task.id), { systemPrompt: 'S', userText: '查两件事' })

  const toolResults = rebuilt.messages.filter((m) => m.role === 'tool_result')
  assert.equal(toolResults.length, 2, '缺的那条必须被合成')
  assert.equal(toolResults[0].content, 'RESULT_1')
  assert.equal(toolResults[1].toolCallId, 'c2')
  assert.equal(toolResults[1].content, INTERRUPTED_TOOL_RESULT)

  // 不变式：每个 assistant 的 toolCall 在下一个 assistant 之前都有配对 tool_result
  const seen = new Set<string>()
  let pending: string[] = []
  for (const m of rebuilt.messages) {
    if (m.role === 'assistant') {
      assert.equal(pending.length, 0, `进入新一轮前必须结清: ${pending.join(',')}`)
      pending = (m.toolCalls ?? []).map((c) => c.id)
    } else if (m.role === 'tool_result' && m.toolCallId) {
      pending = pending.filter((id) => id !== m.toolCallId)
      seen.add(m.toolCallId)
    }
  }
  assert.equal(pending.length, 0)

  // provider 合法性：真实 adapter 构造的请求里 tool_use 全部有配对 tool_result block
  const request = buildClaudeRequest(rebuilt.forModel(), [], 'claude-sonnet-4-6')
  const uses: string[] = []
  const results: string[] = []
  for (const message of request.messages) {
    if (!Array.isArray(message.content)) continue
    for (const block of message.content) {
      if (block.type === 'tool_use') uses.push(block.id)
      if (block.type === 'tool_result') results.push(block.tool_use_id)
    }
  }
  assert.deepEqual(uses.sort(), results.sort(), '每个 tool_use 必须有配对 tool_result（否则 API 400）')
})

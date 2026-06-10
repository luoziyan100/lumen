import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { openDatabase } from '../../src/storage/db.ts'
import { TaskStore } from '../../src/storage/task-store.ts'
import { AgentRuntime } from '../../src/runtime/agent-runtime.ts'
import { ENV_TOOLS } from '../../src/tools/env/fs-tools.ts'
import { buildRoles } from '../../src/agents/roles.ts'
import { ScriptedModel, assistantToolCall, assistantReply, fixedTool } from '../helpers/scripted-model.ts'

async function makeEnv(t: TestContext) {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-rt-'))
  const db = openDatabase(path.join(base, 'lumen.sqlite'))
  t.after(() => {
    db.close()
    return rm(base, { recursive: true, force: true })
  })
  return { base, store: new TaskStore(db) }
}

test('runtime：submit → 跑完 → 任务 done，事件落库', async (t) => {
  const { base, store } = await makeEnv(t)
  const model = new ScriptedModel([
    assistantToolCall('w', 'write_file', { path: 'notes/n.md', content: '结论 A' }),
    assistantReply('已写入并完成'),
  ])
  const runtime = new AgentRuntime({
    store,
    model,
    sessionDir: path.join(base, 'sessions'),
    workspacesDir: path.join(base, 'workspaces'),
    mainTools: ENV_TOOLS,
  })

  const taskId = runtime.submit({ projectId: 'p', userText: '写个笔记' })
  await runtime.waitFor(taskId)

  assert.equal(store.getTask(taskId)?.status, 'done')
  const kinds = store.listEvents(taskId).map((e) => e.kind)
  assert.ok(kinds.includes('model_step') && kinds.includes('tool_result') && kinds.includes('reply'))
  const written = await readFile(path.join(base, 'workspaces', 'p', 'notes', 'n.md'), 'utf8')
  assert.equal(written, '结论 A')
})

test('runtime + roles：主 agent spawn searcher worker（受限工具），worker 写文件并回报', async (t) => {
  const { base, store } = await makeEnv(t)
  const mainModel = new ScriptedModel([
    assistantToolCall('s', 'spawn', { role: 'searcher', scope: '扫今天', prompt: '搜并记笔记' }),
    assistantReply('已综合 worker 结果'),
  ])
  const workerModel = new ScriptedModel([
    assistantToolCall('w', 'write_file', { path: 'notes/found.md', content: '命中 3 篇' }),
    assistantReply('Scope: 扫今天\n命中: 3 篇\n备注: 已写入 notes/found.md'),
  ])
  const roles = buildRoles(ENV_TOOLS, { model: workerModel })

  const runtime = new AgentRuntime({
    store,
    model: mainModel,
    sessionDir: path.join(base, 'sessions'),
    workspacesDir: path.join(base, 'workspaces'),
    mainTools: ENV_TOOLS,
    roles,
  })

  const taskId = runtime.submit({ projectId: 'p', userText: '今天有什么' })
  await runtime.waitFor(taskId)

  assert.equal(store.getTask(taskId)?.status, 'done')
  const kinds = store.listEvents(taskId).map((e) => e.kind)
  assert.ok(kinds.includes('spawn'), '应记录 spawn 事件')
  const written = await readFile(path.join(base, 'workspaces', 'p', 'notes', 'found.md'), 'utf8')
  assert.equal(written, '命中 3 篇')
  // 主 agent 第二次调用只看到 worker 压缩回报，看不到 worker 内部 write_file 细节
  const mainSecond = mainModel.calls[1].find((m) => m.role === 'tool_result' && m.toolCallId === 's')
  assert.match(mainSecond?.content ?? '', /命中: 3 篇/)
})

test('runtime 默认上下文折叠经真实循环生效：老的超长 tool_result 在后续模型调用里被折叠', async (t) => {
  const { base, store } = await makeEnv(t)
  const model = new ScriptedModel([
    assistantToolCall('t1', 'big', {}),
    assistantToolCall('t2', 'big', {}),
    assistantReply('完成'),
  ])
  const runtime = new AgentRuntime({
    store,
    model,
    sessionDir: path.join(base, 'sessions'),
    workspacesDir: path.join(base, 'workspaces'),
    mainTools: [fixedTool('big', 'B'.repeat(50))],
    contextFold: { maxToolResultChars: 10, keepRecentToolResults: 1 },
  })

  const taskId = runtime.submit({ projectId: 'p', userText: '干活' })
  await runtime.waitFor(taskId)

  assert.equal(store.getTask(taskId)?.status, 'done')
  // 第三次模型调用：t1 已老化 → 折叠；t2 是最近 1 条 → 原文可见
  const third = model.calls[2]
  const t1 = third.find((m) => m.toolCallId === 't1')
  const t2 = third.find((m) => m.toolCallId === 't2')
  assert.match(t1?.content ?? '', /collapsed/, '老 tool_result 应被折叠')
  assert.equal(t2?.content, 'B'.repeat(50), '最近一条必须原文可见')
  // 折叠只影响模型视图：落库事件与线程仍是原文
  const events = store.listEvents(taskId).filter((e) => e.kind === 'tool_result')
  assert.ok(events.every((e) => (JSON.parse(e.payload_json) as { llmContent: string }).llmContent === 'B'.repeat(50)))
})

test('worker 受限工具：searcher 角色不包含 edit_file', () => {
  const roles = buildRoles([...ENV_TOOLS, fixedTool('search_papers', '{}')])
  const searcherToolNames = roles.searcher.tools.map((ttt) => ttt.spec.name)
  assert.ok(searcherToolNames.includes('search_papers'))
  assert.ok(!searcherToolNames.includes('edit_file'), 'searcher 不应拿到 edit_file')
})

test('预算耗尽 ≠ done：maxSteps 用完 → 任务 interrupted（可 resume），不伪装成完成', async (t) => {
  const { base, store } = await makeEnv(t)
  const model = new ScriptedModel([
    assistantToolCall('t1', 'note', {}),
    assistantReply('不该到这里'),
  ])
  const runtime = new AgentRuntime({
    store,
    model,
    sessionDir: path.join(base, 'sessions'),
    workspacesDir: path.join(base, 'workspaces'),
    mainTools: [fixedTool('note', 'ok')],
    budget: { maxSteps: 1 },
  })
  const taskId = runtime.submit({ projectId: 'p', userText: '长任务' })
  await runtime.waitFor(taskId)

  const task = store.getTask(taskId)
  assert.equal(task?.status, 'interrupted')
  assert.match(task?.last_error ?? '', /预算耗尽/)
})

test('sweepInterrupted：服务重启后，遗留 running 的任务被标记为 interrupted', async (t) => {
  const { base, store } = await makeEnv(t)
  const orphan = store.createTask('p', '上个进程死前在跑')
  store.updateTaskStatus(orphan.id, 'running')

  const runtime = new AgentRuntime({
    store,
    model: new ScriptedModel([]),
    sessionDir: path.join(base, 'sessions'),
    workspacesDir: path.join(base, 'workspaces'),
    mainTools: [],
  })
  assert.equal(runtime.sweepInterrupted(), 1)
  assert.equal(store.getTask(orphan.id)?.status, 'interrupted')
  // 再 sweep 一次应是幂等的（interrupted 不再是 running）
  assert.equal(runtime.sweepInterrupted(), 0)
})

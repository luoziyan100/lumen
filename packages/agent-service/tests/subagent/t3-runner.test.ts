/**
 * [INPUT]: ChildRunner + coordinator + ScriptedModel + FsWorkspace
 * [OUTPUT]: T3 集成 —— spawn → runAgent → complete / live 子步折父账 / kill 已烧入账 / 飞行中 spawn 准入
 */
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { openDatabase } from '../../src/storage/db.ts'
import { TaskStore } from '../../src/storage/task-store.ts'
import { computeBudgetUsage, mergeBudget } from '../../src/storage/budget.ts'
import { SubagentStore } from '../../src/subagent/store.ts'
import { SubagentCoordinator } from '../../src/subagent/coordinator.ts'
import { ChildRunner } from '../../src/subagent/runner.ts'
import { SUBAGENT_ERROR, type SubagentConfig } from '../../src/subagent/types.ts'
import { ENV_TOOLS } from '../../src/tools/env/fs/index.ts'
import { FsWorkspace } from '../../src/workspace/fs-workspace.ts'
import {
  ScriptedModel,
  assistantToolCall,
  assistantReply,
} from '../helpers/scripted-model.ts'
import type { AgentEvent } from '../../src/core/types.ts'

async function harness(t: TestContext, cfg: Partial<SubagentConfig> = {}) {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-sub-t3-'))
  const db = openDatabase(path.join(base, 'lumen.sqlite'))
  t.after(() => {
    db.close()
    return rm(base, { recursive: true, force: true })
  })
  const taskStore = new TaskStore(db)
  const subStore = new SubagentStore(db)
  const coord = new SubagentCoordinator(subStore, taskStore, {
    max_depth: 2,
    max_concurrent_per_task: 8,
    max_concurrent_global: 16,
    foreground_budget_ms: 200,
    ...cfg,
  })
  const events: AgentEvent[] = []
  return { base, taskStore, subStore, coord, events }
}

async function waitUntil(pred: () => boolean, ms = 800): Promise<void> {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (pred()) return
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('waitUntil timeout')
}

function makeRunner(
  h: Awaited<ReturnType<typeof harness>>,
  model: ScriptedModel,
  projectId = 'p',
) {
  const sessionRoots = new Map<string, string>()
  return new ChildRunner({
    coordinator: h.coord,
    model,
    allTools: ENV_TOOLS,
    makeWorkspace: async (parentTaskId, cwdRoot) => {
      let root = sessionRoots.get(parentTaskId)
      if (!root) {
        root = path.join(h.base, 'workspaces', projectId, 'sessions', parentTaskId)
        await mkdir(root, { recursive: true })
        sessionRoots.set(parentTaskId, root)
      }
      if (cwdRoot) {
        const stripe = path.join(root, cwdRoot)
        await mkdir(stripe, { recursive: true })
        return new FsWorkspace({ root: stripe })
      }
      return new FsWorkspace({ root })
    },
    emit: (parentTaskId, event) => {
      h.events.push(event)
      h.taskStore.appendEvent(
        parentTaskId,
        event.kind as Parameters<TaskStore['appendEvent']>[1],
        event.payload,
        event.agentRole,
      )
    },
  })
}

test('T3: start explore → runAgent 写文件 → complete + getOutput', async (t) => {
  const h = await harness(t)
  const model = new ScriptedModel([
    assistantToolCall('w', 'write_file', { path: 'notes/hit.md', content: '3 papers' }),
    assistantReply('Scope: test\n命中: 3\n备注: notes/hit.md'),
  ])
  const runner = makeRunner(h, model)
  const task = h.taskStore.createTask('p', 'goal')
  const turn = h.taskStore.beginTurn(task.id)

  const start = await runner.start({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'searcher',
    description: '搜并记',
    scope: 'test',
    prompt: '找论文并写笔记',
    background: true,
  })
  assert.equal(start.success, true, start.error)
  assert.ok(start.subagent_id)
  assert.ok(start.handle)
  await start.handle!.done

  const rec = h.coord.get(start.subagent_id!)!
  assert.equal(rec.status, 'done')
  const out = h.coord.getOutput(start.subagent_id!)!
  assert.equal(out.status, 'done')
  assert.match(out.output, /命中: 3/)
  assert.ok(out.tool_calls >= 1)
  assert.ok(out.turns >= 1)
  // searcher 写型 → workers/<id>/ 条带
  assert.ok(rec.cwd_root?.startsWith('workers/'))
  const written = await readFile(
    path.join(h.base, 'workspaces', 'p', 'sessions', task.id, rec.cwd_root!, 'notes', 'hit.md'),
    'utf8',
  )
  assert.equal(written, '3 papers')
  // child turn ≠ root
  const turnStarts = h.taskStore.listEvents(task.id).filter((e) => e.kind === 'turn_start')
  const childTurn = turnStarts.find((e) => JSON.parse(e.payload_json).scope === 'subagent')
  assert.ok(childTurn)
  assert.notEqual(JSON.parse(childTurn!.payload_json).turn_id, turn)
})

test('T3: runAgent complete 后子 usage 进父 budget', async (t) => {
  const h = await harness(t)
  const model = new ScriptedModel([
    {
      message: { role: 'assistant', content: 'Scope 内 3 篇' },
      toolCalls: [],
      usage: { promptTokens: 80, completionTokens: 20 },
    },
  ])
  const runner = makeRunner(h, model)
  const task = h.taskStore.createTask('p', 'goal')
  const turn = h.taskStore.beginTurn(task.id)
  const before = computeBudgetUsage(mergeBudget(), h.taskStore.listEvents(task.id))
  assert.equal(before.promptTokens, undefined)

  const start = await runner.start({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'explore',
    description: '只读探查',
    scope: 'test',
    prompt: '列相关论文',
    background: true,
  })
  assert.equal(start.success, true, start.error)
  await start.handle!.done

  const out = h.coord.getOutput(start.subagent_id!)!
  assert.equal(out.status, 'done')
  assert.equal(out.usage.prompt_tokens, 80)
  assert.equal(out.usage.completion_tokens, 20)
  assert.equal(out.usage_applied_to_parent, true)

  const after = computeBudgetUsage(mergeBudget(), h.taskStore.listEvents(task.id))
  assert.equal(after.promptTokens, 80)
  assert.equal(after.completionTokens, 20)
  assert.ok((after.promptTokens ?? 0) > (before.promptTokens ?? 0))
})

test('T3: kill 中止 running child → aborted;已烧 token 入父账', async (t) => {
  const h = await harness(t)
  // 永不结束：一直 tool call 同一工具会循环；用超长 steps 不如挂死在慢工具
  let release!: () => void
  const gate = new Promise<void>((r) => {
    release = r
  })
  const hangTool = {
    spec: {
      name: 'read_file',
      description: 'hang',
      parameters: { type: 'object', properties: { path: { type: 'string' } } },
    },
    run: async () => {
      await gate
      return { llmContent: 'late' }
    },
  }
  const model = new ScriptedModel([
    {
      ...assistantToolCall('h', 'read_file', { path: 'x.md' }),
      usage: { promptTokens: 80, completionTokens: 20 },
    },
    assistantReply('should not'),
  ])
  // hangTool 必须覆盖同名工具（Map 后者胜）
  const runner = new ChildRunner({
    coordinator: h.coord,
    model,
    allTools: [...ENV_TOOLS.filter((t) => t.spec.name !== 'read_file'), hangTool],
    makeWorkspace: async () => {
      const root = path.join(h.base, 'ws')
      await mkdir(root, { recursive: true })
      return new FsWorkspace({ root })
    },
    emit: (parentTaskId, event) => {
      h.taskStore.appendEvent(
        parentTaskId,
        event.kind as Parameters<TaskStore['appendEvent']>[1],
        event.payload,
        event.agentRole,
      )
    },
  })
  const task = h.taskStore.createTask('p', 'g')
  const turn = h.taskStore.beginTurn(task.id)
  const start = await runner.start({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'explore',
    description: 'hang',
    prompt: 'read',
  })
  assert.ok(start.success)
  await waitUntil(() => h.taskStore.listEvents(task.id).some((e) => e.kind === 'model_step'))
  assert.equal(h.coord.get(start.subagent_id!)?.status, 'running')
  h.coord.kill(start.subagent_id!, 'test-kill')
  assert.equal(h.coord.get(start.subagent_id!)?.status, 'aborted')
  release()
  await start.handle!.done
  // complete 幂等：终态保持 aborted
  assert.equal(h.coord.get(start.subagent_id!)?.status, 'aborted')
  const parent = computeBudgetUsage(mergeBudget(), h.taskStore.listEvents(task.id))
  assert.equal(parent.promptTokens, 80)
  assert.equal(parent.completionTokens, 20)
  assert.equal(parent.steps, 0)
  assert.equal(h.coord.getOutput(start.subagent_id!)?.usage_applied_to_parent, true)
})

test('T3: 飞行中子代已烧 token 对 spawn 准入可见', async (t) => {
  const h = await harness(t, { parent_budget: mergeBudget({ maxPromptTokens: 80 }) })
  let release!: () => void
  const gate = new Promise<void>((r) => {
    release = r
  })
  const hangTool = {
    spec: {
      name: 'read_file',
      description: 'hang',
      parameters: { type: 'object', properties: { path: { type: 'string' } } },
    },
    run: async () => {
      await gate
      return { llmContent: 'late' }
    },
  }
  const model = new ScriptedModel([
    {
      ...assistantToolCall('h', 'read_file', { path: 'x.md' }),
      usage: { promptTokens: 80, completionTokens: 20 },
    },
    assistantReply('should not'),
  ])
  const runner = new ChildRunner({
    coordinator: h.coord,
    model,
    allTools: [...ENV_TOOLS.filter((t) => t.spec.name !== 'read_file'), hangTool],
    makeWorkspace: async () => {
      const root = path.join(h.base, 'ws')
      await mkdir(root, { recursive: true })
      return new FsWorkspace({ root })
    },
    emit: (parentTaskId, event) => {
      h.taskStore.appendEvent(
        parentTaskId,
        event.kind as Parameters<TaskStore['appendEvent']>[1],
        event.payload,
        event.agentRole,
      )
    },
  })
  const task = h.taskStore.createTask('p', 'g')
  const turn = h.taskStore.beginTurn(task.id)
  const start = await runner.start({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'explore',
    description: 'hang',
    prompt: 'read',
  })
  assert.ok(start.success)
  await waitUntil(() => h.taskStore.listEvents(task.id).some((e) => e.kind === 'model_step'))
  const start2 = await runner.start({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'explore',
    description: 'second',
    prompt: 'also',
  })
  assert.equal(start2.success, false)
  assert.equal(start2.error_code, SUBAGENT_ERROR.PARENT_BUDGET)
  h.coord.kill(start.subagent_id!, 'cleanup')
  release()
  await start.handle!.done
})

test('T3: unknown type 拒绝', async (t) => {
  const h = await harness(t)
  const model = new ScriptedModel([assistantReply('x')])
  const runner = makeRunner(h, model)
  const task = h.taskStore.createTask('p', 'g')
  const turn = h.taskStore.beginTurn(task.id)
  const start = await runner.start({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'no-such-role',
    description: 'x',
    prompt: 'x',
  })
  assert.equal(start.success, false)
  assert.equal(start.error_code, 'subagent_type_unknown')
})

test('T3: wait 等到 runner 完成', async (t) => {
  const h = await harness(t)
  const model = new ScriptedModel([
    assistantReply('all good'),
  ])
  const runner = makeRunner(h, model)
  const task = h.taskStore.createTask('p', 'g')
  const turn = h.taskStore.beginTurn(task.id)
  const start = await runner.start({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'verifier',
    description: 'v',
    prompt: 'check',
  })
  const wr = await h.coord.wait([start.subagent_id!], { timeoutMs: 2000 })
  assert.equal(wr.outcome, 'done')
  assert.equal(wr.results[0]?.output, 'all good')
  await start.handle!.done
})

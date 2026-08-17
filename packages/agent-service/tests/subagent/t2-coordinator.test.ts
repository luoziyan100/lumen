/**
 * [INPUT]: coordinator wait/getOutput/demote/cancel + nested turn CT1–CT4
 * [OUTPUT]: T2 契约单测(含 live 子步折父账、飞行中 spawn 准入)
 */
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { openDatabase } from '../../src/storage/db.ts'
import { TaskStore } from '../../src/storage/task-store.ts'
import { computeBudgetUsage, mergeBudget } from '../../src/storage/budget.ts'
import { SubagentStore } from '../../src/subagent/store.ts'
import { SubagentCoordinator } from '../../src/subagent/coordinator.ts'
import {
  SUBAGENT_ERROR,
  assertSpawnCwdLegal,
  defaultWriteStripeCwd,
  resumeAllowed,
  type SubagentConfig,
} from '../../src/subagent/types.ts'

async function harness(t: TestContext, cfg: Partial<SubagentConfig> = {}) {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-sub-t2-'))
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
    foreground_budget_ms: 80,
    completion_output_cap: 32,
    ...cfg,
  })
  return { db, taskStore, subStore, coord }
}

// ── CT1–CT4 嵌套 turn ──────────────────────────────────────────

test('CT1: grandchild.parent_turn_id === child.active_turn_id ≠ root', async (t) => {
  const { coord, taskStore } = await harness(t)
  const task = taskStore.createTask('p', 'g')
  const rootTurn = taskStore.beginTurn(task.id)
  const a = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: rootTurn,
    subagent_type: 'general-purpose',
    description: 'A',
  })
  assert.ok(a.record)
  coord.markRunning(a.record!.id)
  const child = coord.get(a.record!.id)!
  assert.ok(child.active_turn_id)
  assert.notEqual(child.active_turn_id, rootTurn)

  const b = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: child.active_turn_id!,
    parent_subagent_id: child.id,
    subagent_type: 'explore',
    description: 'B',
    depth: 2,
  })
  assert.ok(b.ok, b.error)
  assert.equal(b.record!.parent_turn_id, child.active_turn_id)
  assert.notEqual(b.record!.parent_turn_id, rootTurn)
  assert.equal(b.record!.parent_subagent_id, child.id)
})

test('CT2: kill(A) 级联 aborted 未完成孙 B', async (t) => {
  const { coord, taskStore } = await harness(t)
  const task = taskStore.createTask('p', 'g')
  const rootTurn = taskStore.beginTurn(task.id)
  const a = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: rootTurn,
    subagent_type: 'general-purpose',
    description: 'A',
  })
  coord.markRunning(a.record!.id)
  const childTurn = coord.get(a.record!.id)!.active_turn_id!
  const b = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: childTurn,
    parent_subagent_id: a.record!.id,
    subagent_type: 'explore',
    description: 'B',
    depth: 2,
  })
  coord.markRunning(b.record!.id)
  coord.attachLive(b.record!.id, new AbortController())

  coord.kill(a.record!.id, 'CT2')
  assert.equal(coord.get(a.record!.id)?.status, 'aborted')
  assert.equal(coord.get(b.record!.id)?.status, 'aborted')
})

test('CT3: cancelTurn(root) 杀 A 并级联 B；不按 root turn 误绑孙', async (t) => {
  const { coord, taskStore } = await harness(t)
  const task = taskStore.createTask('p', 'g')
  const rootTurn = taskStore.beginTurn(task.id)
  const a = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: rootTurn,
    subagent_type: 'general-purpose',
    description: 'A',
  })
  coord.markRunning(a.record!.id)
  const childTurn = coord.get(a.record!.id)!.active_turn_id!
  const b = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: childTurn,
    parent_subagent_id: a.record!.id,
    subagent_type: 'explore',
    description: 'B',
    depth: 2,
  })
  // 另一 turn 的旁路子，不应被 rootTurn cancel 杀掉
  const otherTurn = `turn-${crypto.randomUUID()}`
  const c = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: otherTurn,
    subagent_type: 'explore',
    description: 'C other turn',
  })

  const n = coord.cancelTurn(task.id, rootTurn)
  assert.ok(n >= 1)
  assert.equal(coord.get(a.record!.id)?.status, 'aborted')
  assert.equal(coord.get(b.record!.id)?.status, 'aborted', '级联自 kill(A)')
  assert.equal(coord.get(c.record!.id)?.status, 'queued', 'other turn 存活')
})

test('CT4: child.turnId 禁止等于 root.turnId', async (t) => {
  const { coord, taskStore } = await harness(t)
  const task = taskStore.createTask('p', 'g')
  const rootTurn = taskStore.beginTurn(task.id)
  const a = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: rootTurn,
    subagent_type: 'explore',
    description: 'A',
  })
  coord.markRunning(a.record!.id)
  const child = coord.get(a.record!.id)!
  assert.ok(child.active_turn_id)
  assert.notEqual(child.active_turn_id, rootTurn)
  assert.match(child.active_turn_id!, /^turn-/)
})

// ── getOutput / usage 落盘 ─────────────────────────────────────

test('getOutput: complete 后含 usage/resume 矩阵', async (t) => {
  const { coord, taskStore } = await harness(t)
  const task = taskStore.createTask('p', 'g')
  const turn = taskStore.beginTurn(task.id)
  const r = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'explore',
    description: 'out',
  })
  coord.markRunning(r.record!.id)
  taskStore.appendEvent(
    task.id,
    'model_step',
    { subagent_id: r.record!.id, usage: { promptTokens: 100, completionTokens: 50 } },
    'explore',
  )
  coord.complete(r.record!.id, 'done', {
    completion_summary: 'found 3 papers',
    tool_calls: 4,
    turns: 2,
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    cwd_root: 'workers/x',
  })
  const out = coord.getOutput(r.record!.id)!
  assert.equal(out.status, 'done')
  assert.equal(out.output, 'found 3 papers')
  assert.equal(out.tool_calls, 4)
  assert.equal(out.turns, 2)
  assert.equal(out.usage.total_tokens, 150)
  assert.equal(out.usage_applied_to_parent, true)
  const parent = computeBudgetUsage(mergeBudget(), taskStore.listEvents(task.id))
  assert.equal(parent.promptTokens, 100)
  assert.equal(parent.completionTokens, 50)
  assert.equal(parent.steps, 0)
  assert.equal(out.resume_allowed, true)
  assert.ok(out.resume_hint.includes(r.record!.id))
  assert.equal(out.cwd_root, 'workers/x')
})

test('spawn 准入:飞行中子 live token 耗尽父 prompt 预算则拒', async (t) => {
  const { coord, taskStore } = await harness(t, {
    parent_budget: mergeBudget({ maxPromptTokens: 80 }),
  })
  const task = taskStore.createTask('p', 'g')
  const turn = taskStore.beginTurn(task.id)
  const a = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'explore',
    description: 'live',
  })
  coord.markRunning(a.record!.id)
  taskStore.appendEvent(
    task.id,
    'model_step',
    { subagent_id: a.record!.id, usage: { promptTokens: 80, completionTokens: 10 } },
    'explore',
  )
  const b = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'explore',
    description: 'second',
  })
  assert.equal(b.ok, false)
  assert.equal(b.error_code, SUBAGENT_ERROR.PARENT_BUDGET)
})

test('getOutput: 超 cap 截断', async (t) => {
  const { coord, taskStore } = await harness(t, { completion_output_cap: 10 })
  const task = taskStore.createTask('p', 'g')
  const turn = taskStore.beginTurn(task.id)
  const r = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'explore',
    description: 'big',
  })
  coord.complete(r.record!.id, 'done', {
    completion_summary: '0123456789ABCDEF',
  })
  const out = coord.getOutput(r.record!.id)!
  assert.equal(out.output.length, 10)
  assert.equal(out.truncated, true)
})

// ── wait / foreground demote ───────────────────────────────────

test('wait: complete 后 outcome=done', async (t) => {
  const { coord, taskStore } = await harness(t)
  const task = taskStore.createTask('p', 'g')
  const turn = taskStore.beginTurn(task.id)
  const r = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'explore',
    description: 'w',
  })
  coord.markRunning(r.record!.id)
  const ac = new AbortController()
  coord.attachLive(r.record!.id, ac)

  const waitP = coord.wait([r.record!.id], { timeoutMs: 2000 })
  setTimeout(() => {
    coord.complete(r.record!.id, 'done', { completion_summary: 'ok' })
  }, 30)
  const wr = await waitP
  assert.equal(wr.outcome, 'done')
  assert.equal(wr.pending_ids.length, 0)
  assert.equal(wr.results[0]?.output, 'ok')
})

test('wait: timeout 不 demote → timeout + pending', async (t) => {
  const { coord, taskStore } = await harness(t)
  const task = taskStore.createTask('p', 'g')
  const turn = taskStore.beginTurn(task.id)
  const r = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'explore',
    description: 'slow',
  })
  coord.markRunning(r.record!.id)
  coord.attachLive(r.record!.id, new AbortController())
  const wr = await coord.wait([r.record!.id], { timeoutMs: 50, demoteOnTimeout: false })
  assert.equal(wr.outcome, 'timeout')
  assert.deepEqual(wr.pending_ids, [r.record!.id])
  assert.equal(coord.get(r.record!.id)?.status, 'running')
})

test('wait: foreground 超时 demote，子仍 running', async (t) => {
  const { coord, taskStore } = await harness(t)
  const task = taskStore.createTask('p', 'g')
  const turn = taskStore.beginTurn(task.id)
  const r = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'explore',
    description: 'fg',
  })
  coord.markRunning(r.record!.id)
  coord.attachLive(r.record!.id, new AbortController())
  const wr = await coord.wait([r.record!.id], { timeoutMs: 40, demoteOnTimeout: true })
  assert.equal(wr.outcome, 'demoted')
  assert.equal(coord.get(r.record!.id)?.status, 'running')
  assert.equal(coord.isDemoted(r.record!.id), true)
  const demoteEv = taskStore.listEvents(task.id).filter((e) => e.kind === 'subagent_demoted')
  assert.equal(demoteEv.length, 1)
  // 清理
  coord.complete(r.record!.id, 'done', { completion_summary: 'later' })
})

test('armForegroundBudget 自动 demote', async (t) => {
  const { coord, taskStore } = await harness(t, { foreground_budget_ms: 30 })
  const task = taskStore.createTask('p', 'g')
  const turn = taskStore.beginTurn(task.id)
  const r = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'explore',
    description: 'arm',
  })
  coord.markRunning(r.record!.id)
  coord.attachLive(r.record!.id, new AbortController())
  coord.armForegroundBudget(r.record!.id)
  await new Promise((res) => setTimeout(res, 80))
  assert.equal(coord.isDemoted(r.record!.id), true)
  assert.equal(coord.get(r.record!.id)?.status, 'running')
  coord.complete(r.record!.id, 'done')
})

// ── cancelTask / worktree cwd / write stripe ───────────────────

test('cancelTask 杀全部并 block 新 spawn', async (t) => {
  const { coord, taskStore } = await harness(t)
  const task = taskStore.createTask('p', 'g')
  const turn = taskStore.beginTurn(task.id)
  const a = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'explore',
    description: 'a',
  })
  const b = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'explore',
    description: 'b',
  })
  coord.cancelTask(task.id)
  assert.equal(coord.get(a.record!.id)?.status, 'aborted')
  assert.equal(coord.get(b.record!.id)?.status, 'aborted')
  const c = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'explore',
    description: 'blocked',
  })
  assert.equal(c.ok, false)
  assert.equal(c.error_code, SUBAGENT_ERROR.SPAWN_BLOCKED)
})

test('worktree + model cwd → 拒绝', async (t) => {
  const { coord, taskStore } = await harness(t)
  const task = taskStore.createTask('p', 'g')
  const turn = taskStore.beginTurn(task.id)
  const r = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'general-purpose',
    description: 'wt',
    isolation: 'worktree',
    model_cwd: 'scratch',
  })
  assert.equal(r.ok, false)
  assert.equal(r.error_code, SUBAGENT_ERROR.CWD_FORBIDDEN_WITH_WORKTREE)
  assert.equal(assertSpawnCwdLegal('worktree', 'x').ok, false)
  assert.equal(assertSpawnCwdLegal('none', 'x').ok, true)
})

test('none + write_capable 自动 workers/<id>/ 条带', async (t) => {
  const { coord, taskStore } = await harness(t)
  const task = taskStore.createTask('p', 'g')
  const turn = taskStore.beginTurn(task.id)
  const r = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'general-purpose',
    description: 'write',
    write_capable: true,
  })
  assert.ok(r.record)
  assert.equal(r.record!.cwd_root, defaultWriteStripeCwd(r.record!.id))
})

test('interrupted query + resume_allowed', async (t) => {
  const { coord, taskStore } = await harness(t)
  const task = taskStore.createTask('p', 'g')
  const turn = taskStore.beginTurn(task.id)
  const r = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'explore',
    description: 'restart',
  })
  coord.markRunning(r.record!.id)
  coord.sweepInterrupted()
  const out = coord.getOutput(r.record!.id)!
  assert.equal(out.status, 'interrupted')
  assert.equal(out.resume_allowed, true)
  assert.equal(resumeAllowed('interrupted'), true)
  assert.ok(out.output.includes('service_restart') || out.error === 'service_restart')
})

/**
 * [INPUT]: subagent T0 store/coordinator/reminder + TaskStore turn
 * [OUTPUT]: R1.3 契约单测
 */
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { openDatabase } from '../../src/storage/db.ts'
import { TaskStore } from '../../src/storage/task-store.ts'
import { SubagentStore } from '../../src/subagent/store.ts'
import { SubagentCoordinator } from '../../src/subagent/coordinator.ts'
import {
  meetCapability,
  resumeAllowed,
  SUBAGENT_ERROR,
} from '../../src/subagent/types.ts'
import {
  rehydrateUnconsumedReminders,
  consumeCompletionReminder,
} from '../../src/subagent/reminder.ts'

async function harness(t: TestContext) {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-sub-'))
  const db = openDatabase(path.join(base, 'lumen.sqlite'))
  t.after(() => {
    db.close()
    return rm(base, { recursive: true, force: true })
  })
  const taskStore = new TaskStore(db)
  const subStore = new SubagentStore(db)
  const coord = new SubagentCoordinator(subStore, taskStore, {
    max_concurrent_per_task: 2,
    max_concurrent_global: 3,
  })
  return { db, taskStore, subStore, coord }
}

test('meetCapability: RW ∩ EX = RO', () => {
  assert.equal(meetCapability('read-write', 'execute'), 'read-only')
  assert.equal(meetCapability('execute', 'read-write'), 'read-only')
  assert.equal(meetCapability('all', 'read-write'), 'read-write')
  assert.equal(meetCapability('read-only', 'execute'), 'read-only')
})

test('resumeAllowed 矩阵', () => {
  assert.equal(resumeAllowed('done'), true)
  assert.equal(resumeAllowed('interrupted'), true)
  assert.equal(resumeAllowed('exhausted'), true)
  assert.equal(resumeAllowed('aborted'), false)
  assert.equal(resumeAllowed('error'), false)
  assert.equal(resumeAllowed('failed'), false)
  assert.equal(resumeAllowed('queued'), false)
  assert.equal(resumeAllowed('running'), false)
})

test('beginTurn / endTurn 写事件并清空 active_turn_id', async (t) => {
  const { taskStore } = await harness(t)
  const task = taskStore.createTask('p', 'g')
  const turnId = taskStore.beginTurn(task.id)
  assert.equal(taskStore.getActiveTurnId(task.id), turnId)
  const kinds1 = taskStore.listEvents(task.id).map((e) => e.kind)
  assert.ok(kinds1.includes('turn_start'))
  taskStore.endTurn(task.id, 'done')
  assert.equal(taskStore.getActiveTurnId(task.id), null)
  const ends = taskStore.listEvents(task.id).filter((e) => e.kind === 'turn_end')
  assert.equal(ends.length, 1)
  assert.equal(JSON.parse(ends[0]!.payload_json).turn_id, turnId)
})

test('主 task sweep 关 turn', async (t) => {
  const { taskStore } = await harness(t)
  const task = taskStore.createTask('p', 'g')
  const turnId = taskStore.beginTurn(task.id)
  taskStore.updateTaskStatus(task.id, 'running')
  // 模拟 runtime.sweep 关 turn
  if (taskStore.getActiveTurnId(task.id)) {
    taskStore.endTurn(task.id, 'interrupted', { reason: 'service_restart' })
  }
  taskStore.updateTaskStatus(task.id, 'interrupted', '服务中断')
  assert.equal(taskStore.getActiveTurnId(task.id), null)
  const te = taskStore.listEvents(task.id).filter((e) => e.kind === 'turn_end')
  assert.ok(te.some((e) => JSON.parse(e.payload_json).turn_id === turnId))
})

test('registerSpawn + 并发拒绝', async (t) => {
  const { coord, taskStore } = await harness(t)
  const task = taskStore.createTask('p', 'g')
  const turn = taskStore.beginTurn(task.id)
  const a = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'explore',
    description: 'one',
  })
  const b = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'explore',
    description: 'two',
  })
  assert.equal(a.ok, true)
  assert.equal(b.ok, true)
  const c = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'explore',
    description: 'three',
  })
  assert.equal(c.ok, false)
  assert.equal(c.error_code, SUBAGENT_ERROR.CONCURRENCY_LIMIT)
})

test('queued kill → aborted；running kill 级联孙', async (t) => {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-sub-'))
  const db = openDatabase(path.join(base, 'lumen.sqlite'))
  t.after(() => {
    db.close()
    return rm(base, { recursive: true, force: true })
  })
  const taskStore = new TaskStore(db)
  const subStore = new SubagentStore(db)
  // max_depth 2 以允许孙
  const coord = new SubagentCoordinator(subStore, taskStore, {
    max_depth: 2,
    max_concurrent_per_task: 8,
    max_concurrent_global: 16,
  })
  const task = taskStore.createTask('p', 'g')
  const rootTurn = taskStore.beginTurn(task.id)
  const a = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: rootTurn,
    subagent_type: 'general-purpose',
    description: 'parent child',
  })
  assert.ok(a.record)
  coord.markRunning(a.record!.id)
  const child = coord.get(a.record!.id)!
  assert.ok(child.active_turn_id)
  assert.notEqual(child.active_turn_id, rootTurn)

  // 孙：parent_turn = child turn
  const g = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: child.active_turn_id!,
    parent_subagent_id: child.id,
    subagent_type: 'explore',
    description: 'grandchild',
    depth: 2,
  })
  assert.ok(g.ok, g.error)
  assert.ok(g.record)
  assert.equal(g.record!.parent_turn_id, child.active_turn_id)
  assert.notEqual(g.record!.parent_turn_id, rootTurn)

  // kill A 级联 B
  coord.kill(child.id, 'test')
  assert.equal(coord.get(child.id)?.status, 'aborted')
  assert.equal(coord.get(g.record!.id)?.status, 'aborted')
})

test('queued 重启 sweep → interrupted', async (t) => {
  const { coord, taskStore, subStore } = await harness(t)
  const task = taskStore.createTask('p', 'g')
  const turn = taskStore.beginTurn(task.id)
  const r = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'explore',
    description: 'q',
  })
  assert.equal(r.record?.status, 'queued')
  const n = coord.sweepInterrupted()
  assert.ok(n >= 1)
  assert.equal(coord.get(r.record!.id)?.status, 'interrupted')
  assert.equal(resumeAllowed(coord.get(r.record!.id)!.status), true)
  void subStore
})

test('reminder: 表真源 rehydrate / consume', async (t) => {
  const { coord, taskStore, subStore } = await harness(t)
  const task = taskStore.createTask('p', 'g')
  const turn = taskStore.beginTurn(task.id)
  const r = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'explore',
    description: 'rem',
  })
  coord.complete(r.record!.id, 'done', { completion_summary: 'hello summary' })
  const reminders1 = taskStore.listEvents(task.id).filter((e) => e.kind === 'subagent_completion_reminder')
  assert.equal(reminders1.length, 1)

  // 未消费 rehydrate 再插一条
  const n = rehydrateUnconsumedReminders(subStore, taskStore, task.id)
  assert.equal(n, 1)
  const reminders2 = taskStore.listEvents(task.id).filter((e) => e.kind === 'subagent_completion_reminder')
  assert.equal(reminders2.length, 2)

  // 消费后不再 rehydrate
  consumeCompletionReminder(subStore, taskStore, r.record!.id, turn)
  assert.equal(subStore.get(r.record!.id)?.reminder_consumed, 1)
  const n2 = rehydrateUnconsumedReminders(subStore, taskStore, task.id)
  assert.equal(n2, 0)
})

test('cancelByParentTurn 只杀该 turn 的直接绑定', async (t) => {
  const { coord, taskStore } = await harness(t)
  const task = taskStore.createTask('p', 'g')
  const turn1 = taskStore.beginTurn(task.id)
  const a = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: turn1,
    subagent_type: 'explore',
    description: 't1',
  })
  // 模拟第二 turn 的子（不 end 第一 turn 仅换 id 写入）
  const turn2 = `turn-${crypto.randomUUID()}`
  const b = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: turn2,
    subagent_type: 'explore',
    description: 't2',
  })
  coord.cancelByParentTurn(task.id, turn1)
  assert.equal(coord.get(a.record!.id)?.status, 'aborted')
  assert.equal(coord.get(b.record!.id)?.status, 'queued')
})

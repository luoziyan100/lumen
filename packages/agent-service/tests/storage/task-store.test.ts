import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { openDatabase } from '../../src/storage/db.ts'
import { TaskStore } from '../../src/storage/task-store.ts'

async function makeStore(t: TestContext): Promise<TaskStore> {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-db-'))
  const db = openDatabase(path.join(base, 'lumen.sqlite'))
  t.after(() => {
    db.close()
    return rm(base, { recursive: true, force: true })
  })
  return new TaskStore(db)
}

test('createTask 落库并写入首个 status_change 事件', async (t) => {
  const store = await makeStore(t)
  const task = store.createTask('proj-1', '今天有什么论文')
  assert.equal(task.status, 'queued')
  const fetched = store.getTask(task.id)
  assert.equal(fetched?.goal, '今天有什么论文')
  const events = store.listEvents(task.id)
  assert.equal(events.length, 1)
  assert.equal(events[0].seq, 1)
  assert.equal(events[0].kind, 'status_change')
})

test('appendEvent 的 seq 在并发追加下单调自增', async (t) => {
  const store = await makeStore(t)
  const task = store.createTask('p', 'g')
  store.appendEvent(task.id, 'model_step', { content: 'a' })
  store.appendEvent(task.id, 'tool_call', { name: 'search' })
  store.appendEvent(task.id, 'tool_result', { id: 't1', llmContent: 'r' })
  const seqs = store.listEvents(task.id).map((e) => e.seq)
  assert.deepEqual(seqs, [1, 2, 3, 4])
})

test('listEvents afterSeq 只返回更新的事件', async (t) => {
  const store = await makeStore(t)
  const task = store.createTask('p', 'g')
  store.appendEvent(task.id, 'model_step', {})
  store.appendEvent(task.id, 'reply', {})
  const after = store.listEvents(task.id, 2)
  assert.equal(after.length, 1)
  assert.equal(after[0].seq, 3)
})

test('updateTaskStatus 写 finished_at 并记 status_change', async (t) => {
  const store = await makeStore(t)
  const task = store.createTask('p', 'g')
  store.updateTaskStatus(task.id, 'running')
  store.updateTaskStatus(task.id, 'done')
  const fresh = store.getTask(task.id)
  assert.equal(fresh?.status, 'done')
  assert.ok(fresh?.finished_at, 'done 应写 finished_at')
  const kinds = store.listEvents(task.id).map((e) => e.kind)
  assert.deepEqual(kinds, ['status_change', 'status_change', 'status_change'])
})

test('findInterrupted 只返回 running / interrupted', async (t) => {
  const store = await makeStore(t)
  const a = store.createTask('p', 'a')
  const b = store.createTask('p', 'b')
  const c = store.createTask('p', 'c')
  store.updateTaskStatus(a.id, 'running')
  store.updateTaskStatus(b.id, 'interrupted')
  store.updateTaskStatus(c.id, 'done')
  const ids = store.findInterrupted().map((t2) => t2.id).sort()
  assert.deepEqual(ids, [a.id, b.id].sort())
})

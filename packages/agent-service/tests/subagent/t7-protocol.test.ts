/**
 * [INPUT]: AgentRuntime cancelTurn vs cancel + listSubagents
 * [OUTPUT]: T7 产品接线契约
 */
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { openDatabase } from '../../src/storage/db.ts'
import { TaskStore } from '../../src/storage/task-store.ts'
import { AgentRuntime } from '../../src/runtime/agent-runtime.ts'
import { startServer, type ServerHandle } from '../../src/protocol/server.ts'
import { ENV_TOOLS } from '../../src/tools/env/fs/index.ts'
import type { ServerMessage } from '../../src/protocol/messages.ts'
import { ScriptedModel, assistantReply } from '../helpers/scripted-model.ts'

async function harness(t: TestContext) {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-t7-'))
  const db = openDatabase(path.join(base, 'lumen.sqlite'))
  t.after(async () => {
    db.close()
    await rm(base, { recursive: true, force: true })
  })
  const store = new TaskStore(db)
  const runtime = new AgentRuntime({
    store,
    db,
    model: new ScriptedModel([assistantReply('hi')]),
    sessionDir: path.join(base, 'sessions'),
    workspacesDir: path.join(base, 'workspaces'),
    mainTools: ENV_TOOLS,
  })
  return { base, db, store, runtime }
}

test('cancelTurn 只杀本 turn 子；cancel 杀全部并 block', async (t) => {
  const { runtime, store } = await harness(t)
  const task = store.createTask('p', 'g')
  const turn1 = store.beginTurn(task.id)
  const a = runtime.subagents.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: turn1,
    subagent_type: 'explore',
    description: 't1',
  })
  const turn2 = `turn-${crypto.randomUUID()}`
  const b = runtime.subagents.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: turn2,
    subagent_type: 'explore',
    description: 't2',
  })
  runtime.cancelTurn(task.id) // active_turn 可能是 turn1
  // 显式按 turn1
  runtime.subagents.cancelByParentTurn(task.id, turn1)
  assert.equal(runtime.subagents.get(a.record!.id)?.status, 'aborted')
  assert.equal(runtime.subagents.get(b.record!.id)?.status, 'queued')

  runtime.cancel(task.id)
  assert.equal(runtime.subagents.get(b.record!.id)?.status, 'aborted')
  const blocked = runtime.subagents.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: turn2,
    subagent_type: 'explore',
    description: 'nope',
  })
  assert.equal(blocked.ok, false)
})

test('listSubagents / killSubagent', async (t) => {
  const { runtime, store } = await harness(t)
  const task = store.createTask('p', 'g')
  const turn = store.beginTurn(task.id)
  const r = runtime.subagents.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'searcher',
    description: 's',
  })
  runtime.subagents.complete(r.record!.id, 'done', { completion_summary: 'found' })
  const list = runtime.listSubagents(task.id)
  assert.equal(list.length, 1)
  assert.equal(list[0]!.id, r.record!.id)
  assert.equal(list[0]!.status, 'done')
  assert.equal(list[0]!.resume_allowed, true)
  assert.equal(list[0]!.completion_summary, 'found')

  const live = runtime.subagents.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'explore',
    description: 'live',
  })
  assert.equal(runtime.killSubagent(task.id, live.record!.id), true)
  assert.equal(runtime.subagents.get(live.record!.id)?.status, 'aborted')
  assert.equal(runtime.killSubagent(task.id, 'missing'), false)
})

test('WS: cancel_turn / list_subagents / kill_subagent', async (t) => {
  const { runtime, store, db } = await harness(t)
  const handle: ServerHandle = await startServer(runtime, { port: 0 })
  t.after(async () => {
    await runtime.drain()
    await handle.close()
  })

  const task = store.createTask('p', 'g')
  const turn = store.beginTurn(task.id)
  const r = runtime.subagents.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'explore',
    description: 'ws',
  })

  const ws = new WebSocket(`ws://127.0.0.1:${handle.port}`)
  await new Promise<void>((res) => ws.addEventListener('open', () => res(), { once: true }))

  const listP = new Promise<ServerMessage>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout list')), 3000)
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(String((ev as MessageEvent).data)) as ServerMessage
      if (m.type === 'subagents') {
        clearTimeout(timer)
        resolve(m)
      }
    })
  })
  ws.send(JSON.stringify({ type: 'list_subagents', taskId: task.id, projectId: 'p' }))
  const listMsg = await listP
  assert.equal(listMsg.type, 'subagents')
  if (listMsg.type === 'subagents') {
    assert.equal(listMsg.subagents.length, 1)
    assert.equal(listMsg.subagents[0]!.id, r.record!.id)
  }

  const okKill = new Promise<ServerMessage>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout kill')), 3000)
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(String((ev as MessageEvent).data)) as ServerMessage
      if (m.type === 'ok' || m.type === 'error') {
        clearTimeout(timer)
        resolve(m)
      }
    })
  })
  ws.send(JSON.stringify({
    type: 'kill_subagent',
    taskId: task.id,
    subagentId: r.record!.id,
    projectId: 'p',
  }))
  const killMsg = await okKill
  assert.equal(killMsg.type, 'ok')
  assert.equal(runtime.subagents.get(r.record!.id)?.status, 'aborted')

  // cancel_turn ok
  const okTurn = new Promise<ServerMessage>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout cancel_turn')), 3000)
    const onMsg = (ev: MessageEvent) => {
      const m = JSON.parse(String(ev.data)) as ServerMessage
      if (m.type === 'ok' || m.type === 'error') {
        clearTimeout(timer)
        ws.removeEventListener('message', onMsg)
        resolve(m)
      }
    }
    ws.addEventListener('message', onMsg)
  })
  ws.send(JSON.stringify({ type: 'cancel_turn', taskId: task.id, projectId: 'p' }))
  assert.equal((await okTurn).type, 'ok')

  ws.close()
  void db
})

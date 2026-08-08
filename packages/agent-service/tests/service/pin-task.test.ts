/**
 * pin_task / unpin_task:写 pinned_at;list 钉档优先且钉内按钉时;不改 goal/title。
 */
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { createService, type Service } from '../../src/service.ts'
import type { ServerMessage } from '../../src/protocol/messages.ts'
import { ScriptedModel, assistantReply } from '../helpers/scripted-model.ts'

interface Rig { service: Service; port: number; sockets: WebSocket[] }
async function rig(t: TestContext): Promise<Rig> {
  const home = await mkdtemp(path.join(tmpdir(), 'lumen-pin-'))
  const service = createService({
    home,
    port: 0,
    buildModel: () => new ScriptedModel([assistantReply('ok')]),
    modelPort: new ScriptedModel([assistantReply('ok')]),
  })
  const handle = await service.start()
  const sockets: WebSocket[] = []
  t.after(async () => {
    await Promise.all(sockets.map((ws) => new Promise<void>((r) => {
      if (ws.readyState === WebSocket.CLOSED) return r()
      ws.addEventListener('close', () => r(), { once: true }); ws.close(); setTimeout(r, 500)
    })))
    await service.runtime.drain(); await handle.close(); await rm(home, { recursive: true, force: true })
  })
  return { service, port: handle.port, sockets }
}
interface Buf { msgs: ServerMessage[]; waiters: Array<{ pred: (m: ServerMessage) => boolean; resolve: (v: ServerMessage[]) => void }> }
const bufs = new WeakMap<WebSocket, Buf>()
function connect(r: Rig): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${r.port}/`); r.sockets.push(ws)
  const buf: Buf = { msgs: [], waiters: [] }; bufs.set(ws, buf)
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(String((ev as MessageEvent).data)) as ServerMessage; buf.msgs.push(m)
    for (const w of buf.waiters.splice(0)) { if (w.pred(m)) w.resolve(buf.msgs.slice()); else buf.waiters.push(w) }
  })
  return new Promise((resolve) => ws.addEventListener('open', () => resolve(ws), { once: true }))
}
function until(ws: WebSocket, pred: (m: ServerMessage) => boolean, ms = 4000): Promise<ServerMessage[]> {
  const buf = bufs.get(ws)!
  const from = buf.msgs.length
  return new Promise((resolve, reject) => {
    const wrapped = {
      pred: (m: ServerMessage) => {
        const slice = buf.msgs.slice(from)
        return slice.some(pred) && pred(m)
      },
      resolve: () => resolve(buf.msgs.slice(from)),
    }
    buf.waiters.push(wrapped)
    setTimeout(() => {
      const i = buf.waiters.indexOf(wrapped)
      if (i >= 0) {
        buf.waiters.splice(i, 1)
        reject(new Error('until 超时:' + buf.msgs.slice(from).map((m) => m.type).join(',')))
      }
    }, ms)
  })
}

async function createTask(ws: WebSocket, goal: string): Promise<string> {
  const created = until(ws, (m) => m.type === 'task_created')
  ws.send(JSON.stringify({ type: 'create_task', projectId: 'default', goal }))
  return ((await created).find((m) => m.type === 'task_created') as { taskId: string }).taskId
}

test('pin_task:钉档优先;钉内按 pinned_at;unpin 回位;goal/title 不变', async (t: TestContext) => {
  const r = await rig(t)
  const ws = await connect(r)
  await until(ws, (m) => m.type === 'hello')

  const idOld = await createTask(ws, '较早创建的会话目标原文')
  // 保证 created_at 可区分
  await new Promise((r) => setTimeout(r, 20))
  const idNew = await createTask(ws, '较晚创建的会话目标原文')

  bufs.get(ws)!.msgs.length = 0
  let listed = until(ws, (m) => m.type === 'tasks')
  ws.send(JSON.stringify({ type: 'list', projectId: 'default' }))
  let tasks = ((await listed).find((m) => m.type === 'tasks') as {
    tasks: Array<{ id: string; pinned_at?: string | null; goal: string }>
  }).tasks
  assert.equal(tasks[0]?.id, idNew, '未钉时新创建在上')
  assert.equal(tasks[1]?.id, idOld)

  const pinned = until(ws, (m) => m.type === 'task_updated')
  const ok = until(ws, (m) => m.type === 'ok')
  ws.send(JSON.stringify({ type: 'pin_task', taskId: idOld }))
  await ok
  const upd = ((await pinned).find((m) => m.type === 'task_updated') as {
    task: { id: string; pinned_at: string | null; goal: string; title?: string | null }
  }).task
  assert.equal(upd.id, idOld)
  assert.ok(upd.pinned_at)
  assert.equal(upd.goal, '较早创建的会话目标原文')

  bufs.get(ws)!.msgs.length = 0
  listed = until(ws, (m) => m.type === 'tasks')
  ws.send(JSON.stringify({ type: 'list', projectId: 'default' }))
  tasks = ((await listed).find((m) => m.type === 'tasks') as {
    tasks: Array<{ id: string; pinned_at?: string | null }>
  }).tasks
  assert.equal(tasks[0]?.id, idOld, '钉上的应整块在上')
  assert.equal(tasks[1]?.id, idNew)
  assert.ok(tasks[0]?.pinned_at)

  await new Promise((r) => setTimeout(r, 20))
  const ok2 = until(ws, (m) => m.type === 'ok')
  ws.send(JSON.stringify({ type: 'pin_task', taskId: idNew }))
  await ok2

  bufs.get(ws)!.msgs.length = 0
  listed = until(ws, (m) => m.type === 'tasks')
  ws.send(JSON.stringify({ type: 'list', projectId: 'default' }))
  tasks = ((await listed).find((m) => m.type === 'tasks') as {
    tasks: Array<{ id: string }>
  }).tasks
  assert.equal(tasks[0]?.id, idNew, '后钉的应在钉档更上')
  assert.equal(tasks[1]?.id, idOld)

  const ok3 = until(ws, (m) => m.type === 'ok')
  ws.send(JSON.stringify({ type: 'unpin_task', taskId: idNew }))
  await ok3

  bufs.get(ws)!.msgs.length = 0
  listed = until(ws, (m) => m.type === 'tasks')
  ws.send(JSON.stringify({ type: 'list', projectId: 'default' }))
  tasks = ((await listed).find((m) => m.type === 'tasks') as {
    tasks: Array<{ id: string; pinned_at?: string | null }>
  }).tasks
  assert.equal(tasks[0]?.id, idOld, 'unpin 后仅剩的钉仍在上')
  assert.equal(tasks[1]?.id, idNew)
  assert.ok(tasks[0]?.pinned_at)
  assert.ok(!tasks[1]?.pinned_at)
})

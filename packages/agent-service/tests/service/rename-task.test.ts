/**
 * rename_task:人手改侧栏 title,不动 goal;空标题拒;成功推 task_updated。
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
  const home = await mkdtemp(path.join(tmpdir(), 'lumen-rename-'))
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

test('rename_task:写 title 不动 goal;空标题拒;推 task_updated', async (t: TestContext) => {
  const r = await rig(t)
  const ws = await connect(r)
  await until(ws, (m) => m.type === 'hello')

  const goal = '你可视化展示一下，什么叫Agent——这是很长的 goal 不应被改名覆盖'
  const created = until(ws, (m) => m.type === 'task_created')
  ws.send(JSON.stringify({ type: 'create_task', projectId: 'default', goal }))
  const taskId = ((await created).find((m) => m.type === 'task_created') as { taskId: string }).taskId

  bufs.get(ws)!.msgs.length = 0
  const listed0 = until(ws, (m) => m.type === 'tasks')
  ws.send(JSON.stringify({ type: 'list', projectId: 'default' }))
  const before = ((await listed0).find((m) => m.type === 'tasks') as {
    tasks: Array<{ id: string; goal: string; title?: string | null }>
  }).tasks.find((x) => x.id === taskId)
  assert.ok(before)
  assert.equal(before!.goal, goal)

  const updated = until(ws, (m) => m.type === 'task_updated')
  const ok = until(ws, (m) => m.type === 'ok')
  ws.send(JSON.stringify({ type: 'rename_task', taskId, title: '  Agent 可视化  ' }))
  await ok
  const taskMsg = ((await updated).find((m) => m.type === 'task_updated') as {
    task: { id: string; title: string | null; goal: string }
  }).task
  assert.equal(taskMsg.id, taskId)
  assert.equal(taskMsg.title, 'Agent 可视化')
  assert.equal(taskMsg.goal, goal)

  bufs.get(ws)!.msgs.length = 0
  const listed1 = until(ws, (m) => m.type === 'tasks')
  ws.send(JSON.stringify({ type: 'list', projectId: 'default' }))
  const after = ((await listed1).find((m) => m.type === 'tasks') as {
    tasks: Array<{ id: string; goal: string; title?: string | null }>
  }).tasks.find((x) => x.id === taskId)!
  assert.equal(after.title, 'Agent 可视化')
  assert.equal(after.goal, goal, 'goal 必须原样保留')

  const bad = until(ws, (m) => m.type === 'error')
  ws.send(JSON.stringify({ type: 'rename_task', taskId, title: '   ' }))
  const err = ((await bad).find((m) => m.type === 'error') as { message: string }).message
  assert.match(err, /不能为空/)

  bufs.get(ws)!.msgs.length = 0
  const listed2 = until(ws, (m) => m.type === 'tasks')
  ws.send(JSON.stringify({ type: 'list', projectId: 'default' }))
  const still = ((await listed2).find((m) => m.type === 'tasks') as {
    tasks: Array<{ id: string; goal: string; title?: string | null }>
  }).tasks.find((x) => x.id === taskId)!
  assert.equal(still.title, 'Agent 可视化', '拒空后标题不得被抹掉')
  assert.equal(still.goal, goal)
})

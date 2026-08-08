/**
 * status_change 经 notifyStatus 广播 task_updated —— 侧栏未读灯依赖此路径。
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
  const home = await mkdtemp(path.join(tmpdir(), 'lumen-status-upd-'))
  const service = createService({
    home,
    port: 0,
    buildModel: () => new ScriptedModel([assistantReply('done-reply')]),
    modelPort: new ScriptedModel([assistantReply('done-reply')]),
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
function until(ws: WebSocket, pred: (m: ServerMessage) => boolean, ms = 8000): Promise<ServerMessage[]> {
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
    const hit = buf.msgs.slice(from).find(pred)
    if (hit) resolve(buf.msgs.slice(from))
    setTimeout(() => {
      const i = buf.waiters.indexOf(wrapped)
      if (i >= 0) {
        buf.waiters.splice(i, 1)
        reject(new Error('until 超时:' + buf.msgs.slice(from).map((m) => m.type).join(',')))
      }
    }, ms)
  })
}

test('notifyStatus:终态推 task_updated(含 status=done)', async (t: TestContext) => {
  const r = await rig(t)
  const ws = await connect(r)
  await until(ws, (m) => m.type === 'hello')

  const created = until(ws, (m) => m.type === 'task_created')
  const doneUpd = until(ws, (m) =>
    m.type === 'task_updated'
    && (m as { task: { status: string } }).task.status === 'done')
  ws.send(JSON.stringify({ type: 'submit', projectId: 'default', userText: 'hi' }))
  const taskId = ((await created).find((m) => m.type === 'task_created') as { taskId: string }).taskId
  const msgs = await doneUpd
  const upd = msgs.find((m) =>
    m.type === 'task_updated'
    && (m as { task: { id: string; status: string } }).task.id === taskId
    && (m as { task: { status: string } }).task.status === 'done')
  assert.ok(upd, '应收到 status=done 的 task_updated')
})

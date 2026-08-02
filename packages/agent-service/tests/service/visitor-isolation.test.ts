/**
 * B2 访客隔离(审计 must-fix):demo 模式下访客各自独立 projectId,taskId 操作按归属校验。
 * 契约:真服务+真WS。访客 B 无法 subscribe/cancel/continue 访客 A 的 taskId;list 按 projectId 隔离;
 *      本地(非 demo)不校验归属(行为不变)。
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
async function rig(t: TestContext, opts: Parameters<typeof createService>[0]): Promise<Rig> {
  const home = await mkdtemp(path.join(tmpdir(), 'lumen-iso-'))
  const service = createService({ ...opts, home, port: 0 })
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
  if (buf.msgs.some(pred)) return Promise.resolve(buf.msgs.slice())
  return new Promise((resolve, reject) => {
    const w = { pred, resolve }; buf.waiters.push(w)
    setTimeout(() => { const i = buf.waiters.indexOf(w); if (i >= 0) { buf.waiters.splice(i, 1); reject(new Error('until 超时:' + buf.msgs.map((m) => m.type).join(','))) } }, ms)
  })
}

test('demo:访客 B 无法 subscribe 访客 A 的 taskId(forbidden);A 能看自己的', async (t: TestContext) => {
  const r = await rig(t, { demo: true, buildModel: () => new ScriptedModel([assistantReply('答')]) })
  const wsA = await connect(r); const wsB = await connect(r)
  await Promise.all([until(wsA, (m) => m.type === 'hello'), until(wsB, (m) => m.type === 'hello')])
  wsA.send(JSON.stringify({ type: 'set_model', config: { provider: 'openai', model: 'x', apiKey: 'sk-A' } }))

  // A 建一个任务
  const createdA = until(wsA, (m) => m.type === 'task_created')
  wsA.send(JSON.stringify({ type: 'submit', projectId: 'visitorA', userText: 'hi' }))
  const taskA = (await createdA).find((m) => m.type === 'task_created') as { taskId: string }
  assert.ok(taskA.taskId)

  // B 用自己的 projectId 尝试 subscribe A 的 taskId → forbidden
  const bForbidden = until(wsB, (m) => m.type === 'error')
  wsB.send(JSON.stringify({ type: 'subscribe', taskId: taskA.taskId, projectId: 'visitorB' }))
  const err = (await bForbidden).find((m) => m.type === 'error') as { message: string }
  assert.match(err.message, /forbidden/, 'B 越权访问 A 的 task 必须被拒')

  // A 用自己的 projectId subscribe 自己的 → 拿得到事件(不报 forbidden)
  const aOk = until(wsA, (m) => m.type === 'event' && m.event.kind === 'user')
  wsA.send(JSON.stringify({ type: 'subscribe', taskId: taskA.taskId, projectId: 'visitorA' }))
  const aMsgs = await aOk
  assert.ok(!aMsgs.some((m) => m.type === 'error' && /forbidden/.test((m as { message: string }).message)), 'A 访问自己的 task 不该被拒')
})

test('demo:list 按 projectId 隔离(A 看不到 B 的会话)', async (t: TestContext) => {
  const r = await rig(t, { demo: true, buildModel: () => new ScriptedModel([assistantReply('答'), assistantReply('答')]) })
  const wsA = await connect(r); const wsB = await connect(r)
  await Promise.all([until(wsA, (m) => m.type === 'hello'), until(wsB, (m) => m.type === 'hello')])
  wsA.send(JSON.stringify({ type: 'set_model', config: { provider: 'openai', model: 'x', apiKey: 'sk-A' } }))
  wsB.send(JSON.stringify({ type: 'set_model', config: { provider: 'openai', model: 'x', apiKey: 'sk-B' } }))

  const cA = until(wsA, (m) => m.type === 'task_created'); wsA.send(JSON.stringify({ type: 'submit', projectId: 'visitorA', userText: 'A 的会话' }))
  await cA
  const cB = until(wsB, (m) => m.type === 'task_created'); wsB.send(JSON.stringify({ type: 'submit', projectId: 'visitorB', userText: 'B 的会话' }))
  await cB

  const listA = until(wsA, (m) => m.type === 'tasks'); wsA.send(JSON.stringify({ type: 'list', projectId: 'visitorA' }))
  const tasksA = (await listA).find((m) => m.type === 'tasks') as { tasks: Array<{ project_id: string }> }
  assert.ok(tasksA.tasks.length >= 1, 'A 应看到自己的会话')
  assert.ok(tasksA.tasks.every((tk) => tk.project_id === 'visitorA'), 'A 的列表不该混入 B 的会话')
})

test('非 demo:不校验归属(本地单用户行为不变)', async (t: TestContext) => {
  const r = await rig(t, { modelPort: new ScriptedModel([assistantReply('答')]) }) // 非 demo
  const ws = await connect(r)
  await until(ws, (m) => m.type === 'hello')
  const created = until(ws, (m) => m.type === 'task_created'); ws.send(JSON.stringify({ type: 'submit', projectId: 'default', userText: 'hi' }))
  const task = (await created).find((m) => m.type === 'task_created') as { taskId: string }
  // 非 demo:带任意/不带 projectId subscribe 都不该 forbidden
  const p = until(ws, (m) => (m.type === 'event' && m.event.kind === 'user') || m.type === 'error')
  ws.send(JSON.stringify({ type: 'subscribe', taskId: task.taskId, projectId: 'whatever' }))
  const msgs = await p
  assert.ok(!msgs.some((m) => m.type === 'error'), '非 demo 不该校验归属')
})

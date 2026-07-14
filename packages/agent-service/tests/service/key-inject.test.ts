/**
 * B2 连接级 key 注入(demo 模式):key 随连接带入、后端不落盘、每连接独立。
 * 契约:真服务 + 真 WS。set_model 后该连接用连接自带 model;未 set_model 则用全局(demo=errorModel);
 *      settings.json 永不出现连接 key;非 demo 模式 set_model 被拒。
 * 清理纪律:单文件多 service 实例 —— teardown 必须先等 ws 真正 close,再 handle.close(否则 httpServer.close 挂起)。
 */
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { createService, type Service } from '../../src/service.ts'
import type { ServerMessage } from '../../src/protocol/messages.ts'
import type { ModelPort } from '../../src/core/model-port.ts'
import { ScriptedModel, assistantReply } from '../helpers/scripted-model.ts'

interface Rig { service: Service; port: number; home: string; sockets: WebSocket[] }

async function rig(t: TestContext, opts: Parameters<typeof createService>[0]): Promise<Rig> {
  const home = await mkdtemp(path.join(tmpdir(), 'lumen-key-'))
  const service = createService({ ...opts, home, port: 0 })
  const handle = await service.start()
  const sockets: WebSocket[] = []
  t.after(async () => {
    // 顺序关键:先把所有 ws 真正关掉(等 close 事件),再 drain + close handle
    await Promise.all(sockets.map((ws) => new Promise<void>((r) => {
      if (ws.readyState === WebSocket.CLOSED) return r()
      ws.addEventListener('close', () => r(), { once: true }); ws.close(); setTimeout(r, 500)
    })))
    await service.runtime.drain()
    await handle.close()
    await rm(home, { recursive: true, force: true })
  })
  return { service, port: handle.port, home, sockets }
}

// 每个 ws 从创建即缓冲全部消息(hello 在连接建立时立即推送,晚注册监听会丢 → 竞态)
interface Buf { msgs: ServerMessage[]; waiters: Array<{ pred: (m: ServerMessage) => boolean; resolve: (v: ServerMessage[]) => void }> }
const bufs = new WeakMap<WebSocket, Buf>()

function connect(r: Rig): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${r.port}/`)
  r.sockets.push(ws)
  const buf: Buf = { msgs: [], waiters: [] }
  bufs.set(ws, buf)
  ws.addEventListener('message', (ev) => { // 同步注册,早于任何消息
    const m = JSON.parse(String((ev as MessageEvent).data)) as ServerMessage
    buf.msgs.push(m)
    for (const w of buf.waiters.splice(0)) { if (w.pred(m)) w.resolve(buf.msgs.slice()); else buf.waiters.push(w) }
  })
  return new Promise((resolve) => ws.addEventListener('open', () => resolve(ws), { once: true }))
}

/** 收集事件流,直到某消息满足 pred(先查已缓冲,再等新的);返回目前收到的所有 server 消息 */
function until(ws: WebSocket, pred: (m: ServerMessage) => boolean, ms = 4000): Promise<ServerMessage[]> {
  const buf = bufs.get(ws)!
  if (buf.msgs.some(pred)) return Promise.resolve(buf.msgs.slice())
  return new Promise((resolve, reject) => {
    const w = { pred, resolve }
    buf.waiters.push(w)
    setTimeout(() => {
      const i = buf.waiters.indexOf(w)
      if (i >= 0) { buf.waiters.splice(i, 1); reject(new Error('until 超时;收到:' + buf.msgs.map((m) => m.type + (m.type === 'event' ? ':' + m.event.kind : '')).join(','))) }
    }, ms)
  })
}
const isReply = (m: ServerMessage): boolean => m.type === 'event' && m.event.kind === 'reply'

test('demo:set_model 后该连接用连接自带 model;key 不落盘', async (t: TestContext) => {
  const connScripted = new ScriptedModel([assistantReply('用连接 key 回答的')])
  const r = await rig(t, { demo: true, buildModel: () => connScripted })
  const ws = await connect(r)

  const hello = (await until(ws, (m) => m.type === 'hello'))[0]
  assert.equal(hello.type === 'hello' && hello.demo, true, '应先收到 hello{demo:true}')

  ws.send(JSON.stringify({ type: 'set_model', config: { provider: 'openai', model: 'x', apiKey: 'sk-user-own-key' } }))
  const done = until(ws, isReply)
  ws.send(JSON.stringify({ type: 'submit', projectId: 'visitorA', userText: '你好' }))
  await done

  assert.equal(connScripted.calls.length, 1, '必须用连接自带 model 跑')
  const settingsRaw = await readFile(path.join(r.home, 'settings.json'), 'utf8').catch(() => '')
  assert.ok(!settingsRaw.includes('sk-user-own-key'), 'settings.json 绝不能出现连接 key')
})

test('demo:未 set_model 直接 submit → 友好报错(提示填 key),不崩', async (t: TestContext) => {
  const r = await rig(t, { demo: true, buildModel: () => new ScriptedModel([]) })
  const ws = await connect(r)
  await until(ws, (m) => m.type === 'hello')
  // 先注册监听(拿到 promise),再 send,后 await —— 否则 await 会在 send 前阻塞
  const p = until(ws, (m) => m.type === 'event' && (m.event.kind === 'error' || (m.event.kind === 'status_change' && JSON.parse(m.event.payload_json).to === 'failed')))
  ws.send(JSON.stringify({ type: 'submit', projectId: 'v', userText: '你好' }))
  const seen = await p
  const created = seen.find((m) => m.type === 'task_created')
  assert.ok(seen.some((m) => m.type === 'event' && (m.event.kind === 'error' || m.event.kind === 'status_change')), '未提供 key 应有错误/失败事件')
  assert.ok(created, '任务应已建档')
})

test('两个连接各自的 key 互不影响(隔离)', async (t: TestContext) => {
  const mA = new ScriptedModel([assistantReply('A 的回答')])
  const mB = new ScriptedModel([assistantReply('B 的回答')])
  const queue: ModelPort[] = [mA, mB]
  const r = await rig(t, { demo: true, buildModel: () => queue.shift() as ModelPort })
  const wsA = await connect(r)
  const wsB = await connect(r)
  await Promise.all([until(wsA, (m) => m.type === 'hello'), until(wsB, (m) => m.type === 'hello')])

  wsA.send(JSON.stringify({ type: 'set_model', config: { provider: 'openai', model: 'x', apiKey: 'sk-A' } }))
  wsB.send(JSON.stringify({ type: 'set_model', config: { provider: 'openai', model: 'x', apiKey: 'sk-B' } }))
  const dA = until(wsA, isReply); const dB = until(wsB, isReply)
  wsA.send(JSON.stringify({ type: 'submit', projectId: 'A', userText: 'hi' }))
  wsB.send(JSON.stringify({ type: 'submit', projectId: 'B', userText: 'hi' }))
  await Promise.all([dA, dB])
  assert.equal(mA.calls.length, 1, 'A 连接用 A 的 model')
  assert.equal(mB.calls.length, 1, 'B 连接用 B 的 model')
})

test('非 demo:set_model 被拒(仍走全局 settings)', async (t: TestContext) => {
  const r = await rig(t, { modelPort: new ScriptedModel([assistantReply('全局')]) }) // 非 demo
  const ws = await connect(r)
  const seen = until(ws, (m) => m.type === 'error')
  ws.send(JSON.stringify({ type: 'set_model', config: { provider: 'openai', model: 'x', apiKey: 'sk-nope' } }))
  const msgs = await seen
  const err = msgs.find((m) => m.type === 'error')
  assert.ok(err && /demo/.test(err.message), '非 demo 应拒绝 set_model')
})

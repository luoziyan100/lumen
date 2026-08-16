import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { openDatabase } from '../../src/storage/db.ts'
import { TaskStore } from '../../src/storage/task-store.ts'
import { AgentRuntime } from '../../src/runtime/agent-runtime.ts'
import { startServer, type ServerHandle } from '../../src/protocol/server.ts'
import { ENV_TOOLS } from '../../src/tools/env/fs-tools.ts'
import type { ServerMessage } from '../../src/protocol/messages.ts'
import { ScriptedModel, assistantToolCall, assistantReply } from '../helpers/scripted-model.ts'

async function makeServer(t: TestContext): Promise<ServerHandle> {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-ws-'))
  const db = openDatabase(path.join(base, 'lumen.sqlite'))
  const model = new ScriptedModel([
    assistantToolCall('w', 'write_file', { path: 'n.md', content: 'x' }),
    assistantReply('完成'),
  ])
  const runtime = new AgentRuntime({
    store: new TaskStore(db),
    model,
    sessionDir: path.join(base, 'sessions'),
    workspacesDir: path.join(base, 'workspaces'),
    mainTools: ENV_TOOLS,
  })
  const handle = await startServer(runtime, { port: 0 })
  t.after(async () => {
    await runtime.drain() // 等在跑任务结束，避免在它写库时关库
    await handle.close()
    db.close()
    await rm(base, { recursive: true, force: true })
  })
  return handle
}

function collectUntil(ws: WebSocket, done: (messages: ServerMessage[]) => boolean): Promise<ServerMessage[]> {
  return new Promise((resolve, reject) => {
    const messages: ServerMessage[] = []
    const timer = setTimeout(() => reject(new Error('timeout 等待事件流')), 4000)
    ws.addEventListener('message', (ev) => {
      messages.push(JSON.parse(String((ev as MessageEvent).data)) as ServerMessage)
      if (done(messages)) {
        clearTimeout(timer)
        resolve(messages)
      }
    })
    ws.addEventListener('error', (e) => reject(e as unknown as Error))
  })
}

test('WS：submit 后收到 task_created + 事件流直到 reply', async (t) => {
  const handle = await makeServer(t)
  const ws = new WebSocket(`ws://127.0.0.1:${handle.port}`)
  await new Promise<void>((r) => ws.addEventListener('open', () => r(), { once: true }))

  const collecting = collectUntil(ws, (msgs) =>
    msgs.some((m) => m.type === 'event' && m.event.kind === 'reply'),
  )
  ws.send(JSON.stringify({ type: 'submit', projectId: 'p', userText: '今天有什么' }))
  const messages = await collecting

  assert.ok(messages.some((m) => m.type === 'task_created'), '应收到 task_created')
  const eventKinds = messages.filter((m) => m.type === 'event').map((m) => (m as { event: { kind: string } }).event.kind)
  assert.ok(eventKinds.includes('status_change'))
  assert.ok(eventKinds.includes('model_step'))
  assert.ok(eventKinds.includes('tool_result'))
  assert.ok(eventKinds.includes('reply'))

  ws.close()
})

test('WS：list 返回已创建的任务', async (t) => {
  const handle = await makeServer(t)
  const ws = new WebSocket(`ws://127.0.0.1:${handle.port}`)
  await new Promise<void>((r) => ws.addEventListener('open', () => r(), { once: true }))

  // 先 submit 一个并等它出现在事件流
  await new Promise<void>((resolve) => {
    ws.addEventListener('message', function handler(ev) {
      const m = JSON.parse(String((ev as MessageEvent).data)) as ServerMessage
      if (m.type === 'task_created') {
        ws.removeEventListener('message', handler)
        resolve()
      }
    })
    ws.send(JSON.stringify({ type: 'submit', projectId: 'p', userText: 'x' }))
  })

  const listed = await new Promise<ServerMessage>((resolve) => {
    ws.addEventListener('message', function handler(ev) {
      const m = JSON.parse(String((ev as MessageEvent).data)) as ServerMessage
      if (m.type === 'tasks') {
        ws.removeEventListener('message', handler)
        resolve(m)
      }
    })
    ws.send(JSON.stringify({ type: 'list', projectId: 'p' }))
  })

  assert.equal(listed.type, 'tasks')
  assert.ok((listed as { tasks: unknown[] }).tasks.length >= 1)
  ws.close()
})

async function makeRepairServer(t: TestContext, replies: ReturnType<typeof assistantReply>[]): Promise<ServerHandle> {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-ws-repair-'))
  const db = openDatabase(path.join(base, 'lumen.sqlite'))
  const model = new ScriptedModel(replies)
  const runtime = new AgentRuntime({
    store: new TaskStore(db),
    model,
    sessionDir: path.join(base, 'sessions'),
    workspacesDir: path.join(base, 'workspaces'),
    mainTools: ENV_TOOLS,
  })
  const handle = await startServer(runtime, { port: 0 })
  t.after(async () => {
    await runtime.drain()
    await handle.close()
    db.close()
    await rm(base, { recursive: true, force: true })
  })
  return handle
}

test('WS：repair_mermaid 单次返回修正源码且含禁令', async (t) => {
  const model = new ScriptedModel([
    assistantReply('```mermaid\nflowchart TB\n  A["入口"] --> B["出口"]\n```'),
  ])
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-ws-repair-'))
  const db = openDatabase(path.join(base, 'lumen.sqlite'))
  const runtime = new AgentRuntime({
    store: new TaskStore(db),
    model,
    sessionDir: path.join(base, 'sessions'),
    workspacesDir: path.join(base, 'workspaces'),
    mainTools: ENV_TOOLS,
  })
  const handle = await startServer(runtime, { port: 0 })
  t.after(async () => {
    await runtime.drain()
    await handle.close()
    db.close()
    await rm(base, { recursive: true, force: true })
  })

  const ws = new WebSocket(`ws://127.0.0.1:${handle.port}`)
  await new Promise<void>((r) => ws.addEventListener('open', () => r(), { once: true }))

  const taskId = await new Promise<string>((resolve) => {
    ws.addEventListener('message', function handler(ev) {
      const m = JSON.parse(String((ev as MessageEvent).data)) as ServerMessage
      if (m.type === 'task_created') {
        ws.removeEventListener('message', handler)
        resolve(m.taskId)
      }
    })
    ws.send(JSON.stringify({ type: 'create_task', projectId: 'p', goal: '图' }))
  })

  const reply = await new Promise<ServerMessage>((resolve) => {
    ws.addEventListener('message', function handler(ev) {
      const m = JSON.parse(String((ev as MessageEvent).data)) as ServerMessage
      if (m.type === 'ok' || m.type === 'error') {
        ws.removeEventListener('message', handler)
        resolve(m)
      }
    })
    ws.send(JSON.stringify({
      type: 'repair_mermaid',
      taskId,
      source: 'flowchart TB\n  E["x" -. "贯穿" .-> A',
      error: '第 2 行附近 · 引号未配对',
    }))
  })

  assert.equal(reply.type, 'ok')
  assert.match((reply as { source?: string }).source ?? '', /A\["入口"\] --> B\["出口"\]/)
  assert.equal(model.calls.length, 1)
  const sys = model.calls[0]!.find((m) => m.role === 'system')?.content ?? ''
  assert.match(sys, /只修正 Mermaid 语法/)
  assert.match(sys, /不要重写围栏外的研究结论/)
  assert.match(sys, /只输出一个 ```mermaid/)

  const again = await new Promise<ServerMessage>((resolve) => {
    ws.addEventListener('message', function handler(ev) {
      const m = JSON.parse(String((ev as MessageEvent).data)) as ServerMessage
      if (m.type === 'ok' || m.type === 'error') {
        ws.removeEventListener('message', handler)
        resolve(m)
      }
    })
    ws.send(JSON.stringify({
      type: 'repair_mermaid',
      taskId,
      source: 'flowchart TB\n  E["x" -. "贯穿" .-> A',
      error: '第 2 行附近 · 引号未配对',
    }))
  })
  assert.equal(again.type, 'error')
  assert.match((again as { message: string }).message, /已经尝试过/)
  assert.equal(model.calls.length, 1)
  ws.close()
})

test('WS：repair_mermaid 缺 task 报错且不打模型', async (t) => {
  const handle = await makeRepairServer(t, [assistantReply('```mermaid\nflowchart TB\n  A-->B\n```')])
  const ws = new WebSocket(`ws://127.0.0.1:${handle.port}`)
  await new Promise<void>((r) => ws.addEventListener('open', () => r(), { once: true }))
  const reply = await new Promise<ServerMessage>((resolve) => {
    ws.addEventListener('message', function handler(ev) {
      const m = JSON.parse(String((ev as MessageEvent).data)) as ServerMessage
      if (m.type === 'ok' || m.type === 'error') {
        ws.removeEventListener('message', handler)
        resolve(m)
      }
    })
    ws.send(JSON.stringify({
      type: 'repair_mermaid',
      taskId: 'task-missing',
      source: 'flowchart TB\n  A',
      error: 'x',
    }))
  })
  assert.equal(reply.type, 'error')
  assert.match((reply as { message: string }).message, /不存在/)
  ws.close()
})

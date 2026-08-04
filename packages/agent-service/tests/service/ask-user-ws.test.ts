/**
 * WS answer_user round-trip:tool_call → answer_user → tool_result → reply
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
import { createAskUserTools } from '../../src/tools/env/ask-user-tools.ts'
import type { ServerMessage } from '../../src/protocol/messages.ts'
import { ScriptedModel, assistantToolCall, assistantReply } from '../helpers/scripted-model.ts'

async function makeAskServer(t: TestContext): Promise<ServerHandle & { runtime: AgentRuntime }> {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-ask-ws-'))
  const db = openDatabase(path.join(base, 'lumen.sqlite'))
  const model = new ScriptedModel([
    assistantToolCall('ask1', 'ask_user', {
      questions: [{
        question: '选方向',
        options: [{ label: '理论' }, { label: '实验' }],
      }],
    }),
    assistantReply('收到，走实验'),
  ])
  const runtime = new AgentRuntime({
    store: new TaskStore(db),
    model,
    sessionDir: path.join(base, 'sessions'),
    workspacesDir: path.join(base, 'workspaces'),
    mainTools: createAskUserTools(),
  })
  const handle = await startServer(runtime, { port: 0 })
  t.after(async () => {
    await runtime.drain()
    await handle.close()
    db.close()
    await rm(base, { recursive: true, force: true })
  })
  return { ...handle, runtime }
}

test('WS：answer_user 解开 ask_user 后收到 tool_result 与 reply', async (t) => {
  const handle = await makeAskServer(t)
  const ws = new WebSocket(`ws://127.0.0.1:${handle.port}`)
  await new Promise<void>((r) => ws.addEventListener('open', () => r(), { once: true }))

  let taskId = ''
  const toolCallSeen = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout tool_call')), 5000)
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(String((ev as MessageEvent).data)) as ServerMessage
      if (m.type === 'task_created') taskId = m.taskId
      if (m.type === 'event' && m.event.kind === 'tool_call') {
        const p = JSON.parse(m.event.payload_json) as { name?: string; id?: string }
        if (p.name === 'ask_user' && p.id === 'ask1') {
          clearTimeout(timer)
          resolve()
        }
      }
    })
  })

  ws.send(JSON.stringify({ type: 'submit', projectId: 'p', userText: '帮我定方向' }))
  await toolCallSeen
  assert.ok(taskId)

  const done = new Promise<ServerMessage[]>((resolve, reject) => {
    const messages: ServerMessage[] = []
    const timer = setTimeout(() => reject(new Error('timeout reply')), 5000)
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(String((ev as MessageEvent).data)) as ServerMessage
      messages.push(m)
      if (m.type === 'event' && m.event.kind === 'reply') {
        clearTimeout(timer)
        resolve(messages)
      }
    })
  })

  ws.send(JSON.stringify({
    type: 'answer_user',
    taskId,
    toolCallId: 'ask1',
    answers: { q1: { selected: ['实验'] } },
  }))

  const messages = await done
  assert.ok(messages.some((m) => m.type === 'ok' && m.taskId === taskId))
  const kinds = messages.filter((m) => m.type === 'event').map((m) => m.event.kind)
  assert.ok(kinds.includes('tool_result'))
  assert.ok(kinds.includes('reply'))
  ws.close()
})

test('WS：无 pending 的 answer_user 返回 error', async (t) => {
  const handle = await makeAskServer(t)
  const ws = new WebSocket(`ws://127.0.0.1:${handle.port}`)
  await new Promise<void>((r) => ws.addEventListener('open', () => r(), { once: true }))

  const errP = new Promise<ServerMessage>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 3000)
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(String((ev as MessageEvent).data)) as ServerMessage
      if (m.type === 'error') {
        clearTimeout(timer)
        resolve(m)
      }
    })
  })
  ws.send(JSON.stringify({
    type: 'answer_user',
    taskId: 'missing',
    toolCallId: 'x',
    answers: {},
  }))
  const err = await errP
  assert.equal(err.type, 'error')
  ws.close()
})

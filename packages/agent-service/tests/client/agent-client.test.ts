import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { openDatabase } from '../../src/storage/db.ts'
import { TaskStore } from '../../src/storage/task-store.ts'
import { AgentRuntime } from '../../src/runtime/agent-runtime.ts'
import { startServer } from '../../src/protocol/server.ts'
import { LumenClient } from '../../src/client/agent-client.ts'
import { ENV_TOOLS } from '../../src/tools/env/fs-tools.ts'
import type { TaskEvent } from '../../src/storage/task-store.ts'
import { ScriptedModel, assistantToolCall, assistantReply } from '../helpers/scripted-model.ts'

test('LumenClient 端到端：submit → 收事件流 → list（连真实 server）', async (t: TestContext) => {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-client-'))
  const db = openDatabase(path.join(base, 'lumen.sqlite'))
  const runtime = new AgentRuntime({
    store: new TaskStore(db),
    model: new ScriptedModel([assistantToolCall('w', 'write_file', { path: 'n.md', content: 'x' }), assistantReply('完成')]),
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

  const client = new LumenClient(`ws://127.0.0.1:${handle.port}`)
  await client.connect()

  const events: TaskEvent[] = []
  const gotReply = new Promise<void>((resolve) => {
    client.onEvent((event) => {
      events.push(event)
      if (event.kind === 'reply') resolve()
    })
  })

  const taskId = await client.submit('p', '今天有什么')
  assert.ok(taskId, 'submit 应返回 taskId')
  await gotReply

  const kinds = events.map((e) => e.kind)
  assert.ok(kinds.includes('model_step') && kinds.includes('tool_result') && kinds.includes('reply'))

  const tasks = await client.list('p')
  assert.ok(tasks.some((t2) => t2.id === taskId))

  client.close()
})

/**
 * ask_user × runtime:answer 解开 / cancel 中止 / 无 pending 拒绝。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { openDatabase } from '../../src/storage/db.ts'
import { TaskStore } from '../../src/storage/task-store.ts'
import { AgentRuntime } from '../../src/runtime/agent-runtime.ts'
import { createAskUserTools } from '../../src/tools/env/ask-user-tools.ts'
import { ScriptedModel, assistantToolCall, assistantReply } from '../helpers/scripted-model.ts'

async function makeRuntime(script: ConstructorParameters<typeof ScriptedModel>[0]) {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-ask-rt-'))
  const db = openDatabase(path.join(base, 'lumen.sqlite'))
  const model = new ScriptedModel(script)
  const runtime = new AgentRuntime({
    store: new TaskStore(db),
    model,
    sessionDir: path.join(base, 'sessions'),
    workspacesDir: path.join(base, 'workspaces'),
    mainTools: createAskUserTools(),
  })
  return {
    runtime,
    model,
    async cleanup() {
      await runtime.drain()
      db.close()
      await rm(base, { recursive: true, force: true })
    },
  }
}

async function waitForToolCall(runtime: AgentRuntime, taskId: string): Promise<string> {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    for (const ev of runtime.listEvents(taskId)) {
      if (ev.kind !== 'tool_call') continue
      const p = JSON.parse(ev.payload_json) as { id?: string; name?: string }
      if (p.name === 'ask_user' && p.id) return p.id
    }
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error(`timeout waiting tool_call; kinds=${runtime.listEvents(taskId).map((e) => e.kind).join(',')}`)
}

describe('ask_user runtime', () => {
  it('answerUser 解开后模型看到 tool_result 并继续', async () => {
    const { runtime, model, cleanup } = await makeRuntime([
      assistantToolCall('c1', 'ask_user', {
        questions: [{
          question: '范围?',
          options: [{ label: '宽' }, { label: '窄' }],
        }],
      }),
      assistantReply('好的，按窄范围做'),
    ])
    try {
      const taskId = runtime.submit({ projectId: 'p', userText: '帮我选题' })
      const callId = await waitForToolCall(runtime, taskId)
      assert.equal(callId, 'c1')
      const ok = runtime.answerUser(taskId, 'c1', {
        answers: { q1: { selected: ['窄'] } },
      })
      assert.equal(ok, true)
      await runtime.drain()
      assert.ok(model.calls.length >= 2, '应有第二轮 model.chat')
      const second = model.calls[1] ?? []
      const toolResults = second.filter((m) => m.role === 'tool_result')
      assert.ok(toolResults.some((m) => typeof m.content === 'string' && m.content.includes('窄')))
    } finally {
      await cleanup()
    }
  })

  it('cancel 中止挂起的 ask_user', async () => {
    const { runtime, cleanup } = await makeRuntime([
      assistantToolCall('c2', 'ask_user', {
        questions: [{
          question: '继续?',
          options: [{ label: '是' }, { label: '否' }],
        }],
      }),
      assistantReply('不应到达'),
    ])
    try {
      const taskId = runtime.submit({ projectId: 'p', userText: '问一下' })
      await waitForToolCall(runtime, taskId)
      runtime.cancel(taskId)
      await runtime.drain()
      const task = runtime.listTasks('p').find((t) => t.id === taskId)
      assert.equal(task?.status, 'canceled')
      assert.equal(runtime.answerUser(taskId, 'c2', { answers: {}, skipped: true }), false)
    } finally {
      await cleanup()
    }
  })

  it('无 pending 的 answerUser 返回 false', async () => {
    const { runtime, cleanup } = await makeRuntime([assistantReply('hi')])
    try {
      const taskId = runtime.submit({ projectId: 'p', userText: 'hi' })
      await runtime.drain()
      assert.equal(runtime.answerUser(taskId, 'nope', { answers: {} }), false)
    } finally {
      await cleanup()
    }
  })
})

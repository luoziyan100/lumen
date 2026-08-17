/**
 * [INPUT]: AgentRuntime + spawn_subagent 工具 + ScriptedModel
 * [OUTPUT]: T4 mock E2E — 主 agent 扇出子 agent 并取结果
 */
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { openDatabase } from '../../src/storage/db.ts'
import { TaskStore } from '../../src/storage/task-store.ts'
import { AgentRuntime } from '../../src/runtime/agent-runtime.ts'
import { ENV_TOOLS } from '../../src/tools/env/fs/index.ts'
import {
  ScriptedModel,
  assistantToolCall,
  assistantReply,
} from '../helpers/scripted-model.ts'

async function makeEnv(t: TestContext) {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-t4-'))
  const db = openDatabase(path.join(base, 'lumen.sqlite'))
  t.after(() => {
    db.close()
    return rm(base, { recursive: true, force: true })
  })
  return { base, db, store: new TaskStore(db) }
}

test('T4 E2E: main spawn_subagent(searcher) → wait → 读完成 + 文件落盘', async (t) => {
  const { base, db, store } = await makeEnv(t)

  // 主: spawn → wait → reply；子: write → reply
  // ScriptedModel 是单队列：主与子共享同一 model 实例会抢脚本。
  // 解法：子用 roles 独立 model（兼容旧 spawn）不够——ChildRunner 用 deps.model。
  // ChildRunner 与主共用 model → 必须交错脚本：主 spawn 后，子跑完，再主 wait/reply。
  // 顺序: main chat1 spawn | child chat1 write | child chat2 reply | main chat2 wait | main chat3 reply
  // wait 会阻塞直到子完成，所以 main 第二轮在子完成后才调。
  const model = new ScriptedModel([
    // main #1
    assistantToolCall('s', 'spawn_subagent', {
      subagent_type: 'searcher',
      description: '搜笔记',
      prompt: '写 notes/found.md 记 3 篇',
      scope: '扫今天',
      background: true,
    }),
    // child #1 write
    assistantToolCall('w', 'write_file', { path: 'notes/found.md', content: '命中 3 篇' }),
    // child #2 done
    assistantReply('Scope: 扫今天\n命中: 3 篇\n备注: notes/found.md'),
    // main #2 wait (after child done, wait returns immediately)
    assistantToolCall('wt', 'wait_subagents', { subagent_ids: ['__REPLACE__'], timeout_ms: 5000 }),
    // main #3 reply
    assistantReply('已汇总子 agent 结果'),
  ])

  // wait 的 id 要在 spawn 后动态改 — ScriptedModel 是静态脚本。
  // 改用: spawn 后 get_subagent_output 轮询不适用静态 id。
  // 方案: main 第二步用 get；但 id 仍未知。
  // 更好: 单轮 spawn background=false 让工具内 await 完成，主只两轮。
  const modelFg = new ScriptedModel([
    // main #1: foreground spawn (tool blocks until child done)
    assistantToolCall('s', 'spawn_subagent', {
      subagent_type: 'searcher',
      description: '搜笔记',
      prompt: '写 notes/found.md 记 3 篇',
      scope: '扫今天',
      background: false,
    }),
    // child while tool blocks
    assistantToolCall('w', 'write_file', { path: 'notes/found.md', content: '命中 3 篇' }),
    assistantReply('Scope: 扫今天\n命中: 3 篇\n备注: notes/found.md'),
    // main #2 after tool_result
    assistantReply('已汇总子 agent 结果'),
  ])

  const runtime = new AgentRuntime({
    store,
    db,
    model: modelFg,
    sessionDir: path.join(base, 'sessions'),
    workspacesDir: path.join(base, 'workspaces'),
    mainTools: ENV_TOOLS,
  })

  const taskId = runtime.submit({ projectId: 'p', userText: '派子 agent 搜一下' })
  await runtime.waitFor(taskId)

  assert.equal(store.getTask(taskId)?.status, 'done', store.getTask(taskId)?.last_error ?? '')
  const kinds = store.listEvents(taskId).map((e) => e.kind)
  assert.ok(kinds.includes('spawn') || kinds.includes('subagent_started'), `events=${kinds.join(',')}`)
  assert.ok(kinds.includes('subagent_completed'), '应有 subagent_completed')

  const subs = runtime.subagents.listByParentTask(taskId)
  assert.equal(subs.length, 1)
  assert.equal(subs[0]!.status, 'done')
  assert.ok(subs[0]!.cwd_root?.startsWith('workers/'))

  const written = await readFile(
    path.join(
      base,
      'workspaces',
      'p',
      'sessions',
      taskId,
      subs[0]!.cwd_root!,
      'notes',
      'found.md',
    ),
    'utf8',
  )
  assert.equal(written, '命中 3 篇')

  // 主最终 reply
  const replies = store.listEvents(taskId).filter((e) => e.kind === 'reply' && e.agent_role === 'main')
  assert.ok(replies.some((e) => JSON.parse(e.payload_json).reply?.includes('汇总')))

  void model
})

test('T4 E2E: background spawn + wait_subagents 取结果', async (t) => {
  const { base, db, store } = await makeEnv(t)

  // 用 system prompt 区分 main / child（勿匹配 persona 里对 explore 的说明）
  const isChild = (messages: { role: string; content?: string }[]) =>
    messages.some(
      (m) => m.role === 'system' && String(m.content).includes('你是 explore 子 agent'),
    )

  let childSteps = 0
  const model: import('../../src/core/model-port.ts').ModelPort = {
    async chat(messages) {
      if (isChild(messages)) {
        childSteps += 1
        if (childSteps === 1) {
          const tc = { id: 'c1', name: 'list_dir', arguments: { path: '.' } }
          return { message: { role: 'assistant', content: '', toolCalls: [tc] }, toolCalls: [tc] }
        }
        return {
          message: { role: 'assistant', content: '根目录已列完', toolCalls: [] },
          toolCalls: [],
        }
      }
      // main
      const spawnRes = messages.find((m) => m.role === 'tool_result' && m.toolCallId === 's1')
      const waitRes = messages.find((m) => m.role === 'tool_result' && m.toolCallId === 'w1')
      if (!spawnRes) {
        const tc = {
          id: 's1',
          name: 'spawn_subagent',
          arguments: {
            subagent_type: 'explore',
            description: '勘察目录',
            prompt: 'list 根目录并回报',
            background: true,
          },
        }
        return { message: { role: 'assistant', content: '', toolCalls: [tc] }, toolCalls: [tc] }
      }
      if (!waitRes) {
        let id = ''
        try {
          id = JSON.parse(spawnRes.content).subagent_id
        } catch {
          id = ''
        }
        const tc = {
          id: 'w1',
          name: 'wait_subagents',
          arguments: { subagent_ids: [id], timeout_ms: 5000 },
        }
        return { message: { role: 'assistant', content: '', toolCalls: [tc] }, toolCalls: [tc] }
      }
      return {
        message: { role: 'assistant', content: '子 agent 勘察完成', toolCalls: [] },
        toolCalls: [],
      }
    },
  }

  const runtime = new AgentRuntime({
    store,
    db,
    model,
    sessionDir: path.join(base, 'sessions'),
    workspacesDir: path.join(base, 'workspaces'),
    mainTools: ENV_TOOLS,
    budget: { maxSteps: 12, maxSeconds: 30 },
  })

  const taskId = runtime.submit({ projectId: 'p', userText: '开个子 agent 看看目录' })
  await runtime.waitFor(taskId)

  assert.equal(store.getTask(taskId)?.status, 'done', store.getTask(taskId)?.last_error ?? '')
  const subs = runtime.subagents.listByParentTask(taskId)
  assert.equal(subs.length, 1)
  assert.equal(subs[0]!.status, 'done')
  const names = store.listEvents(taskId)
    .filter((e) => e.kind === 'tool_call')
    .map((e) => JSON.parse(e.payload_json).name as string)
  assert.ok(names.includes('spawn_subagent'))
  assert.ok(names.includes('wait_subagents'))
})

test('T4: kill_subagent 经 runtime 工具', async (t) => {
  const { base, db, store } = await makeEnv(t)
  let phase: 'spawn' | 'child_hang' | 'kill' | 'done' = 'spawn'
  let subId: string | null = null
  let releaseHang!: () => void
  const hang = new Promise<void>((r) => {
    releaseHang = r
  })

  const hangRead = {
    spec: {
      name: 'read_file',
      description: 'hang',
      parameters: { type: 'object', properties: { path: { type: 'string' } } },
    },
    run: async () => {
      await hang
      return { llmContent: 'late' }
    },
  }

  const model: import('../../src/core/model-port.ts').ModelPort = {
    async chat(messages) {
      if (phase === 'spawn') {
        phase = 'child_hang'
        const tc = {
          id: 's',
          name: 'spawn_subagent',
          arguments: {
            subagent_type: 'explore',
            description: 'hang read',
            prompt: 'read x',
            background: true,
          },
        }
        return { message: { role: 'assistant', content: '', toolCalls: [tc] }, toolCalls: [tc] }
      }
      // parse spawn result if present
      const tr = messages.find((m) => m.role === 'tool_result' && m.toolCallId === 's')
      if (tr && !subId) {
        try {
          subId = JSON.parse(tr.content).subagent_id
        } catch { /* */ }
      }
      if (phase === 'child_hang' && !tr) {
        // child first model call
        const tc = { id: 'h', name: 'read_file', arguments: { path: 'x.md' } }
        return { message: { role: 'assistant', content: '', toolCalls: [tc] }, toolCalls: [tc] }
      }
      if (phase === 'child_hang' && tr && subId) {
        phase = 'kill'
        const tc = { id: 'k', name: 'kill_subagent', arguments: { subagent_id: subId } }
        return { message: { role: 'assistant', content: '', toolCalls: [tc] }, toolCalls: [tc] }
      }
      if (phase === 'kill') {
        phase = 'done'
        return { message: { role: 'assistant', content: '已杀掉', toolCalls: [] }, toolCalls: [] }
      }
      return { message: { role: 'assistant', content: 'end', toolCalls: [] }, toolCalls: [] }
    },
  }

  const runtime = new AgentRuntime({
    store,
    db,
    model,
    sessionDir: path.join(base, 'sessions'),
    workspacesDir: path.join(base, 'workspaces'),
    mainTools: [...ENV_TOOLS.filter((x) => x.spec.name !== 'read_file'), hangRead],
    budget: { maxSteps: 10, maxSeconds: 15 },
  })

  const taskId = runtime.submit({ projectId: 'p', userText: 'spawn then kill' })
  // 等 kill 发生
  for (let i = 0; i < 50; i++) {
    const subs = runtime.subagents.listByParentTask(taskId)
    if (subs.some((s) => s.status === 'aborted')) break
    await new Promise((r) => setTimeout(r, 40))
  }
  releaseHang()
  await runtime.waitFor(taskId)

  const subs = runtime.subagents.listByParentTask(taskId)
  assert.ok(subs.length >= 1)
  assert.equal(subs[0]!.status, 'aborted')
})

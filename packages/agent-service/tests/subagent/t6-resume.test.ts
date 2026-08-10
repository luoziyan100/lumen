/**
 * [INPUT]: prepareResume + ChildRunner resume_from + rebuildChildThread
 * [OUTPUT]: T6 契约 — 矩阵 / 路径继承 / 禁止跨 task / worktree 缺失失败
 */
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { openDatabase } from '../../src/storage/db.ts'
import { TaskStore } from '../../src/storage/task-store.ts'
import { SubagentStore } from '../../src/subagent/store.ts'
import { SubagentCoordinator } from '../../src/subagent/coordinator.ts'
import { ChildRunner } from '../../src/subagent/runner.ts'
import { rebuildChildThread } from '../../src/subagent/child-resume.ts'
import { SUBAGENT_ERROR, resumeAllowed } from '../../src/subagent/types.ts'
import { ENV_TOOLS } from '../../src/tools/env/fs-tools.ts'
import { FsWorkspace } from '../../src/workspace/fs-workspace.ts'
import {
  ScriptedModel,
  assistantReply,
  assistantToolCall,
} from '../helpers/scripted-model.ts'

async function harness(t: TestContext) {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-t6-'))
  const db = openDatabase(path.join(base, 'lumen.sqlite'))
  t.after(() => {
    db.close()
    return rm(base, { recursive: true, force: true })
  })
  const taskStore = new TaskStore(db)
  const subStore = new SubagentStore(db)
  const coord = new SubagentCoordinator(subStore, taskStore, { max_depth: 2 })
  return { base, taskStore, subStore, coord }
}

test('resumeAllowed 矩阵', () => {
  assert.equal(resumeAllowed('done'), true)
  assert.equal(resumeAllowed('interrupted'), true)
  assert.equal(resumeAllowed('exhausted'), true)
  assert.equal(resumeAllowed('aborted'), false)
  assert.equal(resumeAllowed('error'), false)
  assert.equal(resumeAllowed('failed'), false)
  assert.equal(resumeAllowed('running'), false)
})

test('prepareResume: aborted 拒绝；done 可；跨 task 拒；type 不匹配拒', async (t) => {
  const { coord, taskStore } = await harness(t)
  const task = taskStore.createTask('p', 'g')
  const turn = taskStore.beginTurn(task.id)
  const a = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'explore',
    description: 'a',
  })
  coord.complete(a.record!.id, 'aborted', { completion_summary: 'killed' })
  const bad = coord.prepareResume({
    resume_from: a.record!.id,
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'explore',
  })
  assert.equal(bad.ok, false)
  assert.equal(bad.error_code, SUBAGENT_ERROR.RESUME_NOT_ALLOWED)

  const b = coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'explore',
    description: 'b',
  })
  coord.complete(b.record!.id, 'done', { completion_summary: 'ok summary' })
  coord.setWorkspacePaths(b.record!.id, { cwd_root: 'workers/x' })

  const other = taskStore.createTask('p', 'g2')
  const cross = coord.prepareResume({
    resume_from: b.record!.id,
    parent_task_id: other.id,
    parent_turn_id: turn,
    subagent_type: 'explore',
  })
  assert.equal(cross.ok, false)
  assert.match(cross.error ?? '', /same parent task/)

  const typeBad = coord.prepareResume({
    resume_from: b.record!.id,
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'plan',
  })
  assert.equal(typeBad.ok, false)
  assert.match(typeBad.error ?? '', /type mismatch/)

  const ok = coord.prepareResume({
    resume_from: b.record!.id,
    parent_task_id: task.id,
    parent_turn_id: `turn-${crypto.randomUUID()}`,
    subagent_type: 'explore',
  })
  assert.equal(ok.ok, true)
  assert.equal(ok.record!.status, 'queued')
  assert.equal(ok.record!.cwd_root, 'workers/x')
  assert.equal(ok.record!.finished_at, null)
})

test('rebuildChildThread 回放 subagent_id 步进并 append resume', () => {
  const events = [
    {
      id: '1',
      task_id: 't',
      seq: 1,
      kind: 'model_step',
      payload_json: JSON.stringify({
        subagent_id: 'sub-1',
        content: 'thinking',
        toolCalls: [{ id: 'c1', name: 'read_file', arguments: { path: 'a.md' } }],
      }),
      agent_role: 'explore',
      created_at: '',
    },
    {
      id: '2',
      task_id: 't',
      seq: 2,
      kind: 'tool_result',
      payload_json: JSON.stringify({
        subagent_id: 'sub-1',
        id: 'c1',
        llmContent: 'file body',
      }),
      agent_role: 'explore',
      created_at: '',
    },
    {
      id: '3',
      task_id: 't',
      seq: 3,
      kind: 'model_step',
      payload_json: JSON.stringify({
        subagent_id: 'other',
        content: 'noise',
        toolCalls: [],
      }),
      agent_role: 'explore',
      created_at: '',
    },
  ]
  const th = rebuildChildThread(events, {
    systemPrompt: 'sys',
    subagentId: 'sub-1',
    priorSummary: 'prev done',
    resumePrompt: 'continue please',
  })
  const roles = th.messages.map((m) => m.role)
  assert.ok(roles.includes('system'))
  assert.ok(roles.includes('assistant'))
  assert.ok(roles.includes('tool_result'))
  const last = th.messages[th.messages.length - 1]!
  assert.equal(last.role, 'user')
  assert.equal(last.content, 'continue please')
  // other 子的 model_step 不进
  assert.ok(!th.messages.some((m) => m.role === 'assistant' && m.content === 'noise'))
})

test('ChildRunner resume_from: done → 续跑 inherit cwd + 新完成', async (t) => {
  const h = await harness(t)
  const sessionRoot = path.join(h.base, 'sessions', 'task')
  await mkdir(sessionRoot, { recursive: true })

  let modelPhase = 0
  const model = new ScriptedModel([
    // first run
    assistantReply('first answer'),
    // resume run
    assistantReply('resumed answer'),
  ])

  const runner = new ChildRunner({
    coordinator: h.coord,
    model,
    allTools: ENV_TOOLS,
    listEvents: (tid) => h.taskStore.listEvents(tid),
    makeWorkspace: async (_tid, cwdRoot) => {
      const root = cwdRoot ? path.join(sessionRoot, cwdRoot) : sessionRoot
      await mkdir(root, { recursive: true })
      return new FsWorkspace({ root })
    },
    emit: (parentTaskId, event) => {
      h.taskStore.appendEvent(
        parentTaskId,
        event.kind as Parameters<TaskStore['appendEvent']>[1],
        event.payload,
        event.agentRole,
      )
    },
  })

  const task = h.taskStore.createTask('p', 'g')
  const turn1 = h.taskStore.beginTurn(task.id)
  const first = await runner.start({
    parent_task_id: task.id,
    parent_turn_id: turn1,
    subagent_type: 'verifier',
    description: 'v1',
    prompt: 'check claim A',
    background: false,
  })
  assert.equal(first.success, true, first.error)
  await first.handle!.done
  const id = first.subagent_id!
  assert.equal(h.coord.get(id)?.status, 'done')
  const cwd = h.coord.get(id)!.cwd_root

  const turn2 = `turn-${crypto.randomUUID()}`
  const second = await runner.start({
    parent_task_id: task.id,
    parent_turn_id: turn2,
    subagent_type: 'verifier',
    description: 'v1 resume',
    prompt: 'also check claim B',
    resume_from: id,
    background: false,
  })
  assert.equal(second.success, true, second.error)
  assert.equal(second.subagent_id, id, '同一 id 续跑')
  await second.handle!.done
  const rec = h.coord.get(id)!
  assert.equal(rec.status, 'done')
  assert.equal(rec.cwd_root, cwd, 'cwd 继承')
  assert.equal(rec.completion_summary, 'resumed answer')
  assert.equal(model.calls.length, 2)
  // resume 线程应含 prior 或 resume user
  const resumeMsgs = model.calls[1]!
  assert.ok(resumeMsgs.some((m) => m.role === 'user' && String(m.content).includes('claim B')))
  void modelPhase
})

test('ChildRunner resume worktree 路径缺失 → WORKTREE_FAILED 不 fallback', async (t) => {
  const h = await harness(t)
  const task = h.taskStore.createTask('p', 'g')
  const turn = h.taskStore.beginTurn(task.id)
  const reg = h.coord.registerSpawn({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'general-purpose',
    description: 'wt',
    isolation: 'worktree',
  })
  h.coord.setWorkspacePaths(reg.record!.id, {
    worktree_path: path.join(h.base, 'missing-wt'),
  })
  h.coord.complete(reg.record!.id, 'interrupted', { completion_summary: 'service_restart' })

  const runner = new ChildRunner({
    coordinator: h.coord,
    model: new ScriptedModel([assistantReply('nope')]),
    allTools: ENV_TOOLS,
    makeWorkspace: async () => {
      throw new Error('should not')
    },
    emit: () => {},
  })
  const r = await runner.start({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'general-purpose',
    description: 'wt resume',
    prompt: 'continue',
    resume_from: reg.record!.id,
  })
  assert.equal(r.success, false)
  assert.equal(r.error_code, SUBAGENT_ERROR.WORKTREE_FAILED)
  assert.match(r.error ?? '', /refusing fallback/)
})

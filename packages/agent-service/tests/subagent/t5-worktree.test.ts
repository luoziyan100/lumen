/**
 * [INPUT]: worktree helpers + ChildRunner isolation=worktree
 * [OUTPUT]: T5 契约 — 成功隔离 / 无 git 显式失败 / 禁止 fallback none
 */
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'
import { openDatabase } from '../../src/storage/db.ts'
import { TaskStore } from '../../src/storage/task-store.ts'
import { SubagentStore } from '../../src/subagent/store.ts'
import { SubagentCoordinator } from '../../src/subagent/coordinator.ts'
import { ChildRunner } from '../../src/subagent/runner.ts'
import {
  materializeWorktree,
  removeWorktree,
  resolveGitRoot,
  expandUserPath,
} from '../../src/subagent/worktree.ts'
import { SUBAGENT_ERROR } from '../../src/subagent/types.ts'
import { ENV_TOOLS } from '../../src/tools/env/fs/index.ts'
import { FsWorkspace } from '../../src/workspace/fs-workspace.ts'
import {
  ScriptedModel,
  assistantToolCall,
  assistantReply,
} from '../helpers/scripted-model.ts'

function git(args: string[], cwd: string): void {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr || r.stdout}`)
}

async function makeGitRepo(base: string): Promise<string> {
  const repo = path.join(base, 'repo')
  await mkdir(repo, { recursive: true })
  git(['init'], repo)
  git(['config', 'user.email', 't@test'], repo)
  git(['config', 'user.name', 't'], repo)
  await writeFile(path.join(repo, 'seed.txt'), 'seed-v1', 'utf8')
  git(['add', 'seed.txt'], repo)
  git(['commit', '-m', 'init'], repo)
  return repo
}

async function harness(t: TestContext) {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-t5-'))
  const db = openDatabase(path.join(base, 'lumen.sqlite'))
  t.after(async () => {
    db.close()
    await rm(base, { recursive: true, force: true })
  })
  const taskStore = new TaskStore(db)
  const subStore = new SubagentStore(db)
  const wtRoot = path.join(base, 'worktrees')
  const coord = new SubagentCoordinator(subStore, taskStore, {
    max_depth: 2,
    worktree_root: wtRoot,
  })
  return { base, taskStore, subStore, coord, wtRoot }
}

test('expandUserPath / resolveGitRoot', async (t) => {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-t5-git-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  const repo = await makeGitRepo(base)
  assert.equal(resolveGitRoot(path.join(repo, 'nested', 'x')), repo)
  assert.equal(resolveGitRoot(path.join(base, 'nope')), null)
  assert.ok(expandUserPath('~/foo').includes('foo'))
})

test('materializeWorktree 成功 + remove', async (t) => {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-t5-mat-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  const repo = await makeGitRepo(base)
  const wt = path.join(base, 'wt-a')
  const r = materializeWorktree({ repoRoot: repo, worktreePath: wt })
  assert.equal(r.ok, true, r.ok ? '' : r.error)
  if (!r.ok) return
  assert.ok(existsSync(path.join(r.path, 'seed.txt')))
  const body = await readFile(path.join(r.path, 'seed.txt'), 'utf8')
  assert.equal(body, 'seed-v1')
  // 在 worktree 写文件不影响主工作树未提交态隔离：seed 同源
  await writeFile(path.join(r.path, 'child-only.txt'), 'only-in-wt', 'utf8')
  assert.ok(existsSync(path.join(r.path, 'child-only.txt')))
  assert.ok(!existsSync(path.join(repo, 'child-only.txt')))
  assert.ok(removeWorktree({ repoRoot: repo, worktreePath: r.path }))
  assert.ok(!existsSync(r.path))
})

test('materializeWorktree 非 git 仓 → WORKTREE_FAILED', async (t) => {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-t5-nogit-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  const r = materializeWorktree({
    repoRoot: base,
    worktreePath: path.join(base, 'wt'),
  })
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.error_code, SUBAGENT_ERROR.WORKTREE_FAILED)
  assert.match(r.error, /not a git repository/i)
})

test('ChildRunner isolation=worktree 无 git → spawn 失败且 status=failed（不 fallback none）', async (t) => {
  const h = await harness(t)
  const model = new ScriptedModel([assistantReply('should not run')])
  const runner = new ChildRunner({
    coordinator: h.coord,
    model,
    allTools: ENV_TOOLS,
    worktreeRoot: h.wtRoot,
    resolveGitRoot: () => null, // 无仓库
    makeWorkspace: async () => {
      throw new Error('must not call makeWorkspace on worktree fail path')
    },
    emit: () => {},
  })
  const task = h.taskStore.createTask('p', 'g')
  const turn = h.taskStore.beginTurn(task.id)
  const start = await runner.start({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'general-purpose',
    description: 'wt fail',
    prompt: 'write x',
    isolation: 'worktree',
  })
  assert.equal(start.success, false)
  assert.equal(start.error_code, SUBAGENT_ERROR.WORKTREE_FAILED)
  assert.match(start.error ?? '', /refusing fallback/i)
  // 已登记但终态 failed，非 running/queued
  const all = h.coord.listByParentTask(task.id)
  assert.equal(all.length, 1)
  assert.equal(all[0]!.status, 'failed')
  assert.equal(all[0]!.isolation, 'worktree') // 未改 none
  assert.equal(all[0]!.worktree_path, null)
  assert.equal(model.calls.length, 0, 'runAgent 不得启动')
})

test('ChildRunner isolation=worktree 成功跑 runAgent 写在 worktree 内', async (t) => {
  const h = await harness(t)
  const repo = await makeGitRepo(h.base)
  const model = new ScriptedModel([
    assistantToolCall('w', 'write_file', { path: 'out.md', content: 'from-child' }),
    assistantReply('wrote out.md'),
  ])
  const runner = new ChildRunner({
    coordinator: h.coord,
    model,
    allTools: ENV_TOOLS,
    worktreeRoot: h.wtRoot,
    resolveGitRoot: () => repo,
    makeWorkspace: async () => {
      throw new Error('worktree path must not use session makeWorkspace')
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
  const turn = h.taskStore.beginTurn(task.id)
  const start = await runner.start({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'general-purpose',
    description: 'wt ok',
    prompt: 'write out.md',
    isolation: 'worktree',
    background: false,
  })
  assert.equal(start.success, true, start.error)
  await start.handle!.done

  const rec = h.coord.get(start.subagent_id!)!
  assert.equal(rec.status, 'done')
  assert.equal(rec.isolation, 'worktree')
  assert.ok(rec.worktree_path)
  assert.ok(rec.worktree_path!.startsWith(h.wtRoot))
  const written = await readFile(path.join(rec.worktree_path!, 'out.md'), 'utf8')
  assert.equal(written, 'from-child')
  // 主仓无此文件
  assert.ok(!existsSync(path.join(repo, 'out.md')))
  // 输出可 query
  const out = h.coord.getOutput(rec.id)!
  assert.equal(out.worktree_path, rec.worktree_path)

  removeWorktree({ repoRoot: repo, worktreePath: rec.worktree_path! })
})

test('worktree + model cwd 在 register 层拒绝', async (t) => {
  const h = await harness(t)
  const r = h.coord.registerSpawn({
    parent_task_id: 't',
    parent_turn_id: 'turn-1',
    subagent_type: 'general-purpose',
    description: 'bad',
    isolation: 'worktree',
    model_cwd: 'scratch',
  })
  assert.equal(r.ok, false)
  assert.equal(r.error_code, SUBAGENT_ERROR.CWD_FORBIDDEN_WITH_WORKTREE)
})

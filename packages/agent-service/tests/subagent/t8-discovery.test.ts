/**
 * [INPUT]: discovery + registry + toggle
 * [OUTPUT]: T8 发现/优先级/visible==callable 契约
 */
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import {
  parseAgentMarkdown,
  discoverAgents,
  buildAgentDiscoverRoots,
} from '../../src/subagent/discovery.ts'
import {
  mergeAgentRegistry,
  listCallableAgents,
  resolveFromRegistry,
  loadToggles,
  saveToggles,
  setAgentToggle,
} from '../../src/subagent/registry.ts'
import { openDatabase } from '../../src/storage/db.ts'
import { TaskStore } from '../../src/storage/task-store.ts'
import { AgentRuntime } from '../../src/runtime/agent-runtime.ts'
import { ENV_TOOLS } from '../../src/tools/env/fs/index.ts'
import { ChildRunner } from '../../src/subagent/runner.ts'
import { SubagentCoordinator } from '../../src/subagent/coordinator.ts'
import { SubagentStore } from '../../src/subagent/store.ts'
import { ScriptedModel, assistantReply } from '../helpers/scripted-model.ts'
import { FsWorkspace } from '../../src/workspace/fs-workspace.ts'
import { SUBAGENT_ERROR } from '../../src/subagent/types.ts'

test('parseAgentMarkdown frontmatter', () => {
  const raw = `---
name: custom-scout
description: Fast scout
default_capability: read-only
isolation: none
allow_nested: false
max_steps: 6
kind_preset: explore
tools: read_file, grep
disabled: false
---

你是自定义 scout。
`
  const p = parseAgentMarkdown(raw, { fileBase: 'custom-scout' })
  assert.ok(!('error' in p))
  if ('error' in p) return
  assert.equal(p.def.name, 'custom-scout')
  assert.equal(p.def.defaultCapability, 'read-only')
  assert.equal(p.def.maxSteps, 6)
  assert.deepEqual(p.def.toolNames, ['read_file', 'grep'])
  assert.match(p.def.systemPrompt, /自定义 scout/)
  assert.equal(p.def.disabled, false)
})

test('discover + merge 优先级 project > builtin > user', async (t) => {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-t8-'))
  t.after(() => rm(base, { recursive: true, force: true }))

  const userDir = path.join(base, 'user')
  const projDir = path.join(base, 'proj', '.lumen', 'subagents')
  const wsDir = path.join(base, 'workspaces', 'p', 'subagents')
  await mkdir(userDir, { recursive: true })
  await mkdir(projDir, { recursive: true })
  await mkdir(wsDir, { recursive: true })

  // user 覆盖 explore 描述（但 project 更高）
  await writeFile(path.join(userDir, 'explore.md'), `---
name: explore
description: user-explore
default_capability: read-only
kind_preset: explore
---
user explore
`)
  await writeFile(path.join(projDir, 'explore.md'), `---
name: explore
description: project-explore
default_capability: read-only
kind_preset: explore
---
project explore
`)
  await writeFile(path.join(userDir, 'my-bot.md'), `---
name: my-bot
description: only in user
default_capability: read-write
kind_preset: general-purpose
---
user bot
`)

  const roots = buildAgentDiscoverRoots({
    workspacesDir: path.join(base, 'workspaces'),
    projectId: 'p',
    sourcePath: path.join(base, 'proj'),
    userAgentsDir: userDir,
  })
  const found = discoverAgents(roots)
  assert.ok(found.some((a) => a.name === 'my-bot' && a.layer === 'user'))
  assert.ok(found.some((a) => a.name === 'explore' && a.layer === 'project'))

  const reg = mergeAgentRegistry(roots, {})
  const explore = reg.get('explore')!
  assert.equal(explore.layer, 'project')
  assert.equal(explore.description, 'project-explore')
  assert.ok(reg.get('my-bot'))
  assert.ok(reg.get('searcher')?.layer === 'builtin')
})

test('toggle: disabled 不可 resolve / 不在 callable', async (t) => {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-t8-tog-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  const togglePath = path.join(base, 'toggles.json')
  const roots = buildAgentDiscoverRoots({
    workspacesDir: path.join(base, 'ws'),
    projectId: 'p',
  })
  let reg = mergeAgentRegistry(roots, {})
  assert.ok(resolveFromRegistry(reg, 'explore'))

  setAgentToggle(togglePath, 'explore', true)
  reg = mergeAgentRegistry(roots, loadToggles(togglePath))
  assert.equal(resolveFromRegistry(reg, 'explore'), null)
  assert.ok(!listCallableAgents(reg).some((a) => a.name === 'explore'))
  assert.ok(listCallableAgents(reg).some((a) => a.name === 'plan'))

  // 重新启用
  setAgentToggle(togglePath, 'explore', false)
  reg = mergeAgentRegistry(roots, loadToggles(togglePath))
  assert.ok(resolveFromRegistry(reg, 'explore'))
})

test('frontmatter disabled + toggle false 强制启用', async (t) => {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-t8-fm-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  const userDir = path.join(base, 'user')
  await mkdir(userDir, { recursive: true })
  await writeFile(path.join(userDir, 'ghost.md'), `---
name: ghost
description: hidden
disabled: true
kind_preset: explore
---
ghost
`)
  const roots = buildAgentDiscoverRoots({
    workspacesDir: path.join(base, 'ws'),
    projectId: 'p',
    userAgentsDir: userDir,
  })
  let reg = mergeAgentRegistry(roots, {})
  assert.equal(resolveFromRegistry(reg, 'ghost'), null)

  const toggles = { ghost: false }
  reg = mergeAgentRegistry(roots, toggles)
  assert.ok(resolveFromRegistry(reg, 'ghost'))
})

test('ChildRunner: disabled type 拒绝 spawn', async (t) => {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-t8-run-'))
  const db = openDatabase(path.join(base, 'db.sqlite'))
  t.after(async () => {
    db.close()
    await rm(base, { recursive: true, force: true })
  })
  const store = new TaskStore(db)
  const coord = new SubagentCoordinator(new SubagentStore(db), store)
  const roots = buildAgentDiscoverRoots({
    workspacesDir: path.join(base, 'ws'),
    projectId: 'p',
  })
  const reg = mergeAgentRegistry(roots, { explore: true })
  const runner = new ChildRunner({
    coordinator: coord,
    model: new ScriptedModel([assistantReply('x')]),
    allTools: ENV_TOOLS,
    agentRegistry: reg,
    makeWorkspace: async () => new FsWorkspace({ root: path.join(base, 'ws') }),
    emit: () => {},
  })
  const task = store.createTask('p', 'g')
  const turn = store.beginTurn(task.id)
  const start = await runner.start({
    parent_task_id: task.id,
    parent_turn_id: turn,
    subagent_type: 'explore',
    description: 'no',
    prompt: 'x',
  })
  assert.equal(start.success, false)
  assert.equal(start.error_code, SUBAGENT_ERROR.TYPE_UNKNOWN)
})

test('AgentRuntime listAgentTypes', async (t) => {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-t8-rt-'))
  const db = openDatabase(path.join(base, 'db.sqlite'))
  t.after(async () => {
    db.close()
    await rm(base, { recursive: true, force: true })
  })
  const runtime = new AgentRuntime({
    store: new TaskStore(db),
    db,
    model: new ScriptedModel([assistantReply('x')]),
    sessionDir: path.join(base, 'sessions'),
    workspacesDir: path.join(base, 'ws'),
    mainTools: ENV_TOOLS,
  })
  const types = runtime.listAgentTypes('p')
  assert.ok(types.some((a) => a.name === 'explore' && a.layer === 'builtin'))
  assert.ok(runtime.listCallableAgentNames('p').includes('searcher'))
  void saveToggles
})

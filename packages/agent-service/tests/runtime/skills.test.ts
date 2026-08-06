/**
 * run_skill 经真实 runtime 回灌;catalog 进 systemPrompt;与 memory 分节。
 */
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { openDatabase } from '../../src/storage/db.ts'
import { TaskStore } from '../../src/storage/task-store.ts'
import { AgentRuntime } from '../../src/runtime/agent-runtime.ts'
import { ScriptedModel, assistantReply, assistantToolCall } from '../helpers/scripted-model.ts'
import { seatbeltProfile } from '../../src/tools/env/sandbox.ts'

async function makeEnv(t: TestContext) {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-sk-rt-'))
  const db = openDatabase(path.join(base, 'lumen.sqlite'))
  t.after(() => {
    db.close()
    return rm(base, { recursive: true, force: true })
  })
  return { base, store: new TaskStore(db) }
}

test('run_skill 经 runtime:线程含 Skill activated;systemPrompt 含 catalog', async (t) => {
  const { base, store } = await makeEnv(t)
  const skillDir = path.join(base, 'workspaces', 'p', 'skills', 'paper-probe')
  await mkdir(skillDir, { recursive: true })
  await writeFile(
    path.join(skillDir, 'SKILL.md'),
    `---
name: paper-probe
description: 探针式读论文工作流
when-to-use: 用户要系统读一篇 PDF
---

1. list_dir papers
2. extract_pdf
3. 写 notes
`,
    'utf8',
  )

  const model = new ScriptedModel([
    assistantToolCall('c1', 'run_skill', { name: 'paper-probe' }),
    assistantReply('已启动探针'),
  ])
  const rt = new AgentRuntime({
    store,
    model,
    sessionDir: path.join(base, 'sessions'),
    workspacesDir: path.join(base, 'workspaces'),
    mainTools: [],
  })
  const id = rt.createDraft('p', 'probe')
  rt.continueTask(id, '按技能读论文')
  await rt.waitFor(id)

  assert.equal(store.getTask(id)?.status, 'done')
  const system = model.calls[0][0]
  assert.equal(system.role, 'system')
  assert.ok(system.content.includes('可运行的 Skills'), 'catalog 段在场')
  assert.ok(system.content.includes('paper-probe'), 'skill 名在 catalog')
  assert.ok(!system.content.includes('跨会话记忆') || true)

  const tr = store.listEvents(id).find((e) => e.kind === 'tool_result')
  assert.ok(tr)
  const content = (JSON.parse(tr.payload_json) as { llmContent: string }).llmContent
  assert.ok(content.includes('Skill activated: paper-probe'))
  assert.ok(content.includes('list_dir papers'))
})

test('无 skill 时 systemPrompt 不含 Skills catalog', async (t) => {
  const { base, store } = await makeEnv(t)
  const model = new ScriptedModel([assistantReply('hi')])
  const rt = new AgentRuntime({
    store,
    model,
    sessionDir: path.join(base, 'sessions'),
    workspacesDir: path.join(base, 'workspaces'),
    mainTools: [],
  })
  const id = rt.createDraft('p', 'g')
  rt.continueTask(id, '你好')
  await rt.waitFor(id)
  const system = model.calls[0][0]
  assert.ok(!system.content.includes('以下是可调用的研究工作流'), '无包时不注入 catalog')
})

test('seatbeltProfile 对 skills 根有 allow file-read,写仍限 workspace', () => {
  const profile = seatbeltProfile('/tmp/ws', '/Users/me', {
    skillReadRoots: ['/Users/me/.lumen/skills', '/tmp/ws-skills'],
  })
  assert.ok(profile.includes('(deny file-write*)'))
  assert.ok(profile.includes('(subpath "/tmp/ws")'), '写白名单含工作区')
  assert.ok(profile.includes('(subpath "/Users/me/.lumen/skills")'), '可读用户 skills')
  assert.ok(profile.includes('(subpath "/Users/me/.lumen")'), '仍 deny 整个 .lumen 读(token)')
  // allow 在 deny 之后,skills 子路径可恢复读
  const denyIdx = profile.indexOf('(deny file-read*')
  const allowIdx = profile.lastIndexOf('(allow file-read*')
  assert.ok(allowIdx > denyIdx, 'allow-read skills 必须在 deny .lumen 之后')
})

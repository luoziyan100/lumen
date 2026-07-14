/**
 * 跨会话记忆(CC 范式,owner 拍板 2026-07-15):
 * 契约:memory/ 项目级、一条事实一个文件 + MEMORY.md 索引;索引开局注入系统提示词;
 *      无记忆时系统提示词零变化;文件名越狱被拒;索引注入有上限。
 */
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { openDatabase } from '../../src/storage/db.ts'
import { TaskStore } from '../../src/storage/task-store.ts'
import { AgentRuntime } from '../../src/runtime/agent-runtime.ts'
import { ScriptedModel, assistantReply, assistantToolCall } from '../helpers/scripted-model.ts'

async function makeEnv(t: TestContext) {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-mem-'))
  const db = openDatabase(path.join(base, 'lumen.sqlite'))
  t.after(() => {
    db.close()
    return rm(base, { recursive: true, force: true })
  })
  return { base, store: new TaskStore(db) }
}

function makeRuntime(base: string, store: TaskStore, model: ScriptedModel): AgentRuntime {
  return new AgentRuntime({
    store,
    model,
    sessionDir: path.join(base, 'sessions'),
    workspacesDir: path.join(base, 'workspaces'),
    mainTools: [],
  })
}

test('write_memory 落盘项目级 memory/,内容逐字;索引同步可写', async (t) => {
  const { base, store } = await makeEnv(t)
  const model = new ScriptedModel([
    assistantToolCall('c1', 'write_memory', { name: 'reading-style.md', content: '用户偏好:报告要短,先结论后论据' }),
    assistantToolCall('c2', 'write_memory', { name: 'MEMORY.md', content: '- [阅读偏好](reading-style.md) — 短报告,先结论' }),
    assistantReply('记住了'),
  ])
  const rt = makeRuntime(base, store, model)
  const id = rt.createDraft('p', 'x')
  rt.continueTask(id, '记住:我要短报告')
  await rt.waitFor(id)

  assert.equal(store.getTask(id)?.status, 'done')
  const fact = await readFile(path.join(base, 'workspaces', 'p', 'memory', 'reading-style.md'), 'utf8')
  assert.equal(fact, '用户偏好:报告要短,先结论后论据', '记忆正文逐字落盘')
  const index = await readFile(path.join(base, 'workspaces', 'p', 'memory', 'MEMORY.md'), 'utf8')
  assert.ok(index.includes('reading-style.md'))
})

test('跨会话:A 会话写的记忆,B 新会话开局注入索引且 read_memory 读得回正文', async (t) => {
  const { base, store } = await makeEnv(t)
  // 直接预置记忆文件(等价于 A 会话写过)
  const memDir = path.join(base, 'workspaces', 'p', 'memory')
  await mkdir(memDir, { recursive: true })
  await writeFile(path.join(memDir, 'MEMORY.md'), '- [阅读偏好](reading-style.md) — 短报告,先结论')
  await writeFile(path.join(memDir, 'reading-style.md'), '用户偏好:报告要短')

  const model = new ScriptedModel([
    assistantToolCall('c1', 'read_memory', { name: 'reading-style.md' }),
    assistantReply('好的,按你的偏好来'),
  ])
  const rt = makeRuntime(base, store, model)
  const id = rt.createDraft('p', 'y')
  rt.continueTask(id, '写个报告')
  await rt.waitFor(id)

  const system = model.calls[0][0]
  assert.equal(system.role, 'system')
  assert.ok(system.content.includes('跨会话记忆'), '系统提示词应带记忆索引小节')
  assert.ok(system.content.includes('reading-style.md'), '索引行在场')
  const tr = store.listEvents(id).find((e) => e.kind === 'tool_result')
  assert.ok(tr)
  assert.ok((JSON.parse(tr.payload_json) as { llmContent: string }).llmContent.includes('用户偏好:报告要短'), '正文读得回')
})

test('无记忆文件:系统提示词零变化(不出现记忆小节)', async (t) => {
  const { base, store } = await makeEnv(t)
  const model = new ScriptedModel([assistantReply('好')])
  const rt = makeRuntime(base, store, model)
  const id = rt.createDraft('p', 'z')
  rt.continueTask(id, '随便聊聊')
  await rt.waitFor(id)
  assert.ok(!model.calls[0][0].content.includes('跨会话记忆'), '无记忆时不注入')
})

test('文件名越狱被拒:../ 与路径分隔都进不来', async (t) => {
  const { base, store } = await makeEnv(t)
  const model = new ScriptedModel([
    assistantToolCall('c1', 'write_memory', { name: '../evil.md', content: '越狱' }),
    assistantToolCall('c2', 'write_memory', { name: 'a/b.md', content: '越狱' }),
    assistantReply('收到'),
  ])
  const rt = makeRuntime(base, store, model)
  const id = rt.createDraft('p', 'w')
  rt.continueTask(id, '试试')
  await rt.waitFor(id)

  const results = store.listEvents(id).filter((e) => e.kind === 'tool_result')
    .map((e) => (JSON.parse(e.payload_json) as { llmContent: string }).llmContent)
  assert.equal(results.length, 2)
  assert.ok(results.every((r) => r.startsWith('error:')), `越狱必须全拒:${results.join(' | ')}`)
  await assert.rejects(readFile(path.join(base, 'workspaces', 'p', 'evil.md'), 'utf8'), '目录外不许出现文件')
})

test('索引超限:注入截断到 200 行,不撑爆系统提示词', async (t) => {
  const { base, store } = await makeEnv(t)
  const memDir = path.join(base, 'workspaces', 'p', 'memory')
  await mkdir(memDir, { recursive: true })
  const lines = Array.from({ length: 300 }, (_, i) => `- [记忆${i}](m${i}.md) — 钩子${i}`)
  await writeFile(path.join(memDir, 'MEMORY.md'), lines.join('\n'))

  const model = new ScriptedModel([assistantReply('好')])
  const rt = makeRuntime(base, store, model)
  const id = rt.createDraft('p', 'v')
  rt.continueTask(id, '聊聊')
  await rt.waitFor(id)

  const system = model.calls[0][0].content
  assert.ok(system.includes('记忆0'), '开头行在')
  assert.ok(system.includes('记忆199'), '第 200 行在')
  assert.ok(!system.includes('记忆250'), '超限行必须被截断')
})

/**
 * B2 公网 demo 安全加固(2026-07-15 审计):路径穿越消毒 / demo 关 run_code / 上传限流。
 * 契约:本地(非 demo)行为零变化;恶意 projectId 写不出工作区;demo 下 run_code 不可用。
 */
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readdir, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { openDatabase } from '../../src/storage/db.ts'
import { TaskStore } from '../../src/storage/task-store.ts'
import { AgentRuntime, sanitizeWorkspaceId } from '../../src/runtime/agent-runtime.ts'
import { createService } from '../../src/service.ts'
import { ScriptedModel, assistantReply, assistantToolCall } from '../helpers/scripted-model.ts'
import type { ServerMessage } from '../../src/protocol/messages.ts'

test('sanitizeWorkspaceId:合法标识逐字不变;穿越/分隔符被消毒', () => {
  assert.equal(sanitizeWorkspaceId('default'), 'default')
  assert.equal(sanitizeWorkspaceId('task-1a2b3c4d-5e6f'), 'task-1a2b3c4d-5e6f')
  assert.equal(sanitizeWorkspaceId('client_abc123'), 'client_abc123')
  assert.ok(!sanitizeWorkspaceId('../../etc').includes('/'), '路径分隔必须消掉')
  assert.ok(!sanitizeWorkspaceId('../../etc').includes('.'), '点必须消掉')
  assert.equal(sanitizeWorkspaceId(''), 'default', '空回退 default')
  assert.equal(sanitizeWorkspaceId('a'.repeat(200)).length, 64, '截断 64')
})

test('恶意 projectId 无法写出工作区外', async (t: TestContext) => {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-hard-'))
  const db = openDatabase(path.join(base, 'lumen.sqlite'))
  t.after(() => { db.close(); return rm(base, { recursive: true, force: true }) })
  const rt = new AgentRuntime({
    store: new TaskStore(db), model: new ScriptedModel([]),
    sessionDir: path.join(base, 'sessions'), workspacesDir: path.join(base, 'workspaces'), mainTools: [],
  })
  // 尝试用 ../ 穿越写文件
  await rt.saveUpload('../../../escape', 'evil.pdf', new Uint8Array([1, 2, 3]))
  // base 的父目录里不该冒出 escape 相关文件;文件应落在 workspaces 下消毒后的目录
  const parent = path.dirname(base)
  const siblings = await readdir(parent)
  assert.ok(!siblings.some((n) => n.includes('escape')), `穿越写到了工作区外:${siblings.filter((n) => n.includes('escape')).join(',')}`)
  const wsDirs = await readdir(path.join(base, 'workspaces'))
  assert.ok(wsDirs.some((d) => d.includes('escape')), '文件应落在消毒后的工作区子目录内')
})

test('demo 模式:run_code 不在工具集,模型调用得到 unknown tool', async (t: TestContext) => {
  const home = await mkdtemp(path.join(tmpdir(), 'lumen-demo-'))
  const model = new ScriptedModel([
    assistantToolCall('c1', 'run_code', { language: 'python', code: 'print(1)' }),
    assistantReply('跑不了'),
  ])
  const service = createService({ home, port: 0, demo: true, modelPort: model })
  const handle = await service.start()
  t.after(async () => { await service.runtime.drain(); await handle.close(); await rm(home, { recursive: true, force: true }) })

  const id = service.runtime.submit({ projectId: 'p', userText: '跑段代码' })
  await service.runtime.waitFor(id)
  const tr = service.runtime.listEvents(id).find((e) => e.kind === 'tool_result')
  assert.ok(tr, '应有 tool_result')
  assert.match((JSON.parse(tr.payload_json) as { llmContent: string }).llmContent, /unknown tool/, 'demo 下 run_code 必须不可用')
})

test('非 demo:run_code 正常在工具集(回归:本地行为不变)', async (t: TestContext) => {
  const home = await mkdtemp(path.join(tmpdir(), 'lumen-nodemo-'))
  const model = new ScriptedModel([
    assistantToolCall('c1', 'run_code', { language: 'python', code: 'print(1)' }),
    assistantReply('好'),
  ])
  const service = createService({ home, port: 0, modelPort: model }) // 不传 demo
  const handle = await service.start()
  t.after(async () => { await service.runtime.drain(); await handle.close(); await rm(home, { recursive: true, force: true }) })
  const id = service.runtime.submit({ projectId: 'p', userText: '跑代码' })
  await service.runtime.waitFor(id)
  const tr = service.runtime.listEvents(id).find((e) => e.kind === 'tool_result')
  assert.ok(tr)
  assert.doesNotMatch((JSON.parse(tr.payload_json) as { llmContent: string }).llmContent, /unknown tool/, 'run_code 应可用')
})

test('上传超限:/upload 超过 maxUploadBytes 返回 413,文件不落盘', async (t: TestContext) => {
  const home = await mkdtemp(path.join(tmpdir(), 'lumen-up-'))
  const service = createService({ home, port: 0, maxUploadBytes: 100, modelPort: new ScriptedModel([]) })
  const handle = await service.start()
  t.after(async () => { await service.runtime.drain(); await handle.close(); await rm(home, { recursive: true, force: true }) })

  const res = await fetch(`http://127.0.0.1:${handle.port}/upload?project=p&name=big.pdf`, {
    method: 'POST', body: new Uint8Array(500), // 500 > 100 上限
  })
  assert.equal(res.status, 413, '超限应 413')
  // 工作区不该出现该文件
  await assert.rejects(access(path.join(home, 'workspaces', 'p', 'papers', 'big.pdf')), '超限文件不许落盘')
})

test('上传未超限:正常落盘(回归)', async (t: TestContext) => {
  const home = await mkdtemp(path.join(tmpdir(), 'lumen-up2-'))
  const service = createService({ home, port: 0, modelPort: new ScriptedModel([]) })
  const handle = await service.start()
  t.after(async () => { await service.runtime.drain(); await handle.close(); await rm(home, { recursive: true, force: true }) })
  const res = await fetch(`http://127.0.0.1:${handle.port}/upload?project=p&name=ok.pdf`, {
    method: 'POST', body: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
  })
  assert.equal(res.status, 200)
  const body = await res.json() as { path: string }
  assert.equal(body.path, 'papers/ok.pdf')
})

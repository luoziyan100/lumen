import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { openDatabase } from '../../src/storage/db.ts'
import { TaskStore } from '../../src/storage/task-store.ts'
import { AgentRuntime } from '../../src/runtime/agent-runtime.ts'
import { ENV_TOOLS } from '../../src/tools/env/fs-tools.ts'
import { ScriptedModel } from '../helpers/scripted-model.ts'

async function makeEnv(t: TestContext) {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-sw-'))
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
    mainTools: ENV_TOOLS,
  })
}

test('会话工作区隔离(owner 拍板 2026-07-05):带 taskId 的上传/列表/读取互不可见,落盘在 sessions/<taskId>/', async (t) => {
  const { base, store } = await makeEnv(t)
  const rt = makeRuntime(base, store, new ScriptedModel([]))
  const bytes = new Uint8Array([1, 2, 3])

  await rt.saveUpload('p', 'a.pdf', bytes, 't1')
  await rt.saveUpload('p', 'b.pdf', bytes, 't2')

  assert.deepEqual((await rt.listAssets('p', 't1')).map((a) => a.name), ['a.pdf'], 't1 只见自己的文件')
  assert.deepEqual((await rt.listAssets('p', 't2')).map((a) => a.name), ['b.pdf'], 't2 只见自己的文件')
  assert.ok(
    existsSync(path.join(base, 'workspaces', 'p', 'sessions', 't1', 'papers', 'a.pdf')),
    '落盘路径 = workspaces/<project>/sessions/<taskId>/papers/',
  )
  assert.deepEqual(await rt.listAssets('p'), [], '项目根(旧语义,不带 taskId)看不到会话内文件')

  await rt.saveUpload('p', 'n.md', new TextEncoder().encode('# t1 笔记'), 't1')
  assert.match((await rt.readAsset('p', 'docs/n.md', 't1')) ?? '', /t1 笔记/)
  assert.equal(await rt.readAsset('p', 'docs/n.md', 't2'), null, '跨会话读取被隔离')
  assert.equal(await rt.readAssetBytes('p', 'papers/a.pdf', 't2'), null, '二进制取件同样隔离')
})

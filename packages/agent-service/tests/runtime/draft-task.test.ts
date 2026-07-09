/**
 * 草稿会话(create_task/createDraft):新对话先上传文件的支撑。
 * 契约:建档不开跑(queued)→ 上传归入该会话工作区 → 首条消息 continueTask 正常续跑出回复。
 */
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { openDatabase } from '../../src/storage/db.ts'
import { TaskStore } from '../../src/storage/task-store.ts'
import { AgentRuntime } from '../../src/runtime/agent-runtime.ts'
import { ENV_TOOLS } from '../../src/tools/env/fs-tools.ts'
import { ScriptedModel, assistantReply } from '../helpers/scripted-model.ts'

async function makeEnv(t: TestContext) {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-draft-'))
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

test('createDraft:建档不开跑;上传即归入该会话工作区', async (t) => {
  const { base, store } = await makeEnv(t)
  const rt = makeRuntime(base, store, new ScriptedModel([]))

  const id = rt.createDraft('p', 'paper.pdf')
  assert.equal(store.getTask(id)?.status, 'queued', '草稿=queued,不自动开跑')
  assert.equal(rt.isRunning(id), false)

  assert.equal(await rt.saveUpload('p', 'paper.pdf', new Uint8Array([0x25, 0x50]), id), 'papers/paper.pdf')
  const assets = await rt.listAssets('p', id)
  assert.deepEqual(assets.map((a) => a.name), ['paper.pdf'], '不发消息也能在会话工作区看到文件')
})

test('草稿会话的首条消息走 continueTask:正常续跑出回复', async (t) => {
  const { base, store } = await makeEnv(t)
  const model = new ScriptedModel([assistantReply('读到了')])
  const rt = makeRuntime(base, store, model)

  const id = rt.createDraft('p', 'paper.pdf')
  assert.equal(rt.continueTask(id, '这篇讲什么?'), true, '草稿可 continue')
  await rt.waitFor(id)

  const kinds = rt.listEvents(id).map((e) => e.kind)
  assert.ok(kinds.includes('user'), `事件流缺 user:${kinds.join(',')}`)
  assert.ok(kinds.includes('reply'), `事件流缺 reply:${kinds.join(',')}`)
  const status = store.getTask(id)?.status
  assert.ok(status === 'done' || status === 'succeeded', `终态应为完成,实际 ${status}`)
})

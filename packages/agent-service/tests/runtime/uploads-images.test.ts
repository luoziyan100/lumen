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
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-up-'))
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

test('saveUpload 按类型归位:pdf→papers/ md→docs/ png→images/ docx→uploads/', async (t) => {
  const { base, store } = await makeEnv(t)
  const rt = makeRuntime(base, store, new ScriptedModel([]))
  const bytes = new Uint8Array([1, 2, 3])
  assert.equal(await rt.saveUpload('p', 'paper.pdf', bytes), 'papers/paper.pdf')
  assert.equal(await rt.saveUpload('p', 'note.md', bytes), 'docs/note.md')
  assert.equal(await rt.saveUpload('p', 'fig.PNG', bytes), 'images/fig.PNG')
  assert.equal(await rt.saveUpload('p', 'report.docx', bytes), 'uploads/report.docx')
  assert.equal(await rt.saveUpload('p', '../..//evil.pdf', bytes), 'papers/evil.pdf', '路径穿越被剥掉')

  const assets = await rt.listAssets('p')
  const kinds = Object.fromEntries(assets.map((a) => [a.name, a.kind]))
  assert.equal(kinds['paper.pdf'], 'pdf')
  assert.equal(kinds['note.md'], 'doc')
  assert.equal(kinds['fig.PNG'], 'image')
  assert.equal(kinds['report.docx'], 'file')
})

test('submit 带图:模型第一轮就看到 user 消息上的 images(经真实 runtime)', async (t) => {
  const { base, store } = await makeEnv(t)
  const model = new ScriptedModel([assistantReply('看到了')])
  const rt = makeRuntime(base, store, model)
  const img = { mediaType: 'image/png', base64: 'QUJD' }

  const taskId = rt.submit({ projectId: 'p', userText: '看下这张图', images: [img] })
  await rt.waitFor(taskId)

  const firstCall = model.calls[0]
  const user = firstCall.find((m) => m.role === 'user')
  assert.equal(user?.images?.length, 1)
  assert.equal(user?.images?.[0].base64, 'QUJD')

  // 图片持久化进 user 事件,重建(continue/resume)不丢
  const userEvent = store.listEvents(taskId).find((e) => e.kind === 'user')
  const payload = JSON.parse(userEvent!.payload_json) as { images?: Array<{ base64: string }> }
  assert.equal(payload.images?.[0].base64, 'QUJD')
})

test('continue 带图:第二轮 user 消息带图,重建线程后模型看得见', async (t) => {
  const { base, store } = await makeEnv(t)
  const model = new ScriptedModel([assistantReply('第一轮'), assistantReply('第二轮,看到图了')])
  const rt = makeRuntime(base, store, model)

  const taskId = rt.submit({ projectId: 'p', userText: '先聊两句' })
  await rt.waitFor(taskId)

  const img = { mediaType: 'image/jpeg', base64: 'REVG' }
  assert.ok(rt.continueTask(taskId, '这张呢?', [img]))
  await rt.waitFor(taskId)

  const secondCall = model.calls[1]
  const users = secondCall.filter((m) => m.role === 'user')
  const last = users[users.length - 1]
  assert.equal(last?.content, '这张呢?')
  assert.equal(last?.images?.[0].base64, 'REVG', '重建线程必须带回第二轮的图')
})

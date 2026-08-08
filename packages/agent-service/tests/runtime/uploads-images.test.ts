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

test('saveUpload 按表示分类:pdf→papers/ 文本脚本→docs/ 图→images/ 未知→uploads/', async (t) => {
  const { base, store } = await makeEnv(t)
  const rt = makeRuntime(base, store, new ScriptedModel([]))
  const bytes = new Uint8Array([1, 2, 3])
  const tid = 't-up'
  assert.equal((await rt.saveUpload('p', 'paper.pdf', bytes, tid)).path, 'papers/paper.pdf')
  assert.equal((await rt.saveUpload('p', 'note.md', bytes, tid)).path, 'docs/note.md')
  assert.equal((await rt.saveUpload('p', 'setup.sh', bytes, tid)).path, 'docs/setup.sh')
  assert.equal((await rt.saveUpload('p', 'probe.py', bytes, tid)).path, 'docs/probe.py')
  assert.equal((await rt.saveUpload('p', 'fig.PNG', bytes, tid)).path, 'images/fig.PNG')
  assert.equal((await rt.saveUpload('p', 'report.docx', bytes, tid)).path, 'uploads/report.docx')
  // 坏 zip 不阻断落盘;好 docx 另测 docs/*.md
  assert.equal((await rt.saveUpload('p', 'blob', bytes, tid)).path, 'uploads/blob', '无扩展名 → opaque uploads/')
  assert.equal((await rt.saveUpload('p', '../..//evil.pdf', bytes, tid)).path, 'papers/evil.pdf', '路径穿越被剥掉')

  const assets = await rt.listAssets('p', tid)
  const kinds = Object.fromEntries(assets.map((a) => [a.name, a.kind]))
  assert.equal(kinds['paper.pdf'], 'pdf')
  assert.equal(kinds['note.md'], 'doc')
  assert.equal(kinds['setup.sh'], 'doc')
  assert.equal(kinds['probe.py'], 'doc')
  assert.equal(kinds['fig.PNG'], 'image')
  assert.equal(kinds['report.docx'], 'file')
  assert.equal(kinds['blob'], 'file')
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
  // 多备几条:侧栏 title 异步也会调同一 model
  const model = new ScriptedModel([
    assistantReply('第一轮'),
    assistantReply('第二轮,看到图了'),
    assistantReply('标题'),
    assistantReply('标题'),
  ])
  const rt = makeRuntime(base, store, model)

  const taskId = rt.submit({ projectId: 'p', userText: '先聊两句' })
  await rt.waitFor(taskId)

  const img = { mediaType: 'image/jpeg', base64: 'REVG' }
  assert.ok(rt.continueTask(taskId, '这张呢?', [img]))
  await rt.waitFor(taskId)

  const continueCall = model.calls.find((msgs) =>
    msgs.some((m) => m.role === 'user' && m.content === '这张呢?'))
  assert.ok(continueCall, '应有含「这张呢?」的模型调用')
  const last = continueCall.filter((m) => m.role === 'user').at(-1)
  assert.equal(last?.images?.[0].base64, 'REVG', '重建线程必须带回第二轮的图')
})

test('submit 带 uploads:模型 user.content 含附言;事件 payload 存 uploads 不把附言写入 content', async (t) => {
  const { base, store } = await makeEnv(t)
  const model = new ScriptedModel([assistantReply('收到 paper.pdf'), assistantReply('标题')])
  const rt = makeRuntime(base, store, model)
  const uploads = [{ name: 'paper.pdf', path: 'papers/paper.pdf' }]

  const taskId = rt.submit({ projectId: 'p', userText: '', uploads })
  await rt.waitFor(taskId)

  const user = model.calls[0].find((m) => m.role === 'user')
  assert.match(String(user?.content), /paper\.pdf/)
  assert.match(String(user?.content), /papers\/paper\.pdf/)
  assert.match(String(user?.content), /extract_pdf/)

  const payload = JSON.parse(store.listEvents(taskId).find((e) => e.kind === 'user')!.payload_json) as {
    content: string
    uploads?: Array<{ path: string }>
  }
  assert.equal(payload.content, '', '展示正文不含附言')
  assert.equal(payload.uploads?.[0]?.path, 'papers/paper.pdf')
})

test('continue 带 uploads:重建后模型仍见附言', async (t) => {
  const { base, store } = await makeEnv(t)
  const model = new ScriptedModel([
    assistantReply('ok'),
    assistantReply('看到 zip'),
    assistantReply('标题'),
    assistantReply('标题'),
  ])
  const rt = makeRuntime(base, store, model)

  const taskId = rt.submit({ projectId: 'p', userText: '先聊' })
  await rt.waitFor(taskId)

  assert.ok(rt.continueTask(taskId, '解一下', undefined, undefined, [
    { name: 'data.zip', path: 'uploads/data.zip' },
  ]))
  await rt.waitFor(taskId)

  const continueCall = model.calls.find((msgs) =>
    msgs.some((m) => m.role === 'user' && String(m.content).includes('data.zip')))
  assert.ok(continueCall, '续跑线程应含 zip 附言')
  const lastUser = continueCall.filter((m) => m.role === 'user').at(-1)
  assert.match(String(lastUser?.content), /解一下/)
  assert.match(String(lastUser?.content), /未做文本抽取|压缩包/)
})

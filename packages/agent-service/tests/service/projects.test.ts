/**
 * Projects M1:list_projects / create_project + 双项目会话/shared 隔离(真服务+真 WS)。
 */
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { createService, type Service } from '../../src/service.ts'
import type { ServerMessage } from '../../src/protocol/messages.ts'
import { ScriptedModel, assistantReply } from '../helpers/scripted-model.ts'

interface Rig { service: Service; port: number; sockets: WebSocket[] }
async function rig(t: TestContext): Promise<Rig> {
  const home = await mkdtemp(path.join(tmpdir(), 'lumen-proj-'))
  const service = createService({
    home,
    port: 0,
    buildModel: () => new ScriptedModel([assistantReply('ok'), assistantReply('ok')]),
    modelPort: new ScriptedModel([assistantReply('ok'), assistantReply('ok'), assistantReply('ok')]),
  })
  const handle = await service.start()
  const sockets: WebSocket[] = []
  t.after(async () => {
    await Promise.all(sockets.map((ws) => new Promise<void>((r) => {
      if (ws.readyState === WebSocket.CLOSED) return r()
      ws.addEventListener('close', () => r(), { once: true }); ws.close(); setTimeout(r, 500)
    })))
    await service.runtime.drain(); await handle.close(); await rm(home, { recursive: true, force: true })
  })
  return { service, port: handle.port, sockets }
}
interface Buf { msgs: ServerMessage[]; waiters: Array<{ pred: (m: ServerMessage) => boolean; resolve: (v: ServerMessage[]) => void }> }
const bufs = new WeakMap<WebSocket, Buf>()
function connect(r: Rig): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${r.port}/`); r.sockets.push(ws)
  const buf: Buf = { msgs: [], waiters: [] }; bufs.set(ws, buf)
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(String((ev as MessageEvent).data)) as ServerMessage; buf.msgs.push(m)
    for (const w of buf.waiters.splice(0)) { if (w.pred(m)) w.resolve(buf.msgs.slice()); else buf.waiters.push(w) }
  })
  return new Promise((resolve) => ws.addEventListener('open', () => resolve(ws), { once: true }))
}
/** 只等「从现在起」的新消息,不误吃缓冲里的旧同型消息 */
function until(ws: WebSocket, pred: (m: ServerMessage) => boolean, ms = 4000): Promise<ServerMessage[]> {
  const buf = bufs.get(ws)!
  const from = buf.msgs.length
  return new Promise((resolve, reject) => {
    const wrapped = {
      pred: (m: ServerMessage) => {
        // waiter 在 push 之后触发;只认 from 之后出现的匹配
        const slice = buf.msgs.slice(from)
        return slice.some(pred) && pred(m)
      },
      resolve: () => resolve(buf.msgs.slice(from)),
    }
    buf.waiters.push(wrapped)
    setTimeout(() => {
      const i = buf.waiters.indexOf(wrapped)
      if (i >= 0) {
        buf.waiters.splice(i, 1)
        reject(new Error('until 超时:' + buf.msgs.slice(from).map((m) => m.type).join(',')))
      }
    }, ms)
  })
}

test('create_project 可带 sourcePath', async (t: TestContext) => {
  const r = await rig(t)
  const ws = await connect(r)
  await until(ws, (m) => m.type === 'hello')
  const folder = await mkdtemp(path.join(tmpdir(), 'lumen-src-'))
  t.after(async () => { await rm(folder, { recursive: true, force: true }) })

  const created = until(ws, (m) => m.type === 'project_created')
  ws.send(JSON.stringify({ type: 'create_project', name: '绑盘项目', sourcePath: folder }))
  const proj = ((await created).find((m) => m.type === 'project_created') as {
    project: { name: string; source_path: string | null }
  }).project
  assert.equal(proj.name, '绑盘项目')
  assert.equal(proj.source_path, folder)
})

test('create_project 不抹掉 default 里已有会话', async (t: TestContext) => {
  const r = await rig(t)
  const ws = await connect(r)
  await until(ws, (m) => m.type === 'hello')

  const created = until(ws, (m) => m.type === 'task_created')
  ws.send(JSON.stringify({ type: 'create_task', projectId: 'default', goal: '旧历史会话' }))
  await created

  const mk = until(ws, (m) => m.type === 'project_created')
  ws.send(JSON.stringify({ type: 'create_project', name: '113' }))
  await mk

  bufs.get(ws)!.msgs.length = 0
  const listed = until(ws, (m) => m.type === 'tasks')
  ws.send(JSON.stringify({ type: 'list', projectId: 'default' }))
  const tasks = ((await listed).find((m) => m.type === 'tasks') as { tasks: Array<{ goal: string }> }).tasks
  assert.ok(tasks.some((x) => x.goal === '旧历史会话'), '建新项目后 default 历史必须仍在')
})

test('list_projects 含隐形 default;create_project 后可见', async (t: TestContext) => {
  const r = await rig(t)
  const ws = await connect(r)
  await until(ws, (m) => m.type === 'hello')

  const listed = until(ws, (m) => m.type === 'projects')
  ws.send(JSON.stringify({ type: 'list_projects' }))
  const projectsMsg = (await listed).find((m) => m.type === 'projects') as { projects: Array<{ id: string; name: string }> }
  assert.ok(projectsMsg.projects.some((p) => p.id === 'default'), '必须有 default')

  const created = until(ws, (m) => m.type === 'project_created')
  ws.send(JSON.stringify({ type: 'create_project', name: '论文 A' }))
  const proj = ((await created).find((m) => m.type === 'project_created') as { project: { id: string; name: string } }).project
  assert.equal(proj.name, '论文 A')
  assert.match(proj.id, /^p-/)

  const listed2 = until(ws, (m) => m.type === 'projects' && m.projects.some((p) => p.id === proj.id))
  ws.send(JSON.stringify({ type: 'list_projects' }))
  const again = (await listed2).filter((m) => m.type === 'projects').pop() as { projects: Array<{ id: string }> }
  assert.ok(again.projects.some((p) => p.id === proj.id))
})

test('双项目:会话 list 隔离;shared 上传仅本项目可见', async (t: TestContext) => {
  const r = await rig(t)
  const ws = await connect(r)
  await until(ws, (m) => m.type === 'hello')

  const mk = async (name: string) => {
    const p = until(ws, (m) => m.type === 'project_created')
    ws.send(JSON.stringify({ type: 'create_project', name }))
    return ((await p).find((m) => m.type === 'project_created') as { project: { id: string } }).project.id
  }
  const a = await mk('项目A')
  const b = await mk('项目B')

  // A 建会话
  const createdA = until(ws, (m) => m.type === 'task_created')
  ws.send(JSON.stringify({ type: 'create_task', projectId: a, goal: 'A 会话' }))
  const taskA = ((await createdA).find((m) => m.type === 'task_created') as { taskId: string }).taskId

  // B 建会话
  const createdB = until(ws, (m) => m.type === 'task_created')
  ws.send(JSON.stringify({ type: 'create_task', projectId: b, goal: 'B 会话' }))
  await createdB

  // 清空缓冲后再 list,避免误吃到其它响应
  bufs.get(ws)!.msgs.length = 0
  const listA = until(ws, (m) => m.type === 'tasks')
  ws.send(JSON.stringify({ type: 'list', projectId: a }))
  const tasksA = ((await listA).find((m) => m.type === 'tasks') as { tasks: Array<{ id: string; goal: string; project_id?: string }> }).tasks
  assert.deepEqual(tasksA.map((x) => x.goal), ['A 会话'], `A 应只有自己的会话,got ${JSON.stringify(tasksA)}`)

  // shared 上传到 A
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]) // %PDF
  const u = new URL(`http://127.0.0.1:${r.port}/upload`)
  u.searchParams.set('project', a)
  u.searchParams.set('name', 'paper.pdf')
  u.searchParams.set('scope', 'shared')
  const res = await fetch(u.toString(), { method: 'POST', body: pdf })
  assert.equal(res.status, 200)
  const { path: saved } = await res.json() as { path: string }
  assert.equal(saved, 'shared/papers/paper.pdf')

  const assetsA = until(ws, (m) => m.type === 'assets')
  ws.send(JSON.stringify({ type: 'list_assets', projectId: a, taskId: taskA }))
  const aa = ((await assetsA).find((m) => m.type === 'assets') as { assets: Array<{ path: string; scope?: string }> }).assets
  assert.ok(aa.some((x) => x.path === 'shared/papers/paper.pdf' && x.scope === 'shared'))

  // B 会话看不到 A 的 shared
  const listB = until(ws, (m) => m.type === 'tasks')
  ws.send(JSON.stringify({ type: 'list', projectId: b }))
  const tasksB = ((await listB).find((m) => m.type === 'tasks') as { tasks: Array<{ id: string }> }).tasks
  const taskB = tasksB[0]!.id
  const assetsB = until(ws, (m) => m.type === 'assets')
  ws.send(JSON.stringify({ type: 'list_assets', projectId: b, taskId: taskB }))
  const ab = ((await assetsB).find((m) => m.type === 'assets') as { assets: Array<{ path: string }> }).assets
  assert.ok(!ab.some((x) => x.path.includes('paper.pdf')), 'B 不可见 A 的 shared PDF')

  const bytes = await r.service.runtime.readAssetBytes(a, 'shared/papers/paper.pdf', taskA)
  assert.ok(bytes && bytes[0] === 0x25)

  // 无 taskId = 新对话:只见 shared,不见会话产物
  bufs.get(ws)!.msgs.length = 0
  const bare = until(ws, (m) => m.type === 'assets')
  ws.send(JSON.stringify({ type: 'list_assets', projectId: a }))
  const bareAssets = ((await bare).find((m) => m.type === 'assets') as {
    assets: Array<{ path: string; scope?: string }>
  }).assets
  assert.ok(bareAssets.every((x) => x.scope === 'shared' || x.path.startsWith('shared/')),
    '无 taskId 不得冒充 session 文件')
  assert.ok(bareAssets.some((x) => x.path === 'shared/papers/paper.pdf'))
})

test('rename_project / archive_project:改名可见,归档后 list 排除', async (t: TestContext) => {
  const r = await rig(t)
  const ws = await connect(r)
  await until(ws, (m) => m.type === 'hello')

  const created = until(ws, (m) => m.type === 'project_created')
  ws.send(JSON.stringify({ type: 'create_project', name: '旧名' }))
  const proj = ((await created).find((m) => m.type === 'project_created') as {
    project: { id: string; name: string }
  }).project

  const renamed = until(ws, (m) => m.type === 'project_updated')
  ws.send(JSON.stringify({ type: 'rename_project', projectId: proj.id, name: '新名' }))
  const updated = ((await renamed).find((m) => m.type === 'project_updated') as {
    project: { id: string; name: string }
  }).project
  assert.equal(updated.id, proj.id)
  assert.equal(updated.name, '新名')

  bufs.get(ws)!.msgs.length = 0
  const listed = until(ws, (m) => m.type === 'projects')
  ws.send(JSON.stringify({ type: 'list_projects' }))
  const projects = ((await listed).find((m) => m.type === 'projects') as {
    projects: Array<{ id: string; name: string }>
  }).projects
  assert.ok(projects.some((p) => p.id === proj.id && p.name === '新名'))

  const archived = until(ws, (m) => m.type === 'ok')
  ws.send(JSON.stringify({ type: 'archive_project', projectId: proj.id }))
  await archived

  bufs.get(ws)!.msgs.length = 0
  const listed2 = until(ws, (m) => m.type === 'projects')
  ws.send(JSON.stringify({ type: 'list_projects' }))
  const again = ((await listed2).find((m) => m.type === 'projects') as {
    projects: Array<{ id: string }>
  }).projects
  assert.ok(!again.some((p) => p.id === proj.id), '归档后不得再出现在 list_projects')

  // default 不可归档
  const bad = until(ws, (m) => m.type === 'error')
  ws.send(JSON.stringify({ type: 'archive_project', projectId: 'default' }))
  const err = ((await bad).find((m) => m.type === 'error') as { message: string }).message
  assert.match(err, /archive failed/)
})

/**
 * [INPUT]: the real HTTP service (Controller, LibSQL, catalog.sqlite, diagnostics.sqlite, files); only the model network is the fixture provider
 * [OUTPUT]: R18–R20 evidence: topic and conversation deletion leave nothing behind per the L2 survey (every table of the three databases, every path),
 *           running/waiting refusals, the resumable deletion across a restart, archive, rename and untitled conversations
 * [POS]: the lifecycle acceptance suite; it seeds every writer a conversation can reach (board, files, topic memory, tasks, a writable specialist,
 *        sediment offer, reading, receipt, diagnostics case) so a store the deletion forgets shows up as a leftover row
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createHttpService } from '../../src/server.ts'
import { SPECIALISTS_STATE } from '../../src/agents/resume/index.ts'
import { fixtureProvider, textReply, toolReply, type ProviderRequest } from '../provider-fixture.ts'
import { ensureTopic } from '../topic-fixture.ts'

const token = 'lifecycle-token-at-least-24-characters'
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

function gate() {
  let open!: () => void
  const promise = new Promise<void>(resolve => { open = resolve })
  return { promise, open }
}
async function until(check: () => boolean | Promise<boolean>, message: string, ms = 15000) {
  const limit = Date.now() + ms
  while (!await check()) {
    if (Date.now() > limit) throw new Error(message)
    await delay(20)
  }
}

// ---- The model: 全做一遍 drives every writer once; 等一下 holds until the gate opens; 问我 waits on the user; a specialist writes one file ----
function model(hold = gate()) {
  let n = 0
  const call = (name: string, args: unknown) => toolReply(name, args, `c${++n}`)
  const entered = gate()
  const fixture = fixtureProvider(async (request: ProviderRequest) => {
    const tools = request.tools?.map(tool => tool.function.name) ?? []
    const results = request.messages.filter(message => message.role === 'tool').length
    if (!tools.some(name => name.startsWith('agent-'))) return results ? textReply('SPECIALIST_DONE') : call('write_file', { path: 'out.md', content: 'specialist output' })
    const last = JSON.stringify(request.messages.filter(message => message.role === 'user').at(-1) ?? '')
    if (last.includes('问我')) return results ? textReply('好') : call('ask_user', { question: '先看哪一段？' })
    if (last.includes('等一下')) { entered.open(); await hold.promise; return textReply('等到了') }
    if (!last.includes('全做一遍')) return textReply('好')
    const steps = [
      () => call('board_draw', { title: '反馈', elements: [{ type: 'text', x: 0, y: 0, text: '输出回头压住输入' }] }),
      () => call('write_file', { path: 'notes.md', content: 'topic work file' }),
      () => call('write_memory', { scope: 'topic', name: 'fact.md', content: 'a topic fact' }),
      () => call('task_write', { tasks: [{ id: 'r', content: '读', status: 'pending', activeForm: '在读' }] }),
      () => call('agent-general-purpose', { prompt: '写一份文件' }),
      () => call('sediment_quote', { text: '全做一遍' }),
    ]
    return steps[results]?.() ?? textReply('都做完了')
  })
  return { fixture, hold, entered }
}

async function service(dataRoot: string, fixture: ReturnType<typeof fixtureProvider>, afterMemory?: () => void) {
  const http = await createHttpService({ dataRoot, token, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch }, deletion: { afterMemory } })
  const request = (path: string, init: RequestInit = {}) => http.app.request(path, { ...init, headers })
  return { http, request, studio: http.application.studio,
    json: async (path: string, init: RequestInit = {}) => { const response = await request(path, init); return { status: response.status, body: response.status === 204 ? null : await response.json() } },
    open: (topic: string, task: string) => request(`/lumen/topics/${topic}/sessions`, { method: 'POST', body: JSON.stringify({ taskId: task }) }),
    send: (resourceId: string, message: string) => request(`/api/agent-controller/lumen/sessions/${encodeURIComponent(resourceId)}/messages`, { method: 'POST', body: JSON.stringify({ message }) }),
    stop: (resourceId: string) => request(`/api/agent-controller/lumen/sessions/${encodeURIComponent(resourceId)}/abort`, { method: 'POST', body: '{}' }),
    states: () => http.application.liveSessionStates(),
    /** HTTP send answers once the run is accepted; this resolves when the run ends (a wait on the user ends it too) */
    async turn(topicId: string, taskId: string, message: string) {
      const session = await http.application.session(topicId, taskId)
      const ended = new Promise<void>(resolve => { const off = session.subscribe(event => { if (event.type === 'agent_end') { off(); resolve() } }) })
      const response = await request(`/api/agent-controller/lumen/sessions/${encodeURIComponent(`${topicId}:${taskId}`)}/messages`, { method: 'POST', body: JSON.stringify({ message }) })
      assert.equal(response.status, 200, `${topicId}:${taskId} ${message}`)
      await ended
      return session
    },
  }
}
type Service = Awaited<ReturnType<typeof service>>

/** Two conversations with messages, traces, a diagnostics case and a receipt each; the board, a reading, takeaways, an offer, a reference and topic files. */
async function seed(env: Service, topicId: string, itemId: string) {
  ensureTopic(env.http, topicId, `主题 ${topicId}`)
  env.studio.topics.reference(topicId, itemId)
  for (const [task, message] of [['a', '全做一遍'], ['b', '你好']] as const) {
    assert.equal((await env.open(topicId, task)).status, 201)
    await env.turn(topicId, task, message)
  }
  env.studio.readings.write(topicId, itemId, { title: '笔记', paragraphs: [{ text: '大脑预测。', source: { kind: 'inference' } }] }, { threadId: `${topicId}:a`, runId: 'r1' })
  env.studio.sediment.create(topicId, { text: '我自己的话', origin: 'typed' })
  await env.http.application.diagnostics.flush()
  for (const task of ['a', 'b']) {
    const traces = await env.json(`/lumen/diagnostics/traces?topicId=${topicId}&taskId=${task}`)
    assert.ok(traces.body.total > 0, `${topicId}:${task} 没有 trace`)
    assert.equal((await env.json(`/lumen/diagnostics/cases?topicId=${topicId}&taskId=${task}`, { method: 'POST', body: JSON.stringify({ actual: '答偏了', expected: '答准', traceId: traces.body.items[0].traceId }) })).status, 201)
    const last = await env.http.application.memory.recall({ threadId: `${topicId}:${task}`, resourceId: `${topicId}:${task}`, perPage: 50, page: 0 })
    assert.equal((await env.json(`/lumen/topics/${topicId}/sessions/${task}/read`, { method: 'POST', body: JSON.stringify({ messageId: last.messages.at(-1)!.id }) })).status, 200)
  }
  assert.equal(env.studio.sediment.list(topicId).offers.length, 1, '没有报价单')
}

// ---- The L2 survey as a check: every row of every table that mentions the needle, and every path under the root that does ----
async function leftovers(root: string, needle: string, allowed: (table: string, column: string) => boolean = () => false) {
  const rows: string[] = []
  for (const file of ['mastra.sqlite', 'catalog.sqlite', 'diagnostics.sqlite']) {
    const db = new DatabaseSync(join(root, file), { readOnly: true })
    try {
      for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[])
        for (const row of db.prepare(`SELECT * FROM "${name}"`).all() as Record<string, unknown>[])
          for (const [column, value] of Object.entries(row))
            if (typeof value === 'string' && value.includes(needle) && !allowed(name, column)) rows.push(`${file} ${name}.${column}`)
    } finally { db.close() }
  }
  async function walk(dir: string): Promise<string[]> {
    const out: string[] = []
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (path.includes(needle)) out.push(relative(root, path))
      if (entry.isDirectory()) out.push(...await walk(path))
    }
    return out
  }
  return [...new Set(rows), ...await walk(root)]
}
const tableRows = (root: string, table: string) => {
  const db = new DatabaseSync(join(root, 'mastra.sqlite'), { readOnly: true })
  try { return db.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[] } finally { db.close() }
}

test('删主题：两段对话的消息/trace/诊断/游标、专家线程、白板版本、解读、沉淀、引用和主题目录全部删除；资料库原件和另一个主题不动', { timeout: 120000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-lifecycle-'))
  const { fixture } = model()
  const env = await service(root, fixture)
  try {
    const item = (await env.studio.library.add({ name: 'notes.md', bytes: new TextEncoder().encode('# Notes\n\nThe brain predicts.'), addedBy: 'ai' })).item
    await seed(env, 'topic-one', item.id)
    await seed(env, 'topic-two', item.id)
    assert.ok((await leftovers(root, 'topic-one')).length > 20, '播种不全，清点没有意义')
    const twoBefore = await leftovers(root, 'topic-two')
    assert.ok(twoBefore.some(path => path.includes('workers/general-purpose-')), '专家没在 workers/ 下写文件')
    assert.ok(tableRows(root, 'mastra_threads').some(row => /^topic-one:a-[0-9a-f-]{36}$/.test(String(row.id))), '没有专家线程')

    const removed = await env.json('/lumen/topics/topic-one', { method: 'DELETE' })
    assert.equal(removed.status, 204, JSON.stringify(removed.body))
    assert.deepEqual(await leftovers(root, 'topic-one'), [])
    // run owners and fences keep only a run id and a lease time (Q1 → A): no key, no content
    for (const table of ['mastra_workflow_run_owners', 'mastra_memory_run_fences'])
      for (const row of tableRows(root, table)) assert.ok(!JSON.stringify(row).includes('topic-'), `${table}: ${JSON.stringify(row)}`)
    assert.deepEqual(await leftovers(root, 'topic-two'), twoBefore, '另一个主题被动了')
    assert.equal(env.studio.library.get(item.id).id, item.id)
    assert.ok((await stat(join(root, 'library', item.id))).isDirectory(), '资料库原件被删了')

    assert.equal((await env.json('/lumen/topics/topic-one', { method: 'DELETE' })).status, 404, '删两次第二次应 404')
    assert.equal((await env.json('/lumen/topics/topic-one/sessions/b', { method: 'DELETE' })).status, 404)
    assert.ok(!(await env.json('/lumen/topics')).body.items.some((topic: { id: string }) => topic.id === 'topic-one'))
    assert.equal((await env.json('/lumen/topics/nope', { method: 'DELETE' })).status, 404)
    // The last topic can go too
    assert.equal((await env.json('/lumen/topics/topic-two', { method: 'DELETE' })).status, 204)
    assert.deepEqual((await env.json('/lumen/topics')).body.items, [])
  } finally { await env.http.close(); await rm(root, { recursive: true, force: true }) }
})

test('删对话：它的线程、消息、专家线程、trace、游标和诊断都删除；白板、解读、沉淀和报价单留在主题里，另一段对话不动；记录漏掉的专家线程也删掉', { timeout: 120000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-lifecycle-'))
  const { fixture } = model()
  const env = await service(root, fixture)
  try {
    const item = (await env.studio.library.add({ name: 'notes.md', bytes: new TextEncoder().encode('# Notes\n\nThe brain predicts.'), addedBy: 'you' })).item
    await seed(env, 'topic-one', item.id)
    // The specialist record is lost (a crash between delegation start and the record write): the `topicId:taskId-<uuid>` sweep still finds the thread
    await (await env.http.application.storage.getStore('threadState'))!.deleteState({ threadId: 'topic-one:a', type: SPECIALISTS_STATE })
    const sheetId = env.studio.board.writableSheet('topic-one').id
    const canvasIds = () => [...env.studio.board.canvas.ops(sheetId).flatMap(op => op.ids), ...env.studio.board.canvas.liveElements(sheetId).map(row => row.element.id)]
    const board = canvasIds()
    assert.ok(board.length > 0, 'the conversation drew on the board')
    const otherBefore = await leftovers(root, 'topic-one:b')

    assert.equal((await env.json('/lumen/topics/topic-one/sessions/a', { method: 'DELETE' })).status, 204)
    // What the conversation produced belongs to the topic (R20): only these columns may still name it, as a stamp of where a product came from
    const stamps = new Set(['canvas_elements.thread_id', 'canvas_ops.thread_id', 'canvas_erasures.thread_id', 'canvas_snapshots.thread_id', 'canvas_snapshots.elements', 'blocks.thread_id', 'sheet_versions.thread_id', 'sheet_versions.snapshot', 'reading_sections.thread_id', 'sediment_offers.thread_id', 'sediment_entries.quote_thread_id'])
    assert.deepEqual(await leftovers(root, 'topic-one:a', (table, column) => stamps.has(`${table}.${column}`)), [])
    assert.deepEqual(await leftovers(root, 'topic-one:b'), otherBefore, '另一段对话被动了')
    assert.deepEqual(canvasIds(), board)
    assert.equal(env.studio.readings.list('topic-one').length, 1)
    assert.equal(env.studio.sediment.list('topic-one').items.length, 1)
    // The topic's files stay: the workspace is the topic's, shared by its conversations
    assert.ok((await stat(join(root, 'topics', 'topic-one', 'work', 'notes.md'))).isFile())

    // Q2 → A: the offer outlives its conversation and still confirms; the check reads only the original it stored
    const [offer] = env.studio.sediment.list('topic-one').offers
    const confirmed = await env.json('/lumen/topics/topic-one/sediment', { method: 'POST', body: JSON.stringify({ offerId: offer!.id }) })
    assert.equal(confirmed.status, 201, JSON.stringify(confirmed.body))
    assert.equal(confirmed.body.text, offer!.text)

    const list = await env.json('/lumen/topics/topic-one/sessions')
    assert.deepEqual(list.body.items.map((session: { taskId: string }) => session.taskId), ['b'])
    assert.equal((await env.json('/lumen/topics/topic-one/sessions/a', { method: 'DELETE' })).status, 404)
    assert.equal((await env.json('/lumen/topics/topic-one/sessions/a')).status, 404)
    assert.equal((await env.send('topic-one:a', '还在吗')).status, 404)
    // A conversation id can be opened again afterwards; it starts empty
    assert.equal((await env.open('topic-one', 'a')).status, 201)
    const fresh = await env.http.application.memory.recall({ threadId: 'topic-one:a', resourceId: 'topic-one:a', perPage: 10, page: 0 })
    assert.equal(fresh.messages.length, 0)
  } finally { await env.http.close(); await rm(root, { recursive: true, force: true }) }
})

test('运行中和等你回应时：主题与对话的删除、归档都是 409，重命名照常；另一段空闲对话可以删', { timeout: 60000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-lifecycle-'))
  const { fixture, hold, entered } = model()
  const env = await service(root, fixture)
  try {
    ensureTopic(env.http, 'busy-topic', '反馈')
    for (const task of ['a', 'b', 'c']) assert.equal((await env.open('busy-topic', task)).status, 201)
    const refusals = async (state: string) => {
      for (const [path, body, code] of [
        ['/lumen/topics/busy-topic', null, 'topic.running'], ['/lumen/topics/busy-topic/sessions/a', null, 'session.running'],
        ['/lumen/topics/busy-topic', { archived: true }, 'topic.running'], ['/lumen/topics/busy-topic/sessions/a', { archived: true }, 'session.running'],
      ] as const) {
        const response = await env.json(path, body ? { method: 'PATCH', body: JSON.stringify(body) } : { method: 'DELETE' })
        assert.equal(response.status, 409, `${state} ${path} ${JSON.stringify(body)}`)
        assert.equal(response.body.code, code)
      }
      assert.equal((await env.json('/lumen/topics/busy-topic', { method: 'PATCH', body: JSON.stringify({ title: `主题·${state}` }) })).body.title, `主题·${state}`)
      assert.equal((await env.json('/lumen/topics/busy-topic/sessions/a', { method: 'PATCH', body: JSON.stringify({ title: `对话·${state}` }) })).body.title, `对话·${state}`)
    }

    // ---- Running ----
    const running = env.send('busy-topic:a', '等一下')
    await entered.promise
    await refusals('running')
    assert.equal((await env.json('/lumen/topics/busy-topic/sessions/b', { method: 'DELETE' })).status, 204, '空闲的另一段对话应能删')
    const a = await env.http.application.session('busy-topic', 'a')
    const ended = new Promise<void>(resolve => { const off = a.subscribe(event => { if (event.type === 'agent_end') { off(); resolve() } }) })
    hold.open()
    assert.equal((await running).status, 200)
    await ended

    // ---- Waiting on the user ----
    await env.turn('busy-topic', 'a', '问我一个问题')
    await until(() => a.displayState.get().pendingSuspensions.size > 0, '没有进入等待用户回答')
    await refusals('waiting')
    assert.ok((await env.states()).get('busy-topic:a')?.waiting)

    // ---- Stopped: both go through ----
    assert.equal((await env.stop('busy-topic:a')).status, 200)
    await until(async () => !(await env.states()).get('busy-topic:a')?.waiting, '停止后仍在等待')
    assert.equal((await env.json('/lumen/topics/busy-topic/sessions/a', { method: 'PATCH', body: JSON.stringify({ archived: true }) })).status, 200)
    assert.equal((await env.json('/lumen/topics/busy-topic', { method: 'DELETE' })).status, 204)
    assert.deepEqual(await leftovers(root, 'busy-topic'), [])
  } finally { hold.open(); await env.http.close(); await rm(root, { recursive: true, force: true }) }
})

test('删到一半中断：对象已经隐去并拒绝运行；重启后服务先删完再应答，清点为空', { timeout: 120000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-lifecycle-'))
  const { fixture } = model()
  let stops = 0
  const env = await service(root, fixture, () => { stops++; throw new Error('injected stop after the memory step') })
  let reopened: Service | undefined
  try {
    const item = (await env.studio.library.add({ name: 'notes.md', bytes: new TextEncoder().encode('# Notes\n\nThe brain predicts.'), addedBy: 'you' })).item
    await seed(env, 'topic-one', item.id)
    await seed(env, 'topic-two', item.id)
    const twoBefore = await leftovers(root, 'topic-two:a')

    assert.equal((await env.request('/lumen/topics/topic-one', { method: 'DELETE' })).status, 500)
    assert.equal((await env.request('/lumen/topics/topic-two/sessions/b', { method: 'DELETE' })).status, 500)
    assert.equal(stops, 2)
    // Hidden at once and refusing everything, though files and catalog rows are still there
    assert.deepEqual((await env.json('/lumen/topics')).body.items.map((topic: { id: string }) => topic.id), ['topic-two'])
    assert.equal((await env.json('/lumen/topics/topic-one')).status, 404)
    assert.equal((await env.open('topic-one', 'c')).status, 404)
    assert.equal((await env.send('topic-one:b', '还在吗')).status, 404)
    assert.deepEqual((await env.json('/lumen/topics/topic-two/sessions')).body.items.map((session: { taskId: string }) => session.taskId), ['a'])
    assert.equal((await env.send('topic-two:b', '还在吗')).status, 404)
    assert.ok((await stat(join(root, 'topics', 'topic-one'))).isDirectory(), '注入点应在删文件之前')
    assert.equal(env.studio.deletions.list().length, 2)
    await env.http.close()

    reopened = await service(root, fixture)
    assert.deepEqual(reopened.studio.deletions.list(), [])
    assert.deepEqual(await leftovers(root, 'topic-one'), [])
    assert.deepEqual(await leftovers(root, 'topic-two:b', (table, column) => ['canvas_elements.thread_id', 'canvas_ops.thread_id', 'canvas_erasures.thread_id', 'canvas_snapshots.thread_id', 'canvas_snapshots.elements', 'blocks.thread_id', 'sheet_versions.thread_id', 'sheet_versions.snapshot', 'reading_sections.thread_id', 'sediment_offers.thread_id', 'sediment_entries.quote_thread_id'].includes(`${table}.${column}`)), [])
    assert.deepEqual(await leftovers(root, 'topic-two:a'), twoBefore)
  } finally { await reopened?.http.close(); await rm(root, { recursive: true, force: true }) }
})

test('归档：从列表消失、拒绝发消息、出现在「已归档」，取消归档后一切恢复；数据一字不动', { timeout: 60000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-lifecycle-'))
  const { fixture } = model()
  const env = await service(root, fixture)
  try {
    ensureTopic(env.http, 'p', '反馈'); ensureTopic(env.http, 'q', '注意力')
    for (const task of ['a', 'b']) assert.equal((await env.open('p', task)).status, 201)
    assert.equal((await env.open('q', 'a')).status, 201)
    await env.turn('p', 'a', '你好')
    const messages = async () => (await env.http.application.memory.recall({ threadId: 'p:a', resourceId: 'p:a', perPage: 50, page: 0 })).messages.length
    const before = await messages()

    // ---- A conversation ----
    assert.equal((await env.json('/lumen/topics/p/sessions/a', { method: 'PATCH', body: JSON.stringify({ archived: true }) })).body.archived, true)
    assert.deepEqual((await env.json('/lumen/topics/p/sessions')).body.items.map((session: { taskId: string }) => session.taskId), ['b'])
    const refused = await env.json('/api/agent-controller/lumen/sessions/p%3Aa/messages', { method: 'POST', body: JSON.stringify({ message: '还在吗' }) })
    assert.equal(refused.status, 409)
    assert.equal(refused.body.code, 'session.archived')
    // ---- A topic, with an archived conversation of another topic ----
    assert.equal((await env.json('/lumen/topics/q/sessions/a', { method: 'PATCH', body: JSON.stringify({ archived: true }) })).status, 200)
    await delay(5)
    assert.equal((await env.json('/lumen/topics/p', { method: 'PATCH', body: JSON.stringify({ archived: true }) })).body.archived, true)
    assert.deepEqual((await env.json('/lumen/topics')).body.items.map((topic: { id: string }) => topic.id), ['q'])
    const topicRefused = await env.json('/api/agent-controller/lumen/sessions/p%3Ab/messages', { method: 'POST', body: JSON.stringify({ message: '还在吗' }) })
    assert.equal(topicRefused.status, 409)
    assert.equal(topicRefused.body.code, 'topic.archived')
    assert.equal((await env.open('p', 'c')).status, 409)
    // L7: archived topics, and archived conversations of listed topics with their topic's title; p:a hides with its topic
    const archived = await env.json('/lumen/archived')
    assert.deepEqual(archived.body.topics.map((topic: { id: string }) => topic.id), ['p'])
    assert.deepEqual(archived.body.sessions.map((session: { resourceId: string; topicTitle: string }) => [session.resourceId, session.topicTitle]), [['q:a', '注意力']])

    // ---- Unarchive: everything back ----
    assert.equal((await env.json('/lumen/topics/p', { method: 'PATCH', body: JSON.stringify({ archived: false }) })).status, 200)
    assert.deepEqual((await env.json('/lumen/archived')).body.sessions.map((session: { resourceId: string }) => session.resourceId).sort(), ['p:a', 'q:a'])
    assert.equal((await env.json('/lumen/topics/p/sessions/a', { method: 'PATCH', body: JSON.stringify({ archived: false }) })).status, 200)
    assert.deepEqual((await env.json('/lumen/topics/p/sessions')).body.items.map((session: { taskId: string }) => session.taskId).sort(), ['a', 'b'])
    assert.equal(await messages(), before, '归档动了消息')
    await env.turn('p', 'a', '回来了')
  } finally { await env.http.close(); await rm(root, { recursive: true, force: true }) }
})

test('重命名与标题：去首尾空白、空的拒绝；运行中手改的标题不被自动标题覆盖；新对话没有标题；旧「新对话」读作没有标题', { timeout: 60000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-lifecycle-'))
  const { fixture, hold, entered } = model()
  const env = await service(root, fixture)
  try {
    ensureTopic(env.http, 'p', '反馈')
    assert.equal((await env.json('/lumen/topics/p', { method: 'PATCH', body: JSON.stringify({ title: '  负反馈  ' }) })).body.title, '负反馈')
    const empty = await env.json('/lumen/topics/p', { method: 'PATCH', body: JSON.stringify({ title: '   ' }) })
    assert.equal(empty.status, 400)
    assert.equal(empty.body.code, 'topic.title_empty')

    const created = await env.json('/lumen/topics/p/sessions', { method: 'POST', body: JSON.stringify({ taskId: 'a' }) })
    assert.equal(created.body.title, null)
    assert.equal((await env.json('/lumen/topics/p/sessions/a', { method: 'PATCH', body: JSON.stringify({ title: '\t' }) })).body.code, 'session.title_empty')
    // A title the user set before the first message is never replaced by the generated one; a rename while it runs holds after the run
    assert.equal((await env.json('/lumen/topics/p/sessions/a', { method: 'PATCH', body: JSON.stringify({ title: '  我起的名字 ' }) })).body.title, '我起的名字')
    const session = await env.http.application.session('p', 'a')
    const ended = new Promise<void>(resolve => { const off = session.subscribe(event => { if (event.type === 'agent_end') { off(); resolve() } }) })
    assert.equal((await env.send('p:a', '等一下')).status, 200)
    await entered.promise
    assert.equal((await env.json('/lumen/topics/p/sessions/a')).body.title, '我起的名字')
    assert.equal((await env.json('/lumen/topics/p/sessions/a', { method: 'PATCH', body: JSON.stringify({ title: '运行中改的' }) })).body.title, '运行中改的')
    hold.open()
    await ended
    assert.equal((await env.json('/lumen/topics/p/sessions/a')).body.title, '运行中改的')
    // Without a rename the first message names it
    assert.equal((await env.open('p', 'b')).status, 201)
    await env.turn('p', 'b', '为什么负反馈能稳住系统\n第二行')
    await until(async () => (await env.json('/lumen/topics/p/sessions/b')).body.title === '为什么负反馈能稳住系统', '自动标题没写上')
    assert.equal((await env.open('p', 'c')).status, 201)
    await env.turn('p', 'c', '> 深度反馈控制（DFC）**源于运动控制\n— 解读《Paper》· 1. 核心结论\n\n这个是什么')
    await until(async () => (await env.json('/lumen/topics/p/sessions/c')).body.title === '深度反馈控制（DFC）源于运动控制', 'a reading question names its conversation by its quote')
    // A thread from before L8 stored the word itself
    await env.http.application.memory.createThread({ threadId: 'p:old', resourceId: 'p:old', title: '新对话',
      metadata: { lumenTopicId: 'p', lumenTaskId: 'old', lumenPinned: false, lumenArchived: false, lumenAutoTitle: true } })
    assert.equal((await env.json('/lumen/topics/p/sessions/old')).body.title, null)
    assert.ok(!(await env.json('/lumen/topics/p/sessions?search=新对话')).body.items.length)
  } finally { hold.open(); await env.http.close(); await rm(root, { recursive: true, force: true }) }
})

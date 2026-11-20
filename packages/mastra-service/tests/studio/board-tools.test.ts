/**
 * [INPUT]: 真实 HTTP 服务/应用组合根、Mastra Controller 工具循环、catalog.sqlite 画布表、确定性模型；canvas-fixtures 代替桌面落笔
 * [OUTPUT]: 白板工具 × 真实 Controller 的行为证据：两笔 board_draw 排队、运行结束写一个场景快照、桌面提交后元素记为 AI 与本轮对话；第二段对话的实际请求带画布摘要且守上限；
 *           专家只有 board_view；通用文件工具碰不到白板（R4）；一主题一运行的 409（R1，含等待用户与停止后恢复）；中途停止只留已排队的一笔且写快照（R8）；
 *           看图（Q6）：有视觉时每次请求恰好一张白板画面、board_look 等到新画面后下一次请求换成新图、多轮之后仍 ≤1 张、画面不进持久消息与资料库；
 *           vision=off 时没有 board_look、请求里没有图，只读 board_view 的结构
 * [POS]: S3 机制验收；可控模型只证明机制，不冒充真实模型研究验收
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createHttpService } from '../../src/server.ts'
import { estimateTokens, topicState, TOPIC_STATE_TOKENS } from '../../src/studio/board-tools.ts'
import { fixtureProvider, textReply, toolReply, type ProviderRequest } from '../provider-fixture.ts'
import { ensureTopic } from '../topic-fixture.ts'
import { element, layOut, png } from './canvas-fixtures.ts'

const said = (request: ProviderRequest) => {
  // The glance rides as an extra user message after tool results (Q6); it is not something the user said
  const lastUser = request.messages.map(message => message.role === 'user' && /^\[\{"type":"text","text":"白板「[^」]*」此刻的画面/.test(JSON.stringify(message.content)) ? 'glance' : message.role).lastIndexOf('user')
  return { text: JSON.stringify(request.messages[lastUser]), results: request.messages.slice(lastUser).filter(message => message.role === 'tool').length }
}
const system = (request: ProviderRequest) => request.messages.filter(message => message.role === 'system').map(message => String(message.content)).join('\n')

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

async function files(root: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) out.push(...await files(path))
    else if (entry.isFile()) out.push(path)
  }
  return out
}

/** How many images a provider request carries (OpenAI wire format: data URLs) */
const images = (request: ProviderRequest) => JSON.stringify(request.messages).match(/data:image\/png;base64/g)?.length ?? 0

async function environment(respond: (request: ProviderRequest, signal?: AbortSignal | null) => ReturnType<Parameters<typeof fixtureProvider>[0]>, vision: 'on' | 'off' = 'on') {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-board-'))
  const fixture = fixtureProvider(respond)
  const token = 'board-tools-token-at-least-24-characters'
  const service = await createHttpService({ dataRoot, token, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', vision, fetch: fixture.fetch } })
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const studio = service.application.studio
  const request = (path: string, init: RequestInit = {}) => service.app.request(path, { ...init, headers })
  return { dataRoot, fixture, service, studio, request,
    open: (topic: string, task?: string) => request(`/lumen/topics/${topic}/sessions`, { method: 'POST', body: JSON.stringify(task ? { taskId: task } : {}) }),
    send: (resourceId: string, message: string) => request(`/api/agent-controller/lumen/sessions/${encodeURIComponent(resourceId)}/messages`, { method: 'POST', body: JSON.stringify({ message }) }),
    stop: (resourceId: string) => request(`/api/agent-controller/lumen/sessions/${encodeURIComponent(resourceId)}/abort`, { method: 'POST', body: '{}' }),
    sheet: (topic: string) => studio.board.writableSheet(topic).id,
    /** The app's side: lay out every queued op of the sheet and commit it */
    layOutAll(sheetId: string) { for (const op of studio.board.canvas.ops(sheetId)) studio.board.canvas.commit(sheetId, op.id, layOut(op)) },
    async close() { await service.close(); await rm(dataRoot, { recursive: true, force: true }) },
  }
}

test('两笔 board_draw 排队、运行结束写一个场景快照；桌面落笔后元素记为 AI；第二段对话的实际请求带画布摘要且守上限；专家只有 board_view；文件工具碰不到白板', { timeout: 60000 }, async () => {
  let calls = 0
  const call = (name: string, args: unknown) => toolReply(name, args, `call-${++calls}`)
  const specialistTools: string[][] = []
  const env = await environment(request => {
    const tools = request.tools?.map(tool => tool.function.name) ?? []
    if (!tools.includes('agent-reader')) { specialistTools.push(tools); return textReply('READER_DONE') }
    const { text, results } = said(request)
    if (text.includes('画两笔')) {
      if (results === 0) return call('board_draw', { title: '负反馈', elements: [
        { type: 'rectangle', id: 'level', x: 0, y: 0, label: { text: '水位升高' } }, { type: 'rectangle', id: 'valve', x: 300, y: 0, label: { text: '浮球顶上阀门' } },
        { type: 'arrow', id: 'push', x: 120, y: 30, start: { id: 'level' }, end: { id: 'valve' } }] })
      if (results === 1) return call('board_draw', { title: '一句话', elements: [{ type: 'text', id: 'gist', x: 0, y: 160, text: '输出回头压住输入' }] })
      return textReply('画好了，看「负反馈」')
    }
    if (text.includes('写文件')) return results ? textReply('写了') : call('write_file', { path: 'board.json', content: '{"elements":[]}' })
    if (text.includes('委派')) return results ? textReply('专家回来了') : call('agent-reader', { prompt: '看看白板' })
    return textReply('好的')
  })
  try {
    ensureTopic(env.service, 'p', '反馈')
    assert.equal((await env.open('p', 'a')).status, 201)
    const session = await env.service.application.session('p', 'a')
    await session.sendMessage({ content: '画两笔' })

    // ---- Two draws wait for the app, stamped with the conversation and run; the run leaves one snapshot carrying them ----
    const sheetId = env.sheet('p'), canvas = env.studio.board.canvas
    const ops = canvas.ops(sheetId)
    assert.deepEqual(ops.map(op => [op.title, op.ids]), [['负反馈', ['level', 'valve', 'push']], ['一句话', ['gist']]])
    assert.ok(ops.every(op => op.threadId === 'p:a' && op.runId && op.runId === ops[0]!.runId), JSON.stringify(ops))
    await until(() => canvas.snapshots(sheetId).length === 1, '运行结束没有写快照')
    assert.deepEqual(canvas.snapshots(sheetId)[0]!.ops.map(op => op.title), ['负反馈', '一句话'])
    // ---- The tool result names ids and the card title, never echoes the drawing back ----
    const toolResults = JSON.stringify(env.fixture.requests.at(-1)!.messages.filter(message => message.role === 'tool'))
    assert.match(toolResults, /"blockId\W+level/)
    assert.doesNotMatch(toolResults, /浮球顶上阀门/)

    // ---- The app lays them out: AI elements, this conversation's ----
    env.layOutAll(sheetId)
    const live = canvas.liveElements(sheetId)
    assert.equal(live.length, 6)
    assert.ok(live.every(row => row.author === 'ai' && row.element.customData?.author === 'ai'))

    // ---- Second conversation: the real request carries the canvas summary, under the cap ----
    assert.equal((await env.open('p', 'b')).status, 201)
    const second = await env.service.application.session('p', 'b')
    const before = env.fixture.requests.length
    await second.sendMessage({ content: '我们接着聊' })
    const prompt = system(env.fixture.requests[before]!)
    for (const expected of ['主题「反馈」的现状', '这一轮的白板「反馈」', '4 个元素（你画的 4，用户画的 0）', 'level · rectangle · 你画的 · 「水位升高」', 'gist · text · 你画的 · 「输出回头压住输入」']) assert.ok(prompt.includes(expected), expected)
    const section = prompt.slice(prompt.indexOf('主题「反馈」的现状'))
    assert.ok(estimateTokens(section.split('\n\n')[0]!) <= TOPIC_STATE_TOKENS)
    // 注入只进当次请求，不写进持久消息
    const persisted = await env.service.application.memory.recall({ threadId: 'p:b', resourceId: 'p:b', perPage: 50, page: 0 })
    assert.doesNotMatch(JSON.stringify(persisted.messages), /主题「反馈」的现状/)

    // ---- R4: file tools cannot reach the board; its words live in no file but the database ----
    await second.sendMessage({ content: '写文件' })
    assert.equal(canvas.liveElements(sheetId).length, 6)
    for (const path of await files(env.dataRoot)) {
      if (/\.sqlite(-wal|-shm)?$/.test(path) || (await stat(path)).size > 4 * 1024 * 1024) continue
      assert.ok(!(await readFile(path, 'utf8')).includes('浮球顶上阀门'), `白板文字出现在文件里：${path}`)
    }

    // ---- Experts see the board, get no board write tool ----
    await second.sendMessage({ content: '委派只读专家' })
    assert.ok(specialistTools.length > 0, '专家没有被调用')
    for (const tools of specialistTools) {
      assert.ok(tools.includes('board_view'), JSON.stringify(tools))
      assert.ok(!tools.some(name => ['board_draw', 'board_update', 'board_erase', 'board_look'].includes(name)), JSON.stringify(tools))
    }
    // ---- The main agent's board tools are 'edit'/'read': allowed by default, no approval ----
    assert.equal(second.displayState.get().pendingApprovals.size, 0)
  } finally { await env.close() }
})

test('主题现状注入守硬上限：带字的元素按画面顺序列，超出的告诉模型去 board_view 看全', { timeout: 30000 }, async () => {
  const env = await environment(() => textReply('好'))
  try {
    ensureTopic(env.service, 'big', '大主题')
    env.studio.board.canvas.save(env.sheet('big'), Array.from({ length: 80 }, (_, i) => element(`t${i}`, 'text', { text: `第${i}条${'很长的一句话'.repeat(20)}` })))
    for (let i = 0; i < 60; i++) {
      const { item } = await env.studio.library.add({ name: `材料${i}.txt`, bytes: new TextEncoder().encode(`材料正文 ${i}`), addedBy: 'you', title: `第${i}份${'相当长的材料标题'.repeat(6)}` })
      env.studio.topics.reference('big', item.id)
    }
    const text = topicState(env.studio, 'big')
    assert.ok(estimateTokens(text) <= TOPIC_STATE_TOKENS, `${estimateTokens(text)} 超过上限`)
    assert.match(text, /用 board_view \/ list_materials 看全/)
    assert.match(text, /t0 · text · 用户画的/, '用户正看着的、排在前面的元素先列')
    assert.equal(topicState(env.studio, 'missing'), '', '主题不存在时不注入')
  } finally { await env.close() }
})

test('R1：同主题一段对话在跑或在等用户时，另一段发消息与新开对话都 409；重开已有对话不受限；停止后恢复', { timeout: 60000 }, async () => {
  const hold = gate(), entered = gate()
  const env = await environment(async request => {
    const { text, results } = said(request)
    if (text.includes('慢慢想')) { entered.open(); await hold.promise; return textReply('想完了') }
    if (text.includes('问我')) return results ? textReply('收到') : toolReply('ask_user', { question: '重点看哪一节？' }, 'call-ask')
    return textReply('好')
  })
  try {
    ensureTopic(env.service, 'p'); ensureTopic(env.service, 'q')
    for (const [topic, task] of [['p', 'a'], ['p', 'b'], ['q', 'a']] as const) assert.equal((await env.open(topic, task)).status, 201)

    // ---- 运行中：另一段对话发消息 409，原因可读；新开对话 409；别的主题不受影响 ----
    const running = env.send('p:a', '慢慢想')
    await entered.promise
    const blocked = await env.send('p:b', '插一句')
    assert.equal(blocked.status, 409)
    assert.match((await blocked.json()).error, /另一段对话（a）还在进行或在等用户回应/)
    assert.equal((await env.open('p')).status, 409, '主题在跑时不能新开对话')
    const resume = await env.request('/lumen/specialists/continue', { method: 'POST', body: JSON.stringify({ topicId: 'p', taskId: 'b', specialistId: 'reader-x', prompt: '接着读' }) })
    assert.equal(resume.status, 409, '继续专家也要过主题准入')
    assert.match((await resume.json()).error, /另一段对话（a）/)
    assert.equal((await env.open('p', 'b')).status, 201, '重新打开已有对话不受限')
    assert.equal((await env.send('q:a', '别的主题')).status, 200)

    // ---- 停止后恢复 ----
    assert.equal((await env.stop('p:a')).status, 200)
    hold.open(); await running
    await until(async () => !(await env.service.application.liveSessionStates()).get('p:a')?.running, '停止后仍显示运行中')
    const resumed = await env.send('p:b', '现在可以了')
    assert.equal(resumed.status, 200)
    const b = await env.service.application.session('p', 'b')
    await until(() => !b.displayState.get().isRunning, 'p:b 没跑完')

    // ---- 等用户回应（ask_user 挂起）同样占着主题 ----
    assert.equal((await env.send('p:b', '问我一个问题')).status, 200)
    await until(() => b.displayState.get().pendingSuspensions.size > 0, '没有进入等待用户回答')
    assert.equal((await env.send('p:a', '我也想说')).status, 409)
    assert.equal((await env.open('p')).status, 409)
    assert.equal((await env.stop('p:b')).status, 200)
    await until(async () => !(await env.service.application.liveSessionStates()).get('p:b')?.waiting, '停止后仍在等待')
    assert.equal((await env.send('p:a', '轮到我')).status, 200)
  } finally { hold.open(); await env.close() }
})

test('R1 准入在同步段预留：两段对话同时开跑只放行一个', { timeout: 30000 }, async () => {
  const hold = gate()
  const env = await environment(async () => { await hold.promise; return textReply('好') })
  try {
    ensureTopic(env.service, 'p')
    for (const task of ['a', 'b']) assert.equal((await env.open('p', task)).status, 201)
    const [a, b] = await Promise.all([env.send('p:a', '一起'), env.send('p:b', '一起')])
    assert.deepEqual([a.status, b.status].sort(), [200, 409])
  } finally { hold.open(); await env.close() }
})

test('R8：画到一半停下，已排队的那一笔完整、没有第二笔，快照照样写入', { timeout: 60000 }, async () => {
  const hold = gate(), second = gate()
  const env = await environment(async (request, signal) => {
    const { results } = said(request)
    if (results === 0) return toolReply('board_draw', { title: '对照', elements: [{ type: 'text', id: 'pair', x: 0, y: 0, text: '水箱 · 浮球\n恒温器 · 温度' }] }, 'call-1')
    second.open()
    await Promise.race([hold.promise, new Promise(resolve => signal?.addEventListener('abort', resolve))])
    return toolReply('board_draw', { title: '不该出现', elements: [{ type: 'text', x: 0, y: 80, text: '停下之后的' }] }, 'call-2')
  })
  try {
    ensureTopic(env.service, 'p')
    assert.equal((await env.open('p', 'a')).status, 201)
    const running = env.send('p:a', '开始画')
    await second.promise
    assert.equal((await env.stop('p:a')).status, 200)
    hold.open(); await running
    const session = await env.service.application.session('p', 'a')
    await until(() => !session.displayState.get().isRunning, '停止后仍在运行')
    const sheetId = env.sheet('p'), canvas = env.studio.board.canvas
    assert.deepEqual(canvas.ops(sheetId).map(op => [op.title, (op.skeletons[0] as { text: string }).text]), [['对照', '水箱 · 浮球\n恒温器 · 温度']])
    await until(() => canvas.snapshots(sheetId).length === 1, '停下后没有写快照')
    assert.equal(canvas.snapshots(sheetId)[0]!.ops.length, 1)
  } finally { hold.open(); await env.close() }
})

test('看图（Q6）：每次请求恰好一张白板画面；board_look 等到桌面送来新画面，下一次请求换成新图；多轮之后仍 ≤1 张；画面不进消息与资料库', { timeout: 60000 }, async () => {
  let env!: Awaited<ReturnType<typeof environment>>
  const counts: number[] = [], glances: number[] = []
  env = await environment(request => {
    counts.push(images(request))
    glances.push(env.studio.board.canvas.glance(env.sheet('g'))?.sceneVersion ?? -1)
    const { text, results } = said(request)
    if (!text.includes('画给我看')) return textReply('好')
    if (results === 0) return toolReply('board_draw', { title: '一个框', elements: [{ type: 'rectangle', id: 'seen', x: 0, y: 0 }] }, 'call-draw')
    if (results === 1) {
      // The app lays the draw out and sends a fresh glance a little later, while board_look waits
      setTimeout(() => {
        const sheetId = env.sheet('g'), canvas = env.studio.board.canvas
        env.layOutAll(sheetId)
        canvas.setGlance(sheetId, canvas.sceneVersion(sheetId), png())
      }, 400)
      return toolReply('board_look', {}, 'call-look')
    }
    return textReply('看到了')
  })
  try {
    ensureTopic(env.service, 'g', '看图')
    const sheetId = env.sheet('g'), canvas = env.studio.board.canvas
    canvas.save(sheetId, [element('mine', 'freedraw')])
    // The app's glance at send time, through the real route
    const put = await env.request(`/lumen/sheets/${sheetId}/glance`, { method: 'PUT', body: JSON.stringify({ sceneVersion: canvas.sceneVersion(sheetId), dataURL: `data:image/png;base64,${Buffer.from(png()).toString('base64')}` }) })
    assert.equal(put.status, 204)
    assert.equal((await env.open('g', 'a')).status, 201)
    const session = await env.service.application.session('g', 'a')
    await session.sendMessage({ content: '画给我看' })
    assert.deepEqual(counts, [1, 1, 1], '每次请求恰好一张')
    assert.deepEqual(glances.slice(0, 2), [1, 1])
    assert.equal(glances[2], 2, 'board_look 之后的那次请求带的是新画面')
    const look = JSON.stringify(env.fixture.requests[2]!.messages.filter(message => message.role === 'tool'))
    assert.match(look, /画面已更新，下一步可见/)
    for (let round = 0; round < 3; round++) await session.sendMessage({ content: `再聊一句 ${round}` })
    assert.ok(counts.every(count => count <= 1) && counts.length === 6, JSON.stringify(counts))
    // ---- Never in the persisted conversation, the transcript or the library ----
    const persisted = await env.service.application.memory.recall({ threadId: 'g:a', resourceId: 'g:a', perPage: 50, page: 0 })
    assert.doesNotMatch(JSON.stringify(persisted.messages), /image\/png|base64|此刻的画面/)
    assert.equal(env.studio.library.list().length, 0)
  } finally { await env.close() }
})

test('看图（Q6）vision=off：没有 board_look，请求里没有图，模型只读 board_view 的结构', { timeout: 60000 }, async () => {
  let toolNames: string[] = []
  const counts: number[] = []
  const env = await environment(request => {
    counts.push(images(request))
    toolNames = request.tools?.map(tool => tool.function.name) ?? []
    const { results } = said(request)
    return results ? textReply('读到了结构') : toolReply('board_view', {}, 'call-view')
  }, 'off')
  try {
    ensureTopic(env.service, 'g', '不看图')
    const sheetId = env.sheet('g'), canvas = env.studio.board.canvas
    canvas.save(sheetId, [element('mine', 'text', { text: '用户写的' })])
    canvas.setGlance(sheetId, canvas.sceneVersion(sheetId), png())
    assert.equal((await env.open('g', 'a')).status, 201)
    const session = await env.service.application.session('g', 'a')
    await session.sendMessage({ content: '看看白板' })
    assert.deepEqual(counts, [0, 0])
    assert.ok(toolNames.includes('board_view') && !toolNames.includes('board_look') && !toolNames.includes('look_at_image'), JSON.stringify(toolNames))
    const view = JSON.stringify(env.fixture.requests.at(-1)!.messages.filter(message => message.role === 'tool'))
    assert.match(view, /用户写的/)
    assert.match(view, /"by\W+user/)
  } finally { await env.close() }
})

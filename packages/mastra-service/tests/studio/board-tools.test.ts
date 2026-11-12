/**
 * [INPUT]: 真实 HTTP 服务/应用组合根、Mastra Controller 工具循环、catalog.sqlite 白板表、确定性模型
 * [OUTPUT]: 白板工具 × 真实 Controller 的行为证据：两块落库 + 一次运行一个版本、第二段对话的实际请求带白板摘要且守上限、
 *           专家只有 board_view、通用文件工具碰不到白板（R4）、一主题一运行的 409（R1，含等待用户与停止后恢复）、中途停止不留半块且写版本（R8）
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

const said = (request: ProviderRequest) => {
  const lastUser = request.messages.map(message => message.role).lastIndexOf('user')
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

async function environment(respond: (request: ProviderRequest, signal?: AbortSignal | null) => ReturnType<Parameters<typeof fixtureProvider>[0]>) {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-board-'))
  const fixture = fixtureProvider(respond)
  const token = 'board-tools-token-at-least-24-characters'
  const service = await createHttpService({ dataRoot, token, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const studio = service.application.studio
  const request = (path: string, init: RequestInit = {}) => service.app.request(path, { ...init, headers })
  return { dataRoot, fixture, service, studio, request,
    open: (topic: string, task?: string) => request(`/lumen/topics/${topic}/sessions`, { method: 'POST', body: JSON.stringify(task ? { taskId: task } : {}) }),
    send: (resourceId: string, message: string) => request(`/api/agent-controller/lumen/sessions/${encodeURIComponent(resourceId)}/messages`, { method: 'POST', body: JSON.stringify({ message }) }),
    stop: (resourceId: string) => request(`/api/agent-controller/lumen/sessions/${encodeURIComponent(resourceId)}/abort`, { method: 'POST', body: '{}' }),
    live: (topic: string) => studio.board.view(studio.board.writableSheet(topic).id),
    async close() { await service.close(); await rm(dataRoot, { recursive: true, force: true }) },
  }
}

test('两次 board_draw 落两块、运行结束写一个版本；第二段对话的实际请求带白板摘要且守上限；专家只有 board_view；文件工具碰不到白板', { timeout: 60000 }, async () => {
  let calls = 0
  const call = (name: string, args: unknown) => toolReply(name, args, `call-${++calls}`)
  const specialistTools: string[][] = []
  const env = await environment(request => {
    const tools = request.tools?.map(tool => tool.function.name) ?? []
    if (!tools.includes('agent-reader')) { specialistTools.push(tools); return textReply('READER_DONE') }
    const { text, results } = said(request)
    if (text.includes('画两块')) {
      if (results === 0) return call('board_draw', { kind: 'text', title: '负反馈是什么', content: { markdown: '输出回头压住输入：水位高了，浮球把阀门顶上。' } })
      if (results === 1) return call('board_draw', { kind: 'ladder', title: '理解的梯子', content: { rungs: [{ level: 1, text: '浮球与阀门' }, { level: 2, text: '恒温器' }, { level: 3, text: '闭环传递函数' }], here: 1, breakAt: 3 } })
      return textReply('画好了，看「负反馈是什么」和「理解的梯子」')
    }
    if (text.includes('写文件')) return results ? textReply('写了') : call('write_file', { path: 'board.json', content: '{"blocks":[]}' })
    if (text.includes('委派')) return results ? textReply('专家回来了') : call('agent-reader', { prompt: '看看白板' })
    return textReply('好的')
  })
  try {
    ensureTopic(env.service, 'p', '反馈')
    assert.equal((await env.open('p', 'a')).status, 201)
    const session = await env.service.application.session('p', 'a')
    await session.sendMessage({ content: '画两块' })

    // ---- 两块落库，记下对话与运行；一次运行只留一个版本 ----
    const board = env.live('p')
    assert.deepEqual(board.blocks.map(block => [block.kind, block.title]), [['text', '负反馈是什么'], ['ladder', '理解的梯子']])
    assert.ok(board.blocks.every(block => block.threadId === 'p:a' && block.runId && block.runId === board.blocks[0]!.runId), JSON.stringify(board.blocks))
    await until(() => env.studio.board.versions(board.sheet.id).length === 1, '运行结束没有写版本')
    const [version] = env.studio.board.versions(board.sheet.id)
    assert.equal(version!.runId, board.blocks[0]!.runId)
    assert.equal(version!.snapshot.blocks.length, 2)
    // ---- 工具结果回给模型的是区块 id 与容量，不回显正文 ----
    const toolResults = JSON.stringify(env.fixture.requests.at(-1)!.messages.filter(message => message.role === 'tool'))
    assert.match(toolResults, new RegExp(board.blocks[1]!.id))
    assert.match(toolResults, /used\W+2/)

    // ---- 第二段对话：实际发给模型的请求带白板摘要，且在上限内 ----
    assert.equal((await env.open('p', 'b')).status, 201)
    const second = await env.service.application.session('p', 'b')
    const before = env.fixture.requests.length
    await second.sendMessage({ content: '我们接着聊' })
    const prompt = system(env.fixture.requests[before]!)
    for (const expected of ['主题「反馈」的现状', '进行中的白板', '2/8 格', `${board.blocks[0]!.id} · text · 负反馈是什么`, '理解的梯子', '断在第 3 级']) assert.ok(prompt.includes(expected), expected)
    const section = prompt.slice(prompt.indexOf('主题「反馈」的现状'))
    assert.ok(estimateTokens(section.split('\n\n')[0]!) <= TOPIC_STATE_TOKENS)
    // 注入只进当次请求，不写进持久消息
    const persisted = await env.service.application.memory.recall({ threadId: 'p:b', resourceId: 'p:b', perPage: 50, page: 0 })
    assert.doesNotMatch(JSON.stringify(persisted.messages), /主题「反馈」的现状/)

    // ---- R4：通用文件工具写不到白板；白板内容不在任何磁盘文件里（数据库除外） ----
    await second.sendMessage({ content: '写文件' })
    assert.equal(env.live('p').blocks.length, 2)
    for (const path of await files(env.dataRoot)) {
      if (/\.sqlite(-wal|-shm)?$/.test(path) || (await stat(path)).size > 4 * 1024 * 1024) continue
      assert.ok(!(await readFile(path, 'utf8')).includes('浮球把阀门顶上'), `白板正文出现在文件里：${path}`)
    }

    // ---- 专家：能看白板，拿不到任何白板写工具 ----
    await second.sendMessage({ content: '委派只读专家' })
    assert.ok(specialistTools.length > 0, '专家没有被调用')
    for (const tools of specialistTools) {
      assert.ok(tools.includes('board_view'), JSON.stringify(tools))
      assert.ok(!tools.some(name => ['board_draw', 'board_update', 'board_supersede'].includes(name)), JSON.stringify(tools))
    }
    // ---- 主 Agent 的白板写工具权限类别是「编辑」，默认放行，不出审批 ----
    assert.equal(second.displayState.get().pendingApprovals.size, 0)
  } finally { await env.close() }
})

test('主题现状注入守硬上限：区块新的优先，超出的告诉模型去 board_view 看全', { timeout: 30000 }, async () => {
  const env = await environment(() => textReply('好'))
  try {
    ensureTopic(env.service, 'big', '大主题')
    const origin = { threadId: 'big:a', runId: 'r1' }
    for (let i = 0; i < 8; i++) env.studio.board.draw('big', { kind: 'text', title: `第${i}块${'很长的标题'.repeat(12)}`.slice(0, 80), content: { markdown: '内容'.repeat(400) } }, origin)
    for (let i = 0; i < 60; i++) {
      const { item } = await env.studio.library.add({ name: `材料${i}.txt`, bytes: new TextEncoder().encode(`材料正文 ${i}`), addedBy: 'you', title: `第${i}份${'相当长的材料标题'.repeat(6)}` })
      env.studio.topics.reference('big', item.id)
    }
    const text = topicState(env.studio, 'big')
    assert.ok(estimateTokens(text) <= TOPIC_STATE_TOKENS, `${estimateTokens(text)} 超过上限`)
    assert.match(text, /用 board_view \/ list_materials 看全/)
    assert.match(text, /第7块/, '最新的区块应当优先保留')
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

test('R8：画到一半停下，已落库的区块完整、没有半块，版本照样写入', { timeout: 60000 }, async () => {
  const hold = gate(), second = gate()
  const env = await environment(async (request, signal) => {
    const { results } = said(request)
    if (results === 0) return toolReply('board_draw', { kind: 'table', title: '对照', content: { columns: ['系统', '反馈'], rows: [['水箱', '浮球'], ['恒温器', '温度']] } }, 'call-1')
    second.open()
    await Promise.race([hold.promise, new Promise(resolve => signal?.addEventListener('abort', resolve))])
    return toolReply('board_draw', { kind: 'text', title: '不该出现', content: { markdown: '停下之后的' } }, 'call-2')
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
    const board = env.live('p')
    assert.deepEqual(board.blocks.map(block => block.title), ['对照'])
    assert.deepEqual(board.blocks[0]!.content, { columns: ['系统', '反馈'], rows: [['水箱', '浮球'], ['恒温器', '温度']] })
    await until(() => env.studio.board.versions(board.sheet.id).length === 1, '停下后没有写版本')
    assert.equal(env.studio.board.versions(board.sheet.id)[0]!.snapshot.blocks.length, 1)
  } finally { hold.open(); await env.close() }
})

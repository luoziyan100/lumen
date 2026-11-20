/**
 * [INPUT]: Real HTTP service and application root, Mastra Controller tool loop, catalog.sqlite boards, deterministic model over HTTP
 * [OUTPUT]: Evidence for R16 and the revised R11: selection route round trip and fallback; a run writes only to the sheet selected when it
 *           started (even with a newer sheet, and when the user switches mid-run); the target survives an approval wait and a service restart;
 *           a background expert's read after the parent run ended captures nothing; a folded target rejects writes and leaves no draw; no selection keeps the newest live sheet; no capacity (R11 revised); other sheets' elements refused; R7 snapshots only the target
 * [POS]: board-target mechanism acceptance; the controllable model proves the mechanism and does not stand in for real model research
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createHttpService } from '../../src/server.ts'
import { topicState } from '../../src/studio/board-tools.ts'
import { fixtureProvider, textReply, toolReply, type ProviderRequest, type Reply } from '../provider-fixture.ts'
import { ensureTopic } from '../topic-fixture.ts'

const token = 'board-target-token-at-least-24-characters'
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
const said = (request: ProviderRequest) => {
  const lastUser = request.messages.map(message => message.role).lastIndexOf('user')
  return { text: JSON.stringify(request.messages[lastUser]), results: request.messages.slice(lastUser).filter(message => message.role === 'tool').length }
}
const system = (request: ProviderRequest) => request.messages.filter(message => message.role === 'system').map(message => String(message.content)).join('\n')
const toolText = (request: ProviderRequest) => JSON.stringify(request.messages.filter(message => message.role === 'tool'))

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

type Respond = (request: ProviderRequest, signal?: AbortSignal | null) => Reply | Promise<Reply>

async function environment(respond: Respond, existing?: string) {
  const dataRoot = existing ?? await mkdtemp(join(tmpdir(), 'lumen-board-target-'))
  const fixture = fixtureProvider(respond)
  const model = { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch }
  const service = await createHttpService({ dataRoot, token, model })
  const studio = service.application.studio
  const request = (path: string, init: RequestInit = {}) => service.app.request(path, { ...init, headers })
  return { dataRoot, fixture, service, studio, request,
    open: (topic: string, task: string) => request(`/lumen/topics/${topic}/sessions`, { method: 'POST', body: JSON.stringify({ taskId: task }) }),
    send: (resourceId: string, message: string) => request(`/api/agent-controller/lumen/sessions/${encodeURIComponent(resourceId)}/messages`, { method: 'POST', body: JSON.stringify({ message }) }),
    sheets: async (topic: string) => await (await request(`/lumen/topics/${topic}/sheets`)).json() as { items: { id: string; title: string }[]; writable: string | null; selected: string | null; target: string | null },
    select: (topic: string, sheetId: string) => request(`/lumen/topics/${topic}/selection`, { method: 'PUT', body: JSON.stringify({ sheetId }) }),
    plus: async (topic: string) => (await (await request(`/lumen/topics/${topic}/sheets`, { method: 'POST', body: '{}' })).json() as { id: string }).id,
    /** What the AI drew on a sheet: its queued draws by card title (nothing lays them out in these tests) */
    blocks: (sheetId: string) => studio.board.canvas.ops(sheetId).map(op => op.title),
    versions: (sheetId: string) => studio.board.canvas.snapshots(sheetId),
    async close(keep = false) { await service.close(); if (!keep) await rm(dataRoot, { recursive: true, force: true }) },
  }
}

const draw = (title: string, id: string) => toolReply('board_draw', { title, elements: [{ type: 'text', x: 0, y: 0, text: title }] }, id)

test('R16 selection: route round trip, ＋ selects the new sheet, foreign or unknown sheets are refused, a missing selection falls back to the newest live sheet', { timeout: 30000 }, async () => {
  const env = await environment(() => textReply('好'))
  try {
    ensureTopic(env.service, 'p', '反馈'); ensureTopic(env.service, 'q')
    const first = (await env.sheets('p')).items[0]!.id
    const initial = await env.sheets('p')
    assert.deepEqual([initial.selected, initial.target], [first, null], 'no selection yet: the newest live sheet')
    const second = await env.plus('p'), third = await env.plus('p')
    assert.equal((await env.sheets('p')).selected, third, '＋ makes the new sheet the selection')
    assert.equal((await env.select('p', second)).status, 200)
    assert.equal((await env.sheets('p')).selected, second)
    assert.equal((await env.sheets('p')).writable, third, 'the old writable field still names the newest live sheet')
    // ---- survives a service restart ----
    await env.close(true)
    const again = await environment(() => textReply('好'), env.dataRoot)
    try {
      assert.equal((await again.sheets('p')).selected, second, 'selection persists in catalog.sqlite')
      const foreign = (await again.sheets('q')).items[0]!.id
      assert.equal((await again.select('p', foreign)).status, 404, 'a sheet of another topic is refused')
      assert.equal((await again.select('p', 'nope')).status, 404)
      assert.equal((await again.select('p', '')).status, 400)
      assert.equal((await again.sheets('p')).selected, second, 'refused selections leave the stored one')
      // ---- the stored sheet disappears: fall back to the newest live sheet ----
      again.studio.db.prepare('DELETE FROM sheets WHERE id = ?').run(second)
      assert.equal((await again.sheets('p')).selected, third)
    } finally { await again.close() }
  } catch (error) { await env.close().catch(() => {}); throw error }
})

test('R16 run target: sheet 2 selected while sheet 3 is newer; switching to sheet 3 mid-run does not move the target; R7 versions only sheet 2; the next run follows the new selection', { timeout: 60000 }, async () => {
  const drewFirst = gate(), resume = gate()
  const prompts: string[] = []
  const env = await environment(async request => {
    const { text, results } = said(request)
    if (text.includes('画两块')) {
      prompts.push(system(request))
      if (results === 0) return draw('第一块', 'call-1')
      if (results === 1) { drewFirst.open(); await resume.promise; return draw('第二块', 'call-2') }
      if (results === 2) return toolReply('board_view', {}, 'call-3')
      return textReply('画好了')
    }
    if (text.includes('再画')) return results === 0 ? draw('下一轮', 'call-4') : textReply('好')
    return textReply('好')
  })
  try {
    ensureTopic(env.service, 'p', '反馈')
    const first = (await env.sheets('p')).items[0]!.id, second = await env.plus('p'), third = await env.plus('p')
    assert.equal((await env.select('p', second)).status, 200)
    assert.equal((await env.open('p', 'a')).status, 201)
    const sent = env.send('p:a', '画两块')
    await drewFirst.promise
    // ---- mid-run: the target is on record and the user switches tabs (and even adds a sheet) ----
    assert.equal((await env.sheets('p')).target, second, 'the sheets list reports the run target while it runs')
    assert.equal((await env.select('p', third)).status, 200)
    const fourth = await env.plus('p')
    assert.equal((await env.sheets('p')).selected, fourth)
    resume.open()
    assert.equal((await sent).status, 200)
    const session = await env.service.application.session('p', 'a')
    await until(() => !session.displayState.get().isRunning && env.versions(second).length === 1, 'run did not finish with a version on sheet 2')
    assert.deepEqual(env.blocks(second), ['第一块', '第二块'])
    for (const other of [first, third, fourth]) assert.deepEqual(env.blocks(other), [], 'no block outside the target')
    // ---- every request of the run described sheet 2, and board_view returned sheet 2 ----
    assert.ok(prompts.length >= 3 && prompts.every(prompt => prompt.includes('这一轮的白板「白板 2」')), prompts.map(prompt => prompt.slice(prompt.indexOf('现状'), prompt.indexOf('现状') + 120)).join('\n---\n'))
    assert.ok(toolText(env.fixture.requests.at(-1)!).includes(second), 'board_view returned the target sheet')
    // ---- R7: only the target gets a version ----
    for (const other of [first, third, fourth]) assert.equal(env.versions(other).length, 0)
    assert.deepEqual(env.versions(second)[0]!.ops.map(op => op.title), ['第一块', '第二块'])
    assert.equal((await env.sheets('p')).target, null, 'no target once the run is over')
    // ---- the next run takes the selection at its own send time ----
    assert.equal((await env.send('p:a', '再画')).status, 200)
    await until(() => env.blocks(fourth).length === 1, 'next run did not write to the new selection')
    assert.deepEqual(env.blocks(second), ['第一块', '第二块'])
  } finally { resume.open(); await env.close() }
})

test('R16 reads outside the run do not capture: a background expert views the board after the parent run ended, the next run still writes to the sheet selected at its send', { timeout: 60000 }, async () => {
  const childGo = gate(), childViewed = gate()
  const env = await environment(async request => {
    const { text, results } = said(request)
    const parent = request.tools?.some(tool => tool.function.name === 'agent-reader')
    if (!parent && JSON.stringify(request.messages).includes('CHILD_VIEW')) {
      if (results === 0) { await childGo.promise; return toolReply('board_view', {}, 'child-view') }
      childViewed.open(); return textReply('专家看完了')
    }
    if (text.includes('委派')) return results === 0 ? toolReply('agent-reader', { prompt: 'CHILD_VIEW', _background: { disposition: 'deferred' } }, 'delegate') : textReply('专家在后台看')
    if (text.includes('再画')) return results === 0 ? draw('第二轮', 'call-next') : textReply('好')
    return textReply('好')
  })
  try {
    ensureTopic(env.service, 'p', '反馈')
    const first = (await env.sheets('p')).items[0]!.id, second = await env.plus('p'), third = await env.plus('p')
    assert.equal((await env.select('p', first)).status, 200)
    assert.equal((await env.open('p', 'a')).status, 201)
    assert.equal((await env.send('p:a', '委派')).status, 200)
    const session = await env.service.application.session('p', 'a')
    await until(() => !session.displayState.get().isRunning && env.studio.board.runTargets('p').length === 0, 'parent run did not end and release its target')
    // ---- outside any parent run: the user switches to sheet 3, then the expert reads the board ----
    assert.equal((await env.select('p', third)).status, 200)
    childGo.open()
    await childViewed.promise
    assert.ok(toolText(env.fixture.requests.at(-1)!).includes(third), 'the expert sees the current selection')
    assert.deepEqual(env.studio.board.runTargets('p'), [], 'a read outside the run leaves no target on record')
    // ---- the next run takes the selection at its own send time ----
    assert.equal((await env.select('p', second)).status, 200)
    assert.equal((await env.send('p:a', '再画')).status, 200)
    await until(() => env.blocks(second).length === 1, 'next run did not write to the sheet selected at send')
    assert.deepEqual([env.blocks(first), env.blocks(third)], [[], []], 'nothing on the sheet the expert happened to read')
  } finally { childGo.open(); await env.close() }
})

test('R16 across a wait and a restart: a run parked on an approval keeps its target after the service restarts and the user switches sheets', { timeout: 60000 }, async () => {
  const respond: Respond = request => {
    const { text, results } = said(request)
    if (!text.includes('先画再记')) return textReply('好')
    if (results === 0) return draw('批准前', 'call-1')
    if (results === 1) return toolReply('write_file', { path: 'notes/n.md', content: '记一笔' }, 'call-write')
    if (results === 2) return draw('批准后', 'call-3')
    return textReply('都好了')
  }
  const env = await environment(respond)
  let after: Awaited<ReturnType<typeof environment>> | undefined
  try {
    ensureTopic(env.service, 'p', '反馈')
    const first = (await env.sheets('p')).items[0]!.id, second = await env.plus('p')
    assert.equal((await env.select('p', first)).status, 200)
    assert.equal((await env.open('p', 'a')).status, 201)
    const session = await env.service.application.session('p', 'a')
    await session.permissions.setForTool({ toolName: 'write_file', policy: 'ask' })
    let parked!: () => void
    const pending = new Promise<void>(resolve => { parked = resolve })
    session.subscribe(event => { if (event.type === 'tool_approval_required') parked() })
    assert.equal((await env.send('p:a', '先画再记')).status, 200)
    await pending
    assert.deepEqual(env.blocks(first), ['批准前'])
    assert.equal((await env.sheets('p')).target, first, 'waiting on the user still holds the target')
    await env.close(true)

    after = await environment(respond, env.dataRoot)
    assert.equal((await after.select('p', second)).status, 200, 'user switches to sheet 2 while the run waits')
    const resumed = await after.service.application.session('p', 'a')
    assert.equal(resumed.displayState.get().pendingApprovals.size, 1, 'approval card restored after restart')
    assert.equal((await after.sheets('p')).target, first, 'the restored wait still reports the original target')
    const ack = await after.request(`/api/agent-controller/lumen/sessions/${encodeURIComponent('p:a')}/tool-approval`, { method: 'POST', body: JSON.stringify({ toolCallId: 'call-write', approved: true }) })
    assert.equal(ack.status, 200)
    await until(() => after!.blocks(first).length === 2, 'resumed run did not draw on the original target')
    assert.deepEqual(after.blocks(first), ['批准前', '批准后'])
    assert.deepEqual(after.blocks(second), [])
    // Shutdown already versions a parked run (existing R7 path, unchanged here); the resumed run adds its own, still only on the target
    await until(() => after!.versions(first).at(-1)?.ops.length === 2, 'resumed run did not version the target')
    assert.equal(after.versions(second).length, 0)
    await until(async () => (await after!.sheets('p')).target === null, 'target not released after the run')
  } finally { if (after) await after.close(); else await env.close() }
})

test('R16 across a suspension: a run waiting on ask_user keeps its target through a restart and the answer, while the user selects another sheet', { timeout: 60000 }, async () => {
  const respond: Respond = request => {
    const { text, results } = said(request)
    if (!text.includes('问完再画')) return textReply('好')
    const answered = JSON.stringify(request.messages).includes('User answered')
    if (!answered) return results === 0 ? draw('提问前', 'call-1') : toolReply('ask_user', { question: '画哪一边？' }, 'call-ask')
    return JSON.stringify(request.messages.at(-1)).includes('call-draw-2') ? textReply('画好了') : draw('回答后', 'call-draw-2')
  }
  const env = await environment(respond)
  let after: Awaited<ReturnType<typeof environment>> | undefined
  try {
    ensureTopic(env.service, 'p', '反馈')
    const first = (await env.sheets('p')).items[0]!.id, second = await env.plus('p')
    assert.equal((await env.select('p', first)).status, 200)
    assert.equal((await env.open('p', 'a')).status, 201)
    const session = await env.service.application.session('p', 'a')
    assert.equal((await env.send('p:a', '问完再画')).status, 200)
    await until(() => session.displayState.get().pendingSuspensions.size === 1, 'did not suspend on ask_user')
    assert.equal((await env.sheets('p')).target, first)
    await env.close(true)

    after = await environment(respond, env.dataRoot)
    assert.equal((await after.select('p', second)).status, 200)
    const resumed = await after.service.application.session('p', 'a')
    assert.equal(resumed.displayState.get().pendingSuspensions.size, 1, 'question restored after restart')
    const answer = await after.request(`/api/agent-controller/lumen/sessions/${encodeURIComponent('p:a')}/tool-suspension`, { method: 'POST', body: JSON.stringify({ toolCallId: 'call-ask', resumeData: '左边' }) })
    assert.equal(answer.status, 200)
    await until(() => after!.blocks(first).length === 2, 'answered run did not draw on the original target')
    assert.deepEqual(after.blocks(first), ['提问前', '回答后'])
    assert.deepEqual(after.blocks(second), [])
    await until(async () => (await after!.sheets('p')).target === null && !resumed.displayState.get().isRunning, 'target not released after the run')
    assert.equal(after.versions(second).length, 0)
  } finally { if (after) await after.close(); else await env.close() }
})

test('R16 folded target: writes are rejected with a message the model relays, no block lands, and the summary says the board is read-only', { timeout: 60000 }, async () => {
  const env = await environment(request => {
    const { text, results } = said(request)
    if (text.includes('画在收起的')) {
      if (results === 0) return draw('不该出现', 'call-1')
      if (results === 1) return toolReply('board_update', { title: '也不该', elements: [{ id: 'a0000000', x: 1 }] }, 'call-2')
      return textReply('这张已经收起了')
    }
    return textReply('好')
  })
  try {
    ensureTopic(env.service, 'p', '反馈')
    const first = (await env.sheets('p')).items[0]!.id, second = await env.plus('p')
    env.studio.db.prepare(`UPDATE sheets SET state = 'folded' WHERE id = ?`).run(first)
    assert.equal((await env.select('p', first)).status, 200, 'a folded sheet can still be selected (to read it)')
    assert.equal((await env.open('p', 'a')).status, 201)
    assert.equal((await env.send('p:a', '画在收起的白板上')).status, 200)
    const session = await env.service.application.session('p', 'a')
    await until(() => !session.displayState.get().isRunning && env.fixture.requests.length >= 3, 'run did not finish')
    const results = toolText(env.fixture.requests.at(-1)!)
    assert.match(results, /用户这一轮选中的白板「反馈」已经收起，只读：这一轮不写白板/)
    assert.equal((results.match(/已经收起，只读/g) ?? []).length, 2, 'draw and update are both refused')
    assert.match(system(env.fixture.requests[0]!), /用户这一轮选中的白板「反馈」已经收起，只读：这一轮不写白板，在对话里说明/)
    assert.deepEqual(env.blocks(first), []); assert.deepEqual(env.blocks(second), [], 'no silent fallback to another sheet')
  } finally { await env.close() }
})

test('No selection keeps the newest live sheet; the canvas has no capacity (R11 revised 2026-11-19); elements on other sheets cannot be changed or erased from this run', { timeout: 60000 }, async () => {
  const env = await environment(request => {
    const { text, results } = said(request)
    if (text.includes('接着画')) return results === 0 ? draw('第一百零一笔', 'call-1') : textReply('画上了')
    if (text.includes('改旁边')) {
      if (results === 0) return toolReply('board_update', { title: '改了', elements: [{ id: 'aside', x: 5 }] }, 'call-2')
      if (results === 1) return toolReply('board_erase', { ids: ['aside'], reason: '试试' }, 'call-3')
      return textReply('改不了')
    }
    return textReply('好')
  })
  try {
    ensureTopic(env.service, 'p', '反馈')
    const first = (await env.sheets('p')).items[0]!.id, second = await env.plus('p')
    env.studio.db.prepare('DELETE FROM sheet_selection WHERE topic_id = ?').run('p')
    assert.equal((await env.sheets('p')).selected, second, 'a client that never selected: newest live sheet')
    const canvas = env.studio.board.canvas
    canvas.save(second, Array.from({ length: 100 }, (_, i) => ({ id: `u${i}`, type: 'freedraw', version: 1, x: i, y: 0, width: 10, height: 10 })))
    const op = canvas.queueDraw(first, '旁边', [{ type: 'rectangle', id: 'aside', x: 0, y: 0 }], { threadId: 'p:x', runId: 'r0' })
    canvas.commit(first, op.id, [{ id: 'aside', type: 'rectangle', version: 1, x: 0, y: 0, width: 10, height: 10 }])
    assert.equal((await env.open('p', 'a')).status, 201)
    assert.equal((await env.send('p:a', '接着画')).status, 200)
    const session = await env.service.application.session('p', 'a')
    await until(() => !session.displayState.get().isRunning && env.fixture.requests.length >= 2, 'run did not finish')
    assert.deepEqual(env.blocks(second), ['第一百零一笔'], '100 elements on the sheet, the AI still draws: no capacity')
    assert.doesNotMatch(toolText(env.fixture.requests.at(-1)!), /满了/)
    assert.equal(env.studio.board.sheets('p').length, 2, 'the AI never opens a sheet')

    const before = env.fixture.requests.length
    assert.equal((await env.send('p:a', '改旁边那张上的元素')).status, 200)
    await until(() => !session.displayState.get().isRunning && env.fixture.requests.length >= before + 3, 'run did not finish')
    const refused = toolText(env.fixture.requests.at(-1)!)
    assert.equal((refused.match(/这张白板上没有 aside/g) ?? []).length, 2, refused)
    const untouched = canvas.liveElements(first).find(row => row.element.id === 'aside')!
    assert.deepEqual([untouched.element.x, untouched.element.version], [0, 1])
  } finally { await env.close() }
})

test('topicState: a run target overrides the newest live sheet; without a target the summary keeps today\'s behaviour', { timeout: 30000 }, async () => {
  const env = await environment(() => textReply('好'))
  try {
    ensureTopic(env.service, 'p', '反馈')
    const first = (await env.sheets('p')).items[0]!.id
    await env.plus('p')
    assert.match(topicState(env.studio, 'p'), /这一轮的白板「白板 2」/)
    assert.match(topicState(env.studio, 'p', undefined, env.studio.board.sheet(first)), /这一轮的白板「反馈」/)
    assert.match(topicState(env.studio, 'p', undefined, null), /这个主题现在没有进行中的白板/)
  } finally { await env.close() }
})

/**
 * [INPUT]: Real HTTP service and application root, Mastra Controller tool loop, catalog.sqlite boards, deterministic model over HTTP
 * [OUTPUT]: Evidence for R17: empty sheets delete at once; a sheet with blocks needs ?confirm=true (409 carries the count) and then loses its
 *           blocks, versions, selection and target rows in one transaction (an injected failure leaves everything); foreign/missing → 404;
 *           the target of a running run and of a run waiting on an approval (also after a restart, before the session reopens) is refused,
 *           allowed once the run ends; a stale target row and a target captured during the activity read; selection moves next/previous/none;
 *           the last sheet goes and ＋ still works; the next run after deleting the selected sheet writes to the new selection (R16);
 *           cards learn a block's sheet is gone; the model's tool list has no delete
 * [POS]: board-delete mechanism acceptance; the controllable model proves the mechanism and does not stand in for real model research
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createHttpService } from '../../src/server.ts'
import { fixtureProvider, textReply, toolReply, type ProviderRequest, type Reply } from '../provider-fixture.ts'
import { ensureTopic } from '../topic-fixture.ts'

const token = 'board-delete-token-at-least-24-characters'
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
const said = (request: ProviderRequest) => {
  const lastUser = request.messages.map(message => message.role).lastIndexOf('user')
  return { text: JSON.stringify(request.messages[lastUser]), results: request.messages.slice(lastUser).filter(message => message.role === 'tool').length }
}

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
type Json = Record<string, unknown>

async function environment(respond: Respond, existing?: string) {
  const dataRoot = existing ?? await mkdtemp(join(tmpdir(), 'lumen-board-delete-'))
  const fixture = fixtureProvider(respond)
  const model = { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch }
  const service = await createHttpService({ dataRoot, token, model })
  const studio = service.application.studio
  const request = (path: string, init: RequestInit = {}) => service.app.request(path, { ...init, headers })
  const json = async (response: Response) => ({ status: response.status, body: await response.json().catch(() => null) as Json })
  return { dataRoot, fixture, service, studio, request,
    open: (topic: string, task: string) => request(`/lumen/topics/${topic}/sessions`, { method: 'POST', body: JSON.stringify({ taskId: task }) }),
    send: (resourceId: string, message: string) => request(`/api/agent-controller/lumen/sessions/${encodeURIComponent(resourceId)}/messages`, { method: 'POST', body: JSON.stringify({ message }) }),
    sheets: async (topic: string) => await (await request(`/lumen/topics/${topic}/sheets`)).json() as { items: { id: string; title: string }[]; selected: string | null; target: string | null },
    select: (topic: string, sheetId: string) => request(`/lumen/topics/${topic}/selection`, { method: 'PUT', body: JSON.stringify({ sheetId }) }),
    plus: async (topic: string) => (await (await request(`/lumen/topics/${topic}/sheets`, { method: 'POST', body: '{}' })).json() as { id: string; title: string }),
    remove: async (topic: string, sheetId: string, confirm = false) => json(await request(`/lumen/topics/${topic}/sheets/${sheetId}${confirm ? '?confirm=true' : ''}`, { method: 'DELETE' })),
    block: async (blockId: string) => json(await request(`/lumen/blocks/${blockId}`)),
    blocks: (sheetId: string) => studio.board.view(sheetId).blocks.map(block => block.title),
    async close(keep = false) { await service.close(); if (!keep) await rm(dataRoot, { recursive: true, force: true }) },
  }
}

/** Rows that belong to a sheet, read straight from catalog.sqlite on a second connection. */
function rows(dataRoot: string, sheetId: string) {
  const db = new DatabaseSync(join(dataRoot, 'catalog.sqlite'), { readOnly: true })
  try {
    const count = (sql: string) => Number(db.prepare(sql).get(sheetId)!.n)
    return { sheets: count('SELECT COUNT(*) AS n FROM sheets WHERE id = ?'), blocks: count('SELECT COUNT(*) AS n FROM blocks WHERE sheet_id = ?'),
      versions: count('SELECT COUNT(*) AS n FROM sheet_versions WHERE sheet_id = ?'), selection: count('SELECT COUNT(*) AS n FROM sheet_selection WHERE sheet_id = ?'),
      targets: count('SELECT COUNT(*) AS n FROM run_targets WHERE sheet_id = ?') }
  } finally { db.close() }
}

const draw = (title: string, id: string) => toolReply('board_draw', { kind: 'text', title, content: { markdown: title } }, id)

test('R17 delete: empty at once; content needs confirmation with the count; one transaction (an injected failure deletes nothing); foreign or missing 404; cards learn the sheet is gone', { timeout: 60000 }, async () => {
  const env = await environment(request => {
    const { text, results } = said(request)
    if (text.includes('画两块')) return results === 0 ? draw('第一块', 'c1') : results === 1 ? draw('第二块', 'c2') : textReply('画好了')
    return textReply('好')
  })
  try {
    ensureTopic(env.service, 'p', '反馈'); ensureTopic(env.service, 'q', '别的')
    const first = (await env.sheets('p')).items[0]!.id, empty = (await env.plus('p')).id, full = (await env.plus('p')).id
    // ---- the run draws two blocks on the selected sheet and leaves a version (R7) ----
    assert.equal((await env.open('p', 'a')).status, 201)
    assert.equal((await env.send('p:a', '画两块')).status, 200)
    await until(() => env.studio.board.versions(full).length === 1 && env.studio.board.runTargets('p').length === 0, 'run did not finish with a version')
    const blockId = env.studio.board.view(full).blocks[0]!.id
    assert.deepEqual(await env.block(blockId), { status: 200, body: { blockId, sheetId: full, topicId: 'p' } })
    // ---- empty: deleted directly; it was not the selection, so the selection stays ----
    assert.deepEqual(await env.remove('p', empty), { status: 200, body: { deleted: empty, selected: full } })
    assert.deepEqual(rows(env.dataRoot, empty), { sheets: 0, blocks: 0, versions: 0, selection: 0, targets: 0 })
    // ---- content without confirmation: 409 with the count, nothing deleted ----
    const refused = await env.remove('p', full)
    assert.equal(refused.status, 409)
    assert.deepEqual([refused.body.reason, refused.body.blocks], ['confirm', 2])
    assert.match(String(refused.body.error), /2 块内容.*不能恢复/)
    assert.deepEqual(rows(env.dataRoot, full), { sheets: 1, blocks: 2, versions: 1, selection: 1, targets: 0 })
    // ---- other topic and missing sheet ----
    assert.equal((await env.remove('q', full, true)).status, 404, 'a sheet of another topic')
    assert.equal((await env.remove('p', 'no-such-sheet', true)).status, 404)
    assert.equal((await env.remove('nobody', full, true)).status, 404, 'unknown topic')
    // ---- one transaction: fail the last statement (the sheet row) after blocks and versions were deleted, and nothing is gone ----
    const writer = new DatabaseSync(join(env.dataRoot, 'catalog.sqlite'))
    writer.exec(`CREATE TRIGGER inject_failure BEFORE DELETE ON sheets BEGIN SELECT RAISE(ABORT, 'injected failure'); END`)
    const failed = await env.request(`/lumen/topics/p/sheets/${full}?confirm=true`, { method: 'DELETE' })
    assert.equal(failed.status, 500)
    assert.deepEqual(rows(env.dataRoot, full), { sheets: 1, blocks: 2, versions: 1, selection: 1, targets: 0 }, 'blocks, versions and selection all survive the failure')
    writer.exec('DROP TRIGGER inject_failure'); writer.close()
    // ---- with confirmation: sheet, blocks, versions and selection go; the selection moves to the neighbour (only the previous one remains) ----
    assert.deepEqual(await env.remove('p', full, true), { status: 200, body: { deleted: full, selected: first } })
    assert.deepEqual(rows(env.dataRoot, full), { sheets: 0, blocks: 0, versions: 0, selection: 0, targets: 0 })
    assert.equal((await env.sheets('p')).selected, first)
    // ---- the card's block: its sheet is gone ----
    assert.deepEqual(await env.block(blockId), { status: 404, body: { reason: 'deleted', error: '这块所在的白板已删除' } })
  } finally { await env.close() }
})

test('R17 selection after delete: next by ord, else previous, else none; the last sheet can go and ＋ still works without a duplicate title', { timeout: 30000 }, async () => {
  const env = await environment(() => textReply('好'))
  try {
    ensureTopic(env.service, 'p', '反馈')
    const one = (await env.sheets('p')).items[0]!.id, two = (await env.plus('p')).id, three = (await env.plus('p')).id
    // ---- selected sheet in the middle: the next one ----
    assert.equal((await env.select('p', two)).status, 200)
    assert.deepEqual((await env.remove('p', two)).body, { deleted: two, selected: three })
    // ---- selected sheet at the end: the previous one ----
    assert.deepEqual((await env.remove('p', three)).body, { deleted: three, selected: one })
    // ---- deleting a sheet that is not selected leaves the selection ----
    const four = await env.plus('p')
    assert.equal(four.title, '白板 2', 'the first free default number')
    assert.equal((await env.select('p', one)).status, 200)
    assert.deepEqual((await env.remove('p', four.id)).body, { deleted: four.id, selected: one })
    // ---- the last sheet: allowed, then nothing is selected and the list is empty ----
    assert.deepEqual((await env.remove('p', one)).body, { deleted: one, selected: null })
    assert.deepEqual(await env.sheets('p'), { items: [], writable: null, selected: null, target: null })
    // ---- ＋ after that: a fresh sheet, selected ----
    const fresh = await env.plus('p')
    assert.equal((await env.sheets('p')).selected, fresh.id)
    const five = await env.plus('p')
    assert.notEqual(five.title, fresh.title, 'default titles do not repeat after deletes')
  } finally { await env.close() }
})

test('R17 running target: refused while the run draws on it, allowed after it ends; deleting the selected sheet sends the next run to the new selection (R16)', { timeout: 60000 }, async () => {
  const drew = gate(), resume = gate()
  const tools: string[][] = []
  const env = await environment(async request => {
    const { text, results } = said(request)
    if (request.tools) tools.push(request.tools.map(tool => tool.function.name))
    if (text.includes('慢慢画')) {
      if (results === 0) return draw('第一块', 'c1')
      if (results === 1) { drew.open(); await resume.promise; return draw('第二块', 'c2') }
      return textReply('画好了')
    }
    if (text.includes('再画')) return results === 0 ? draw('下一轮', 'c3') : textReply('好')
    return textReply('好')
  })
  try {
    ensureTopic(env.service, 'p', '反馈')
    const first = (await env.sheets('p')).items[0]!.id, second = (await env.plus('p')).id, third = (await env.plus('p')).id
    assert.equal((await env.select('p', second)).status, 200)
    assert.equal((await env.open('p', 'a')).status, 201)
    const sent = env.send('p:a', '慢慢画')
    await drew.promise
    // ---- mid-run: the target cannot go, with or without confirmation; other sheets still can ----
    for (const confirm of [false, true]) {
      const refused = await env.remove('p', second, confirm)
      assert.equal(refused.status, 409)
      assert.equal(refused.body.reason, 'target')
      assert.match(String(refused.body.error), /正被 AI 这一轮写着/)
    }
    assert.equal((await env.remove('p', third)).status, 200, 'a sheet the run does not write to can be deleted mid-run')
    resume.open()
    assert.equal((await sent).status, 200)
    const session = await env.service.application.session('p', 'a')
    await until(() => !session.displayState.get().isRunning && env.studio.board.runTargets('p').length === 0, 'run did not end')
    assert.deepEqual(env.blocks(second), ['第一块', '第二块'])
    // ---- after the run: the selected sheet can go; the selection moves to the previous one, and the next run writes there ----
    assert.deepEqual((await env.remove('p', second, true)).body, { deleted: second, selected: first })
    assert.equal((await env.send('p:a', '再画')).status, 200)
    await until(() => env.blocks(first).length === 1, 'next run did not write to the new selection')
    assert.deepEqual(env.blocks(first), ['下一轮'])
    // ---- no board tool deletes: the model sees the same four board tools as before ----
    const board = [...new Set(tools.flat())].filter(name => name.startsWith('board_')).sort()
    assert.deepEqual(board, ['board_draw', 'board_supersede', 'board_update', 'board_view'])
    assert.ok(!tools.flat().some(name => /delete|remove/i.test(name) && /sheet|board/i.test(name)), 'no tool deletes a board')
  } finally { resume.open(); await env.close() }
})

test('R17 waiting target: refused while the run waits on an approval, also after a restart before the session reopens; allowed once the run ends', { timeout: 60000 }, async () => {
  const respond: Respond = request => {
    const { text, results } = said(request)
    if (!text.includes('先画再记')) return textReply('好')
    if (results === 0) return draw('批准前', 'c1')
    if (results === 1) return toolReply('write_file', { path: 'notes/n.md', content: '记一笔' }, 'call-write')
    return textReply('都好了')
  }
  const env = await environment(respond)
  let after: Awaited<ReturnType<typeof environment>> | undefined
  try {
    ensureTopic(env.service, 'p', '反馈')
    const first = (await env.sheets('p')).items[0]!.id
    assert.equal((await env.open('p', 'a')).status, 201)
    const session = await env.service.application.session('p', 'a')
    await session.permissions.setForTool({ toolName: 'write_file', policy: 'ask' })
    let parked!: () => void
    const pending = new Promise<void>(resolve => { parked = resolve })
    session.subscribe(event => { if (event.type === 'tool_approval_required') parked() })
    assert.equal((await env.send('p:a', '先画再记')).status, 200)
    await pending
    assert.equal((await env.remove('p', first, true)).body.reason, 'target', 'waiting on the user holds the target')
    await env.close(true)

    after = await environment(respond, env.dataRoot)
    // ---- the session has not been reopened: the persisted wait still counts ----
    const refused = await after.remove('p', first, true)
    assert.equal(refused.status, 409, JSON.stringify(refused.body))
    assert.equal(refused.body.reason, 'target')
    await after.service.application.session('p', 'a')
    const ack = await after.request(`/api/agent-controller/lumen/sessions/${encodeURIComponent('p:a')}/tool-approval`, { method: 'POST', body: JSON.stringify({ toolCallId: 'call-write', approved: true }) })
    assert.equal(ack.status, 200)
    const resumed = await after.service.application.session('p', 'a')
    await until(() => !resumed.displayState.get().isRunning && !resumed.displayState.get().pendingApprovals.size && after!.studio.board.runTargets('p').length === 0, 'resumed run did not end')
    assert.deepEqual(await after.remove('p', first, true), { status: 200, body: { deleted: first, selected: null } })
  } finally { if (after) await after.close(); else await env.close() }
})

test('R17 stale and racing target rows: a row whose run is neither running nor waiting does not block and goes with the sheet; a row captured during the activity read blocks', { timeout: 30000 }, async () => {
  const env = await environment(() => textReply('好'))
  try {
    ensureTopic(env.service, 'p', '反馈')
    const first = (await env.sheets('p')).items[0]!.id, second = (await env.plus('p')).id
    // ---- stale: a target on record for a thread with no run (left by a crash) ----
    assert.equal(env.studio.board.runTarget('p:gone')?.id, second)
    assert.equal(rows(env.dataRoot, second).targets, 1)
    assert.equal((await env.sheets('p')).target, null, 'the list does not report a stale row either')
    assert.deepEqual((await env.remove('p', second)).body, { deleted: second, selected: first })
    assert.equal(rows(env.dataRoot, second).targets, 0)
    // ---- racing: the activity read began before a run captured this sheet; the delete must not take it ----
    const since = new Date(Date.now() - 1000).toISOString()
    assert.equal(env.studio.board.runTarget('p:racing')?.id, first)
    assert.throws(() => env.studio.board.deleteSheet('p', first, { confirmed: true, busy: new Set(), since }), (error: Error & { status?: number }) => error.status === 409)
    assert.equal(rows(env.dataRoot, first).sheets, 1)
    // ---- the same row read as stale (captured before the activity read) does not block ----
    const later = new Date(Date.now() + 1000).toISOString()
    assert.deepEqual(env.studio.board.deleteSheet('p', first, { confirmed: true, busy: new Set(), since: later }), { deleted: first, selected: null })
  } finally { await env.close() }
})

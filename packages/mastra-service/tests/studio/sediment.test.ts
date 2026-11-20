/**
 * [INPUT]: a real HTTP service and application root, the Mastra Controller tool loop, the catalog.sqlite sediment tables, a controllable model network
 * [OUTPUT]: mechanism evidence for P1-1: entries created/edited/deleted only through user HTTP (edits keep revision rows); the R13 quote check accepts deletion-only
 *           results in Chinese and English and refuses changed/added/reordered characters, splices, foreign threads; settled shares the entry transaction
 *           on old blocks (releases on the last link, rev conflicts, superseded is no evidence, every link marked retired); invites point at live elements of the run's
 *           target or at nothing, latest replaces, nothing written; sediment_quote binds the newest matching user message and its elementIds follow the invite rule
 *           (no evidence link from elements); confirm counts kept vs restored (S14); R17 keeps entries and marks links deleted (the confirm body carries the takeaway count); topicState carries sediment within its cap; entries write while a
 *           run is parked (S10); a run that never touches sediment leaves nothing behind
 * [POS]: P1-1's service-side mechanism acceptance; the controllable model proves mechanism only and never stands in for real-model acceptance
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createHttpService } from '../../src/server.ts'
import { topicState } from '../../src/studio/board-tools.ts'
import { layOut, legacyBlock } from './canvas-fixtures.ts'
import { quotePlan } from '../../src/studio/sediment.ts'
import { fixtureProvider, textReply, toolReply, type ProviderRequest, type Reply } from '../provider-fixture.ts'
import { ensureTopic } from '../topic-fixture.ts'

const token = 'sediment-token-at-least-24-characters'
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
const said = (request: ProviderRequest) => {
  const lastUser = request.messages.map(message => message.role).lastIndexOf('user')
  return { text: JSON.stringify(request.messages[lastUser]), results: request.messages.slice(lastUser).filter(message => message.role === 'tool').length }
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

async function environment(respond: Respond) {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-sediment-'))
  const fixture = fixtureProvider(respond)
  const model = { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch }
  const service = await createHttpService({ dataRoot, token, model })
  const studio = service.application.studio
  const request = (path: string, init: RequestInit = {}) => service.app.request(path, { ...init, headers })
  const json = async (response: Response) => ({ status: response.status, body: await response.json().catch(() => null) as Json })
  return { dataRoot, fixture, service, studio, request,
    open: (topic: string, task: string) => request(`/lumen/topics/${topic}/sessions`, { method: 'POST', body: JSON.stringify({ taskId: task }) }),
    send: (resourceId: string, message: string) => request(`/api/agent-controller/lumen/sessions/${encodeURIComponent(resourceId)}/messages`, { method: 'POST', body: JSON.stringify({ message }) }),
    sediment: async (topic: string) => await (await request(`/lumen/topics/${topic}/sediment`)).json() as { items: { id: string; text: string; origin: string; quote: { original: string } | null; links: { blockId: string; title: string; deleted: boolean; retired: boolean }[] }[]; offers: { id: string; text: string; original: string; fragments: { text: string }[] }[] },
    post: async (topic: string, body: unknown) => json(await request(`/lumen/topics/${topic}/sediment`, { method: 'POST', body: JSON.stringify(body) })),
    patch: async (topic: string, entryId: string, body: unknown) => json(await request(`/lumen/topics/${topic}/sediment/${entryId}`, { method: 'PATCH', body: JSON.stringify(body) })),
    drop: async (topic: string, entryId: string) => json(await request(`/lumen/topics/${topic}/sediment/${entryId}`, { method: 'DELETE' })),
    dismiss: async (topic: string, offerId: string) => json(await request(`/lumen/topics/${topic}/sediment/offers/${offerId}`, { method: 'DELETE' })),
    invite: async (sheetId: string) => await (await request(`/lumen/sheets/${sheetId}/invite`)).json() as { invite: { question: string; elementIds: string[] } | null },
    remove: async (topic: string, sheetId: string, confirm = false) => json(await request(`/lumen/topics/${topic}/sheets/${sheetId}${confirm ? '?confirm=true' : ''}`, { method: 'DELETE' })),
    async close() { await service.close(); await rm(dataRoot, { recursive: true, force: true }) },
  }
}

/** Row counts straight from the sediment tables (a second connection): nothing is soft-deleted — deleted means gone. */
function rows(dataRoot: string, table: string, where = '', ...args: string[]) {
  const db = new DatabaseSync(join(dataRoot, 'catalog.sqlite'), { readOnly: true })
  try {
    return Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table}${where ? ` WHERE ${where}` : ''}`).get(...args)!.n)
  } finally { db.close() }
}

/** An old block written straight into the kept blocks table: evidence links only ever point at these since the canvas (2026-11-19) */
const draw = (env: Awaited<ReturnType<typeof environment>>, title: string, sheetId?: string | null, topicId = 'p', state?: 'current' | 'superseded') =>
  ({ blockId: legacyBlock(env.studio.db, sheetId ?? env.studio.board.writableSheet(topicId).id, { title, state }) })
const blockState = (env: Awaited<ReturnType<typeof environment>>, blockId: string) => String(env.studio.db.prepare('SELECT state FROM blocks WHERE id = ?').get(blockId)!.state)

test('typed entries: create/list/edit (revision rows)/delete through HTTP; one plain line ≤280; nothing soft-deleted', { timeout: 30000 }, async () => {
  const env = await environment(() => textReply('好'))
  try {
    ensureTopic(env.service, 'p', '反馈')
    // ---- create: trimmed, typed, unverified ----
    assert.equal((await env.post('p', { text: '  注意力就是把查询和键对齐  ' })).status, 201)
    const first = (await env.sediment('p')).items[0]!
    assert.equal(first.text, '注意力就是把查询和键对齐')
    assert.equal(first.origin, 'typed')
    assert.equal(rows(env.dataRoot, 'sediment_entries', 'state = ?', 'unverified'), 1)
    // ---- one plain line: newline, empty and >280 chars are refused with the stable code ----
    for (const text of ['', '   ', '一行\n两行', 'x'.repeat(281)]) {
      const refused = await env.post('p', { text })
      assert.equal(refused.status, 400, JSON.stringify(refused.body))
      assert.equal(refused.body.code, 'sediment.text_invalid')
    }
    assert.equal((await env.post('p', { text: '第二条' })).status, 201)
    // ---- list: newest first ----
    const list = await env.sediment('p')
    assert.deepEqual(list.items.map(item => item.text), ['第二条', '注意力就是把查询和键对齐'])
    // ---- edit: the old wording goes to a revision row, never overwritten ----
    assert.equal((await env.patch('p', list.items[1]!.id, { text: '注意力=查询和键对齐' })).status, 200)
    assert.equal((await env.patch('p', list.items[1]!.id, { text: '再改一次' })).status, 200)
    const db = new DatabaseSync(join(env.dataRoot, 'catalog.sqlite'), { readOnly: true })
    try {
      assert.deepEqual(db.prepare('SELECT revision, old_text FROM sediment_revisions WHERE entry_id = ? ORDER BY revision').all(list.items[1]!.id)
        .map(row => ({ revision: Number(row.revision), old_text: String(row.old_text) })),
        [{ revision: 1, old_text: '注意力就是把查询和键对齐' }, { revision: 2, old_text: '注意力=查询和键对齐' }])
    } finally { db.close() }
    // ---- delete: physical, with revisions and links ----
    assert.equal((await env.drop('p', list.items[0]!.id)).status, 204)
    assert.equal((await env.drop('p', list.items[0]!.id)).status, 404)
    assert.equal((await env.drop('nobody', list.items[1]!.id)).status, 404)
    assert.equal(rows(env.dataRoot, 'sediment_entries'), 1)
    assert.equal(rows(env.dataRoot, 'sediment_revisions'), 2)
  } finally { await env.close() }
})

test('R13 quote check (storage): delete-only passes in Chinese and English; changed, added, reordered, joined and foreign-thread quotes are refused; fragments come back for the strikethrough', { timeout: 30000 }, async () => {
  const env = await environment(() => textReply('好'))
  try {
    ensureTopic(env.service, 'p', '反馈')
    const original = '我觉得 那个注意力就是对齐，嗯，这是我这轮最大的收获'
    const quote = { threadId: 'p:a', messageId: 'm1', original }
    // ---- delete-only in Chinese: the fragments are reported for the strikethrough (S9) ----
    const ok = env.studio.sediment.create('p', { text: '我觉得注意力就是对齐，这是我这轮最大的收获', origin: 'quoted', quote })
    assert.equal(ok.quote?.original, original, 'the full original is stored with the entry')
    assert.deepEqual(ok.quote?.fragments, [{ start: 3, end: 6, text: ' 那个' }, { start: 14, end: 16, text: '嗯，' }], JSON.stringify(ok.quote?.fragments))
    // ---- delete-only in English (no fixed tic list: any deletion the user accepts is fine) ----
    assert.ok(Array.isArray(quotePlan('I think, honestly, the sky is blue', 'the sky is blue')))
    const english = quotePlan('I think, honestly, the sky is blue', 'I think the sky is blue')
    assert.ok(Array.isArray(english) && english.every(fragment => fragment.text.trim()), 'delete-only in English passes')
    void english
    // ---- each refusal keeps the stable code and writes nothing ----
    const refusals: [string, string][] = [
      ['我觉得注意力是排列，这是我这轮最大的收获', 'a changed character'],
      ['我觉得那个注意力就是对齐了，这是我这轮最大的收获', 'an added character'],
      ['对齐就是我觉得那个注意力是', 'reordered words'],
      [`${original}。今天天气也好`, 'two sentences spliced after'],
      ['上一句说完。我觉得那个注意力就是对齐', 'text spliced before'],
    ]
    for (const [text, why] of refusals) {
      assert.throws(() => env.studio.sediment.create('p', { text, origin: 'quoted', quote }),
        (error: Error & { status?: number; code?: string }) => error.status === 400 && error.code === 'sediment.quote_invalid', why)
    }
    assert.equal(rows(env.dataRoot, 'sediment_entries'), 1, 'refusals wrote nothing')
    // ---- the thread must belong to this topic ----
    assert.throws(() => env.studio.sediment.create('p', { text: '我觉得注意力就是对齐', origin: 'quoted', quote: { ...quote, threadId: 'q:a' } }),
      (error: Error & { code?: string }) => error.code === 'sediment.quote_source', 'the thread must belong to this topic')
  } finally { await env.close() }
})

test('S3 evidence on old blocks: linking settles in the same transaction, the last link gone returns current; rev conflict and bad blocks refused; every link is marked retired', { timeout: 30000 }, async () => {
  const env = await environment(() => textReply('好'))
  try {
    ensureTopic(env.service, 'p', '反馈')
    const sheet = env.studio.board.sheets('p')[0]!
    const first = draw(env, '第一块', sheet.id).blockId
    // ---- link with the rev the UI saw: the block settles ----
    const linked = (await env.post('p', { text: '留这句', blocks: [{ id: first, rev: 1 }] })).body as { id: string; links: { retired: boolean }[] }
    assert.equal(blockState(env, first), 'settled')
    assert.deepEqual(linked.links.map(link => link.retired), [true], 'blocks retired with the canvas: the link is a title only')
    // ---- a second entry may lean on the same block; both must go before it returns to current ----
    const second = (await env.post('p', { text: '也靠它', blocks: [{ id: first, rev: 1 }] })).body as { id: string }
    await env.drop('p', linked.id)
    assert.equal(blockState(env, first), 'settled', 'one link left keeps it settled')
    await env.drop('p', second.id)
    assert.equal(blockState(env, first), 'current', 'the last link gone returns it to current')
    // ---- conflicts and bad targets keep the stable codes ----
    const stale = await env.post('p', { text: '对不上版本', blocks: [{ id: first, rev: 99 }] })
    assert.equal(stale.status, 409)
    assert.equal(stale.body.code, 'sediment.link_stale')
    ensureTopic(env.service, 'q', '别的')
    const otherTopic = draw(env, '别家的块', env.studio.board.sheets('q')[0]!.id, 'q').blockId
    const spare = draw(env, '被取代的块', sheet.id, 'p', 'superseded').blockId
    for (const blocks of [[{ id: 'no-such-block', rev: 1 }], [{ id: otherTopic, rev: 1 }], [{ id: spare, rev: 1 }]]) {
      const refused = await env.post('p', { text: '挂不上', blocks })
      assert.equal(refused.status, 400, JSON.stringify(refused.body))
      assert.equal(refused.body.code, 'sediment.link_invalid')
    }
  } finally { await env.close() }
})

test('sediment_invite: points only at live elements of the run target sheet (R16) or at nothing, latest replaces earlier, writes no entry', { timeout: 60000 }, async () => {
  let calls = 0
  const call = (name: string, args: unknown) => toolReply(name, args, `call-${++calls}`)
  const env = await environment(request => {
    const { text, results } = said(request)
    // the newest tool result that actually carries a block id (a refused invite's error result carries none)
    const lastBlockId = () => {
      for (const message of [...request.messages].reverse()) if (message.role === 'tool') {
        // a refused tool's result is plain text, not JSON: skip what does not parse
        let parsed: { blockId?: string } = {}
        try { parsed = JSON.parse(String(message.content ?? '{}')) as { blockId?: string } } catch { /* plain-text refusal */ }
        if (parsed.blockId) return parsed.blockId
      }
      return undefined
    }
    if (text.includes('画一块')) return results ? textReply('画好了') : call('board_draw', { title: '值得留的一块', elements: [{ type: 'text', x: 0, y: 0, text: '对齐' }] })
    if (text.includes('邀请')) return results ? textReply('请用户写一句') : call('sediment_invite', { elementIds: [lastBlockId()], question: '注意力是什么，用你自己的话说？' })
    if (text.includes('再邀')) return results ? textReply('换了个问法') : call('sediment_invite', { question: '换成：对齐在做什么？' })
    if (text.includes('邀别家')) return results ? textReply('被拒了') : call('sediment_invite', { elementIds: [lastBlockId()], question: '错块' })
    return textReply('好')
  })
  try {
    ensureTopic(env.service, 'p', '反馈')
    const here = env.studio.board.sheets('p')[0]!
    assert.equal((await env.open('p', 'a')).status, 201)
    const session = await env.service.application.session('p', 'a')
    // ---- draw a block on the run target; the tool result hands the model its id ----
    assert.equal((await env.send('p:a', '画一块')).status, 200)
    await until(() => env.studio.board.canvas.ops(here.id).length === 1, 'draw did not queue')
    // the app lays the draw out, so the element is live on the sheet
    const [op] = env.studio.board.canvas.ops(here.id)
    env.studio.board.canvas.commit(here.id, op!.id, layOut(op!))
    const block = { id: op!.ids[0]! }
    // ---- a block on another sheet cannot be invited: switch the selection, invite from the new run (R16) ----
    const other = env.studio.board.createSheet('p')
    assert.equal((await env.request(`/lumen/topics/p/selection`, { method: 'PUT', body: JSON.stringify({ sheetId: other.id }) })).status, 200)
    assert.equal((await env.send('p:a', '邀别家的块')).status, 200)
    await until(() => !session.displayState.get().isRunning && env.fixture.requests.length >= 4, 'refused invite run did not finish')
    assert.match(JSON.stringify(env.fixture.requests.at(-1)!.messages.filter(message => message.role === 'tool')), /不在这一轮的白板上/)
    // ---- invite on the target: stored per sheet, nothing written as an entry ----
    assert.equal((await env.request(`/lumen/topics/p/selection`, { method: 'PUT', body: JSON.stringify({ sheetId: here.id }) })).status, 200)
    assert.equal((await env.send('p:a', '邀请')).status, 200)
    await until(async () => (await env.invite(here.id)).invite !== null, 'invite did not land')
    const invited = (await env.invite(here.id)).invite!
    assert.equal(invited.question, '注意力是什么，用你自己的话说？')
    assert.deepEqual(invited.elementIds, [block.id])
    assert.deepEqual((await env.sediment('p')).items, [], 'the invite writes no entry (R13)')
    assert.deepEqual((await env.sediment('p')).offers, [])
    // ---- inviting again replaces the earlier question ----
    assert.equal((await env.send('p:a', '再邀')).status, 200)
    await until(async () => (await env.invite(here.id)).invite?.question === '换成：对齐在做什么？', 'replace invite did not land')
    assert.deepEqual((await env.invite(here.id)).invite!.elementIds, [], 'an invite may point at nothing')
    assert.equal(rows(env.dataRoot, 'sediment_invites'), 1, 'latest replaces, one row per sheet')
    assert.equal((await env.invite(other.id)).invite, null)
  } finally { await env.close() }
})

test('R17 with sediment: deleting the sheet keeps the entries, the confirm body says how many takeaways lose their link, links report the stored title as deleted', { timeout: 30000 }, async () => {
  const env = await environment(() => textReply('好'))
  try {
    ensureTopic(env.service, 'p', '反馈')
    const first = env.studio.board.sheets('p')[0]!, second = env.studio.board.createSheet('p')
    const block = draw(env, '证据块', second.id).blockId
    await env.post('p', { text: '靠这块的判断', blocks: [{ id: block, rev: 1 }] })
    await env.post('p', { text: '不靠块的判断' })
    // ---- confirm 409: the block count is unchanged and now also says the takeaway count (S3) ----
    const refused = await env.remove('p', second.id)
    assert.equal(refused.status, 409)
    assert.deepEqual([refused.body.reason, refused.body.blocks, refused.body.settled], ['confirm', 1, 1])
    const gone = await env.remove('p', second.id, true)
    assert.equal(gone.status, 200)
    // ---- the entry survives; its link keeps the stored title and reports deleted ----
    const list = await env.sediment('p')
    assert.equal(list.items.length, 2)
    const linked = list.items.find(item => item.text === '靠这块的判断')!
    assert.deepEqual(linked.links.map(link => [link.blockId, link.title, link.deleted, link.retired]), [[block, '证据块', true, true]])
    // ---- a sheet without linked takeaways does not add the settled field ----
    draw(env, '另一块', first.id)
    const plain = await env.remove('p', first.id)
    assert.deepEqual([plain.body.reason, plain.body.blocks, plain.body.settled], ['confirm', 1, undefined])
  } finally { await env.close() }
})

test('S6 topicState: the entries ride along newest first with origin and evidence titles, the cap still holds', { timeout: 30000 }, async () => {
  const env = await environment(() => textReply('好'))
  try {
    ensureTopic(env.service, 'p', '反馈')
    const sheet = env.studio.board.sheets('p')[0]!
    const block = draw(env, '梯子块', sheet.id).blockId
    await env.post('p', { text: '第一条沉淀' })
    await env.post('p', { text: '第二条，带证据', blocks: [{ id: block, rev: 1 }] })
    // ---- newest first, origin labelled, evidence titled ----
    const state = topicState(env.studio, 'p')
    const lines = state.split('\n')
    assert.ok(lines.some(line => line.includes('用户的沉淀')), state)
    assert.match(lines.find(line => line.startsWith('- 「第二条')) ?? '', /^- 「第二条，带证据」（自写 · 证据 「梯子块」）/)
    assert.match(state, /- 「第一条沉淀」（自写）/)
    // ---- the cap drops the oldest entries first, like the other sections ----
    const tight = topicState(env.studio, 'p', 120)
    assert.match(tight, /用户的沉淀/)
    assert.ok(!tight.includes('第一条沉淀') || tight.includes('还有'), tight)
    const squeezed = topicState(env.studio, 'p', 60)
    assert.ok(!squeezed.includes('第二条'), 'a tiny cap drops the section rows and says how many went')
  } finally { await env.close() }
})

test('S10: the user writes entries while a run is parked; nothing to lock on the AI side (it has no entry tool)', { timeout: 60000 }, async () => {
  let parked!: () => void
  const pending = new Promise<void>(resolve => { parked = resolve })
  const env = await environment(request => {
    const { text } = said(request)
    if (text.includes('慢点')) { parked(); return new Promise<Reply>(() => {}) }
    return textReply('好')
  })
  try {
    ensureTopic(env.service, 'p', '反馈')
    assert.equal((await env.open('p', 'a')).status, 201)
    const sent = env.send('p:a', '慢点')
    await pending
    const session = await env.service.application.session('p', 'a')
    assert.ok(session.displayState.get().isRunning)
    // ---- entries are the user's own notes: R1 does not gate them (S10) ----
    assert.equal((await env.post('p', { text: '运行中写下的一句' })).status, 201)
    // ---- the model's tool list has nothing that writes an entry: only invite/quote touch sediment ----
    const tools = [...new Set(env.fixture.requests.flatMap(request => (request.tools ?? []).map(tool => tool.function.name)))]
    const sedimentTools = tools.filter(name => name.startsWith('sediment_'))
    assert.deepEqual(sedimentTools.sort(), ['sediment_invite', 'sediment_quote'])
    assert.ok(!tools.includes('sediment_create') && !tools.includes('sediment_write'), 'no tool writes an entry')
    await env.service.application.stop('p', 'a')
    await sent
    assert.deepEqual((await env.sediment('p')).items.map(item => item.text), ['运行中写下的一句'])
  } finally { await env.close() }
})

test('sediment_quote + S14 habits: binds the newest matching user message, refuses splices and non-user text; keep-with-restore counts restored, keep-as-is counts kept, dismiss counts nothing; the habits ride in the per-request context and go over HTTP', { timeout: 90000 }, async () => {
  let calls = 0
  const call = (name: string, args: unknown) => toolReply(name, args, `call-${++calls}`)
  // Each refusal case's quote text comes from its branch; the normal quote is 「我觉得注意力就是对齐」
  const env = await environment(request => {
    const { text, results } = said(request)
    if (text.includes('递回拼接')) return results ? textReply('被拒了') : call('sediment_quote', { text: '我觉得那个注意力就是对齐，第二次说的。今天天气好' })
    if (text.includes('递回AI的话')) return results ? textReply('被拒了') : call('sediment_quote', { text: '助手说过的话' })
    if (text.includes('递回别家')) return results ? textReply('被拒了') : call('sediment_quote', { text: '别家的原话' })
    if (text.includes('递回') || text.includes('再递一次')) return results ? textReply('递回了') : call('sediment_quote', { text: '我觉得注意力就是对齐' })
    return textReply('助手说过的话')
  })
  const saidText = () => JSON.parse(String(env.fixture.requests.at(-1)!.messages.map(message => message.role).lastIndexOf('user') >= 0
    ? env.fixture.requests.at(-1)!.messages[env.fixture.requests.at(-1)!.messages.map(message => message.role).lastIndexOf('user')].content : '""'))
  void saidText
  try {
    ensureTopic(env.service, 'p', '反馈')
    ensureTopic(env.service, 'q', '别的')
    assert.equal((await env.open('p', 'a')).status, 201)
    const session = await env.service.application.session('p', 'a')
    // ---- two user messages share the phrase; the assistant also speaks; another thread has its own words ----
    assert.equal((await env.send('p:a', '我觉得那个注意力就是对齐')).status, 200)
    await until(() => !session.displayState.get().isRunning, 'first run did not finish')
    const other = await env.service.application.session('q', 'x')
    await other.sendMessage({ content: '别家的原话' })
    await env.service.application.stop('q', 'x')
    assert.equal((await env.send('p:a', '我觉得那个注意力就是对齐，第二次说的')).status, 200)
    await until(() => !session.displayState.get().isRunning, 'second run did not finish')
    const run = async (message: string) => {
      const before = env.fixture.requests.length
      assert.equal((await env.send('p:a', message)).status, 200)
      // isRunning can lag the send: first wait for the run to actually reach the model, then for it to end
      await until(() => env.fixture.requests.length > before, `run ${message} did not start`)
      await until(() => !session.displayState.get().isRunning, `run ${message} did not finish`)
    }
    const lastTool = () => JSON.stringify(env.fixture.requests.at(-1)!.messages.filter(message => message.role === 'tool'))
    // ---- refusals: two messages spliced, the assistant's own words, another thread's user message ----
    await run('递回拼接')
    assert.match(lastTool(), /只删字得到|引用不是原话/, 'spliced quote refused')
    await run('递回AI的话')
    assert.match(lastTool(), /只删字得到|引用不是原话/, 'assistant words refused')
    await run('递回别家')
    assert.match(lastTool(), /只删字得到|引用不是原话/, 'another thread refused')
    assert.deepEqual((await env.sediment('p')).offers, [], 'refused quotes leave no offer')
    // ---- a valid quote binds to the newest matching message, fragments for the strikethrough included ----
    await run('递回')
    const [offer] = (await env.sediment('p')).offers
    assert.ok(offer, 'no offer stored')
    assert.equal(offer.original, '我觉得那个注意力就是对齐，第二次说的')
    assert.deepEqual(offer.fragments.map((fragment: { text: string }) => fragment.text.trim()), ['那个', '，第二次说的'], JSON.stringify(offer.fragments))
    // ---- keep with one fragment restored: restored counts for it, kept for the rest (S14) ----
    const restored = await env.post('p', { offerId: offer.id, text: '我觉得那个注意力就是对齐' })
    assert.equal(restored.status, 201)
    const habitsOf = async () => (await (await env.request('/lumen/speech-habits')).json()) as { items: { fragment: string; kept: number; restored: number }[] }
    let habits = await habitsOf()
    assert.deepEqual(new Map(habits.items.map(item => [item.fragment, [item.kept, item.restored]])), new Map([['那个', [0, 1]], ['，第二次说的', [1, 0]]]))
    // ---- keep as-is: kept increments; dismiss: nothing changes ----
    await run('再递一次')
    const [again] = (await env.sediment('p')).offers
    assert.ok(again)
    assert.equal((await env.post('p', { offerId: again.id })).status, 201)
    habits = await habitsOf()
    assert.deepEqual(new Map(habits.items.map(item => [item.fragment, [item.kept, item.restored]])), new Map([['那个', [1, 1]], ['，第二次说的', [2, 0]]]))
    const before = JSON.stringify(habits.items)
    await run('递回')
    const [third] = (await env.sediment('p')).offers
    assert.ok(third)
    assert.equal((await env.dismiss('p', third.id)).status, 204)
    assert.equal(JSON.stringify((await habitsOf()).items), before, 'a dismissed offer updates nothing')
    // ---- the habits ride in the per-request context within its cap, and delete works over HTTP ----
    await run('再聊聊')
    const system = env.fixture.requests.at(-1)!.messages.filter(message => message.role === 'system').map(message => String(message.content)).join('\n')
    assert.match(system, /说话习惯/, 'the habits section is attached')
    assert.match(system, /口癖：.*，第二次说的（留2）/, system.slice(-400))
    // kept=1 restored=1 is a tie: undecided, absent from both lines (visible over HTTP only)
    assert.doesNotMatch(system, /那个（[留复]\d）/)
    assert.ok(JSON.stringify((await habitsOf()).items).includes('"那个"'), 'the tied habit stays in the table over HTTP')
    assert.equal((await env.request(`/lumen/speech-habits/${encodeURIComponent('那个')}`, { method: 'DELETE' })).status, 204)
    habits = await habitsOf()
    assert.ok(!habits.items.some(item => item.fragment === '那个'), 'a habit line can be deleted')
  } finally { await env.close() }
})

test('sediment_quote elementIds follow the invite rule: live elements of the run target or none; a missing one refuses and stores nothing; confirming links no element', { timeout: 60000 }, async () => {
  let pointAt: string[] | undefined
  const env = await environment(request => {
    const { results } = said(request)
    if (results) return textReply('递回了')
    return toolReply('sediment_quote', { text: '注意力就是对齐', ...(pointAt ? { elementIds: pointAt } : {}) }, `call-${Date.now()}`)
  })
  try {
    ensureTopic(env.service, 'p', '反馈')
    const sheetId = env.studio.board.sheets('p')[0]!.id, canvas = env.studio.board.canvas
    const op = canvas.queueDraw(sheetId, '一句', [{ type: 'text', id: 'gist', x: 0, y: 0, text: '对齐' }], { threadId: 'p:a', runId: 'r0' })
    canvas.commit(sheetId, op.id, layOut(op))
    assert.equal((await env.open('p', 'a')).status, 201)
    const session = await env.service.application.session('p', 'a')
    const send = async (message: string) => {
      const before = env.fixture.requests.length
      assert.equal((await env.send('p:a', message)).status, 200)
      await until(() => env.fixture.requests.length >= before + 2 && !session.displayState.get().isRunning, 'run did not finish')
    }
    pointAt = ['nowhere']
    await send('注意力就是对齐吧')
    assert.match(JSON.stringify(env.fixture.requests.at(-1)!.messages.filter(message => message.role === 'tool')), /元素 nowhere 不在这一轮的白板上/)
    assert.deepEqual((await env.sediment('p')).offers, [], 'a refused quote stores no offer')
    pointAt = ['gist']
    await send('注意力就是对齐嘛')
    const [offer] = (await env.sediment('p')).offers as unknown as { id: string; elementIds: string[] }[]
    assert.deepEqual(offer!.elementIds, ['gist'])
    const kept = await env.post('p', { offerId: offer!.id })
    assert.equal(kept.status, 201)
    assert.deepEqual((kept.body as { links: unknown[] }).links, [], 'canvas elements never become evidence links')
  } finally { await env.close() }
})

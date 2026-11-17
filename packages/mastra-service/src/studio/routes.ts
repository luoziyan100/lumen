/**
 * [INPUT]: Hono, zod, the studio stores (sediment included), the research network, the native running/waiting projection
 * [OUTPUT]: studioRoutes: topics; readings (the topic's list and one material's reading, ETag-tagged, read-only); sheets (ETag-tagged; the list carries the user's selection and the running turn's target; storing the selection; the ＋ sheet becomes the selection; the user deletes one, R17; which sheet a block is on); sediment entries create/list/edit/delete with offer confirm/dismiss (R13: user HTTP only) and per-sheet invites; the library upload/link routes (arXiv links fetch the PDF), originals and their on-disk location (for the native "open in system" check); topic references
 * [POS]: the product routes behind auth; there is no block-write route — blocks are written only through board tools (R4), and no reading-write route — readings only through reading_write; sheet deletion lives only here, the AI has no such tool (R17); so does sediment entry text (S2)
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { createHash } from 'node:crypto'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import type { ResearchHttp } from '../research/http.ts'
import { StudioError } from './errors.ts'
import { errorBody } from '../http/error-codes.ts'
import type { Studio } from './studio.ts'
import type { Topic } from './types.ts'

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/)
const title = z.string().trim().min(1).max(200)
const topicCreate = z.object({ title }).strict()
const topicPatch = z.object({ title: title.optional(), archived: z.boolean().optional() }).strict().refine(value => Object.keys(value).length > 0)
const sheetCreate = z.object({ title: title.optional() }).strict()
const sedimentCreate = z.union([
  z.object({ offerId: z.string().min(1).max(128), text: z.string().max(600).optional(), blocks: z.array(z.object({ id: z.string().min(1).max(128), rev: z.number().int().min(1) })).max(8).optional() }).strict(),
  z.object({ text: z.string().max(600), blocks: z.array(z.object({ id: z.string().min(1).max(128), rev: z.number().int().min(1) })).max(8).optional() }).strict(),
])
const sedimentEdit = z.object({ text: z.string().max(600) }).strict()
const selection = z.object({ sheetId: z.string().min(1).max(128) }).strict()
const link = z.object({ url: z.string().url(), topicId: id.optional() }).strict()
const reference = z.object({ itemId: z.string().min(1).max(128) }).strict()
const archived = z.enum(['true', 'false', 'all']).default('false').transform(value => value === 'all' ? value : value === 'true')

type Activity = () => Promise<Map<string, { running: boolean; waiting: boolean }>>

/** The topic's status light: folds the running/waiting state of every conversation (resourceId = topicId:taskId) into one. */
function withActivity(topics: Topic[], states: Map<string, { running: boolean; waiting: boolean }> | undefined): Topic[] {
  return topics.map(topic => {
    let running = false, waiting = false
    for (const [resourceId, state] of states ?? []) {
      if (!resourceId.startsWith(`${topic.id}:`)) continue
      running ||= state.running
      waiting ||= state.waiting
    }
    return { ...topic, running, waiting }
  })
}

function tagged(c: Context, body: unknown) {
  const etag = `"${createHash('sha1').update(JSON.stringify(body)).digest('hex')}"`
  c.header('ETag', etag)
  c.header('Cache-Control', 'no-cache')
  if (c.req.header('If-None-Match') === etag) return c.body(null, 304)
  return c.json(body)
}

export function studioRoutes(options: { studio: Studio; http: ResearchHttp; activity?: Activity }) {
  const { topics, board, sediment, readings, library } = options.studio
  const app = new Hono()
  app.onError((error, c) => {
    if (error instanceof StudioError) return c.json(errorBody(error.message, error.code, error.params, error.detail), error.status)
    if (error instanceof z.ZodError || error instanceof SyntaxError) return c.json(errorBody('请求格式不对，请检查后重试', 'request.invalid'), 400)
    throw error
  })

  // ---- Topics and their status lights ----
  app.get('/topics', async c => c.json({ items: withActivity(topics.list(archived.parse(c.req.query('archived'))), await options.activity?.()) }))
  app.post('/topics', async c => c.json(topics.create(topicCreate.parse(await c.req.json()).title), 201))
  app.get('/topics/:topicId', async c => c.json(withActivity([topics.get(id.parse(c.req.param('topicId')))], await options.activity?.())[0]))
  app.patch('/topics/:topicId', async c => c.json(topics.update(id.parse(c.req.param('topicId')), topicPatch.parse(await c.req.json()))))

  // ---- Sheets: read-only for the user; ＋ opens one ----
  app.get('/topics/:topicId/sheets', async c => {
    const topicId = id.parse(c.req.param('topicId'))
    topics.get(topicId)
    // ---- No live sheet (all folded) is not an error: writable is null and the UI invites the ＋ ----
    let writable: string | null = null
    try { writable = board.writableSheet(topicId).id } catch (error) { if (!(error instanceof StudioError) || error.status !== 409) throw error }
    // ---- R16: selected = where the next message writes; target = where the run in progress writes (only while it runs or waits) ----
    const states = await options.activity?.()
    const target = board.runTargets(topicId).find(row => { const state = states?.get(row.threadId); return state?.running || state?.waiting })
    return c.json({ items: board.sheets(topicId), writable, selected: board.selectedSheet(topicId)?.id ?? null, target: target?.sheetId ?? null })
  })
  app.put('/topics/:topicId/selection', async c => {
    const topicId = id.parse(c.req.param('topicId'))
    topics.get(topicId)
    board.select(topicId, selection.parse(await c.req.json()).sheetId)
    return c.json({ selected: board.selectedSheet(topicId)?.id ?? null })
  })
  app.post('/topics/:topicId/sheets', async c => {
    const topicId = id.parse(c.req.param('topicId'))
    topics.get(topicId)
    return c.json(board.createSheet(topicId, sheetCreate.parse(await c.req.json().catch(() => ({}))).title), 201)
  })
  // ---- R17: only the user deletes. A sheet with blocks needs ?confirm=true; the target of a run that runs or waits cannot go ----
  app.delete('/topics/:topicId/sheets/:sheetId', async c => {
    const topicId = id.parse(c.req.param('topicId')), sheetId = z.string().min(1).max(128).parse(c.req.param('sheetId'))
    topics.get(topicId)
    const since = new Date().toISOString(), states = await options.activity?.()
    const busy = new Set([...states ?? []].filter(([, state]) => state.running || state.waiting).map(([threadId]) => threadId))
    return c.json(board.deleteSheet(topicId, sheetId, { confirmed: c.req.query('confirm') === 'true', busy, since }))
  })
  app.get('/sheets/:sheetId', c => tagged(c, board.view(z.string().min(1).max(128).parse(c.req.param('sheetId')))))
  app.get('/blocks/:blockId', c => c.json(board.blockSheet(z.string().min(1).max(128).parse(c.req.param('blockId')))))

  // ---- Sediment (R13): entries only through user HTTP here; the AI can only hand an offer back, and confirming uses this same create route ----
  app.get('/topics/:topicId/sediment', c => {
    const topicId = id.parse(c.req.param('topicId'))
    topics.get(topicId)
    return c.json(sediment.list(topicId))
  })
  app.post('/topics/:topicId/sediment', async c => {
    const topicId = id.parse(c.req.param('topicId'))
    topics.get(topicId)
    const input = sedimentCreate.parse(await c.req.json())
    // offerId confirms an offer the AI handed back; text is the user's final wording after the strikethrough choices (S9) and the store re-checks it. Otherwise this is a hand-written line
    const entry = 'offerId' in input
      ? sediment.offerConfirm(topicId, input.offerId, input.text, input.blocks)
      : sediment.create(topicId, { text: input.text, origin: 'typed', blocks: input.blocks })
    return c.json(entry, 201)
  })
  app.patch('/topics/:topicId/sediment/:entryId', async c => {
    const topicId = id.parse(c.req.param('topicId'))
    topics.get(topicId)
    return c.json(sediment.edit(topicId, z.string().min(1).max(128).parse(c.req.param('entryId')), sedimentEdit.parse(await c.req.json()).text))
  })
  app.delete('/topics/:topicId/sediment/:entryId', c => {
    const topicId = id.parse(c.req.param('topicId'))
    topics.get(topicId)
    sediment.remove(topicId, z.string().min(1).max(128).parse(c.req.param('entryId')))
    return c.body(null, 204)
  })
  app.delete('/topics/:topicId/sediment/offers/:offerId', c => {
    const topicId = id.parse(c.req.param('topicId'))
    topics.get(topicId)
    sediment.offerDismiss(topicId, z.string().min(1).max(128).parse(c.req.param('offerId')))
    return c.body(null, 204)
  })
  // ---- A sheet's sediment invite (S4/S9c: the UI sits it above the full-board input) ----
  app.get('/sheets/:sheetId/invite', c => {
    const sheetId = z.string().min(1).max(128).parse(c.req.param('sheetId'))
    board.sheet(sheetId)
    return c.json({ invite: sediment.inviteOf(sheetId) })
  })

  // ---- Readings (P1-2): read-only here, the AI writes them only through reading_write. The list says which materials have one; a reading is ETag-tagged like a sheet ----
  app.get('/topics/:topicId/readings', c => {
    const topicId = id.parse(c.req.param('topicId'))
    topics.get(topicId)
    return c.json({ items: readings.list(topicId) })
  })
  app.get('/topics/:topicId/readings/:itemId', c => {
    const topicId = id.parse(c.req.param('topicId')), itemId = z.string().min(1).max(128).parse(c.req.param('itemId'))
    topics.get(topicId)
    const reading = readings.view(topicId, itemId)
    if (!reading) throw new StudioError('这份材料在这个主题里还没有解读', 404, 'reading.not_found', { itemId })
    return tagged(c, reading)
  })

  // ---- S14 speech habits: one global table, read-only for the user and deletable line by line; the AI has no tool that writes it ----
  app.get('/speech-habits', c => c.json({ items: sediment.habits() }))
  app.delete('/speech-habits/:fragment', c => {
    sediment.habitRemove(z.string().min(1).max(280).parse(c.req.param('fragment')))
    return c.body(null, 204)
  })

  // ---- Library: upload or paste a link; a topicId references it into this topic in passing ----
  app.get('/library', c => c.json({ items: library.list() }))
  app.post('/library', async c => {
    let added: Awaited<ReturnType<typeof library.add>>, topicId: string | undefined
    if (c.req.header('Content-Type')?.includes('multipart/form-data')) {
      const form = await c.req.formData().catch(() => null)
      if (!form) throw new StudioError('上传内容不完整，请重新选择文件后重试', 400, 'library.upload_incomplete')
      const file = form.get('file')
      if (!(file instanceof File)) throw new StudioError('请选择一个文件', 400, 'library.no_file')
      const topic = form.get('topicId')
      topicId = typeof topic === 'string' && topic ? id.parse(topic) : undefined
      if (topicId) topics.get(topicId)
      added = await library.add({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), mediaType: file.type || undefined, addedBy: 'you' })
    } else {
      const input = link.parse(await c.req.json())
      topicId = input.topicId
      if (topicId) topics.get(topicId)
      added = await library.addLink(input.url, options.http, 'you', c.req.raw.signal)
    }
    const referenced = topicId ? (topics.reference(topicId, added.item.id), true) : false
    return c.json({ item: added.item, created: added.created, referenced }, added.created ? 201 : 200)
  })
  app.get('/library/:itemId/content', async c => {
    const item = library.get(z.string().min(1).max(128).parse(c.req.param('itemId')))
    const etag = `"${item.sha256}"`
    c.header('ETag', etag)
    c.header('Cache-Control', 'no-cache')
    if (c.req.header('If-None-Match') === etag) return c.body(null, 304)
    // ---- Originals answer with their upload type; HTML/SVG must not run script on the service origin — the reader renders them sandboxed ----
    c.header('Content-Type', item.mediaType)
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Content-Security-Policy', 'sandbox')
    return c.body(new Uint8Array(await library.read(item)))
  })

  // ---- An original's on-disk location: looked up by item id only; the service gives the path and the native layer re-checks it is a regular file under library/, so a page cannot pass an arbitrary path (L5) ----
  app.get('/library/:itemId/location', async c => c.json(await library.location(library.get(z.string().min(1).max(128).parse(c.req.param('itemId'))))))

  // ---- Topic references: originals stay put, only references come and go ----
  app.get('/topics/:topicId/materials', c => c.json({ items: topics.materials(id.parse(c.req.param('topicId'))) }))
  app.post('/topics/:topicId/materials', async c => {
    const topicId = id.parse(c.req.param('topicId')), { itemId } = reference.parse(await c.req.json())
    return c.json({ referenced: topics.reference(topicId, itemId) }, 201)
  })
  app.delete('/topics/:topicId/materials/:itemId', c => {
    const removed = topics.unreference(id.parse(c.req.param('topicId')), z.string().min(1).max(128).parse(c.req.param('itemId')))
    if (!removed) throw new StudioError('这个主题没有引用这份材料', 404, 'topic.material_not_referenced')
    return c.body(null, 204)
  })
  return app
}

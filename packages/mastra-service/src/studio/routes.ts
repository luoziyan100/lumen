/**
 * [INPUT]: Hono、zod、studio 存储组合、研究网络、原生运行/等待状态投影
 * [OUTPUT]: studioRoutes：主题、白板（带 ETag）、资料库上传/链接（arXiv 链接收 PDF）/原件/原件本机位置（只给原生「系统打开」核对用）、主题引用的 HTTP 接口
 * [POS]: 认证之后的产品路由；P0 白板对人只读，这里没有区块写接口——区块只经白板工具写（R4）
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from 'node:crypto'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import type { ResearchHttp } from '../research/http.ts'
import { StudioError } from './errors.ts'
import type { Studio } from './studio.ts'
import type { Topic } from './types.ts'

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/)
const title = z.string().trim().min(1).max(200)
const topicCreate = z.object({ title }).strict()
const topicPatch = z.object({ title: title.optional(), archived: z.boolean().optional() }).strict().refine(value => Object.keys(value).length > 0)
const sheetCreate = z.object({ title: title.optional() }).strict()
const link = z.object({ url: z.string().url(), topicId: id.optional() }).strict()
const reference = z.object({ itemId: z.string().min(1).max(128) }).strict()
const archived = z.enum(['true', 'false', 'all']).default('false').transform(value => value === 'all' ? value : value === 'true')

type Activity = () => Promise<Map<string, { running: boolean; waiting: boolean }>>

/** 主题状态灯：把主题下所有对话（resourceId = topicId:taskId）的运行/等待汇总成一盏。 */
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
  const { topics, board, library } = options.studio
  const app = new Hono()
  app.onError((error, c) => {
    if (error instanceof StudioError) return c.json({ error: error.message }, error.status)
    if (error instanceof z.ZodError || error instanceof SyntaxError) return c.json({ error: '请求格式不对，请检查后重试' }, 400)
    throw error
  })

  // ---- 主题与状态灯 ----
  app.get('/topics', async c => c.json({ items: withActivity(topics.list(archived.parse(c.req.query('archived'))), await options.activity?.()) }))
  app.post('/topics', async c => c.json(topics.create(topicCreate.parse(await c.req.json()).title), 201))
  app.get('/topics/:topicId', async c => c.json(withActivity([topics.get(id.parse(c.req.param('topicId')))], await options.activity?.())[0]))
  app.patch('/topics/:topicId', async c => c.json(topics.update(id.parse(c.req.param('topicId')), topicPatch.parse(await c.req.json()))))

  // ---- 白板：人只读；＋ 新开一张 ----
  app.get('/topics/:topicId/sheets', c => {
    const topicId = id.parse(c.req.param('topicId'))
    topics.get(topicId)
    // ---- 没有进行中的白板（都收起了）不是错误：writable 为 null，界面提示用户点 ＋ ----
    let writable: string | null = null
    try { writable = board.writableSheet(topicId).id } catch (error) { if (!(error instanceof StudioError) || error.status !== 409) throw error }
    return c.json({ items: board.sheets(topicId), writable })
  })
  app.post('/topics/:topicId/sheets', async c => {
    const topicId = id.parse(c.req.param('topicId'))
    topics.get(topicId)
    return c.json(board.createSheet(topicId, sheetCreate.parse(await c.req.json().catch(() => ({}))).title), 201)
  })
  app.get('/sheets/:sheetId', c => tagged(c, board.view(z.string().min(1).max(128).parse(c.req.param('sheetId')))))

  // ---- 资料库：上传或粘链接，给了 topicId 就顺手引用到这个主题 ----
  app.get('/library', c => c.json({ items: library.list() }))
  app.post('/library', async c => {
    let added: Awaited<ReturnType<typeof library.add>>, topicId: string | undefined
    if (c.req.header('Content-Type')?.includes('multipart/form-data')) {
      const form = await c.req.formData().catch(() => null)
      if (!form) throw new StudioError('上传内容不完整，请重新选择文件后重试', 400)
      const file = form.get('file')
      if (!(file instanceof File)) throw new StudioError('请选择一个文件', 400)
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
    // ---- 原件按上传类型返回；HTML/SVG 不能在服务源上执行脚本，阅读器自有沙箱渲染 ----
    c.header('Content-Type', item.mediaType)
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Content-Security-Policy', 'sandbox')
    return c.body(new Uint8Array(await library.read(item)))
  })

  // ---- 原件在本机的位置：只按条目 id 查，路径由服务给、原生层再核对一次在 library/ 里且是普通文件，页面传不进任意路径（L5） ----
  app.get('/library/:itemId/location', async c => c.json(await library.location(library.get(z.string().min(1).max(128).parse(c.req.param('itemId'))))))

  // ---- 主题引用：原件不动，只增删引用 ----
  app.get('/topics/:topicId/materials', c => c.json({ items: topics.materials(id.parse(c.req.param('topicId'))) }))
  app.post('/topics/:topicId/materials', async c => {
    const topicId = id.parse(c.req.param('topicId')), { itemId } = reference.parse(await c.req.json())
    return c.json({ referenced: topics.reference(topicId, itemId) }, 201)
  })
  app.delete('/topics/:topicId/materials/:itemId', c => {
    const removed = topics.unreference(id.parse(c.req.param('topicId')), z.string().min(1).max(128).parse(c.req.param('itemId')))
    if (!removed) throw new StudioError('这个主题没有引用这份材料', 404)
    return c.body(null, 204)
  })
  return app
}

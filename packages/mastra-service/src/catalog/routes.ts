/**
 * [INPUT]: Hono 路由、Zod 输入校验、项目会话目录用例与原生实时运行态投影
 * [OUTPUT]: catalogRoutes：项目 CRUD、原生 thread 目录与按持久消息 ID 确认已读及显式切换未读的 HTTP 接口
 * [POS]: 认证保护之后的产品路由，不代理 Controller 执行协议
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { Hono } from 'hono'
import { z } from 'zod'
import { CatalogError, type Catalog } from './catalog.ts'

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/)
const name = z.string().trim().min(1).max(120)
const title = z.string().trim().min(1).max(200)
const page = z.object({
  page: z.coerce.number().int().min(0).max(1_000_000).default(0),
  perPage: z.coerce.number().int().min(1).max(100).default(30),
  archived: z.enum(['true', 'false', 'all']).default('false').transform(value => value === 'all' ? value : value === 'true'),
  search: z.string().trim().max(200).optional(),
})
const projectCreate = z.object({ id: id.optional(), name }).strict()
const projectPatch = z.object({ name: name.optional(), archived: z.boolean().optional() }).strict().refine(value => Object.keys(value).length > 0)
const sessionCreate = z.object({ taskId: id.optional(), title: title.optional() }).strict()
const sessionPatch = z.object({ title: title.optional(), pinned: z.boolean().optional(), archived: z.boolean().optional() })
  .strict().refine(value => Object.keys(value).length > 0)
const readReceipt = z.object({ messageId: z.string().min(1).max(512) }).strict()

export function catalogRoutes(catalog: Catalog, activity?: () => Promise<Map<string, { running: boolean; waiting: boolean }>>) {
  const app = new Hono()
  app.onError((error, c) => {
    if (error instanceof CatalogError) return c.json({ error: error.message }, error.status)
    if (error instanceof z.ZodError || error instanceof SyntaxError) return c.json({ error: 'Invalid catalog request' }, 400)
    return c.json({ error: 'Catalog operation failed' }, 500)
  })
  app.get('/projects', c => c.json(catalog.listProjects(page.parse(c.req.query()))))
  app.post('/projects', async c => {
    const input = projectCreate.parse(await c.req.json())
    return c.json(await catalog.createProject(input.name, input.id), 201)
  })
  app.get('/projects/:projectId', c => c.json(catalog.getProject(id.parse(c.req.param('projectId')))))
  app.patch('/projects/:projectId', async c => c.json(await catalog.updateProject(
    id.parse(c.req.param('projectId')), projectPatch.parse(await c.req.json()))))
  app.delete('/projects/:projectId', async c => {
    await catalog.deleteProject(id.parse(c.req.param('projectId')))
    return c.body(null, 204)
  })
  app.get('/projects/:projectId/sessions', async c => {
    const result = await catalog.listSessions(id.parse(c.req.param('projectId')), page.parse(c.req.query()))
    const states = await activity?.()
    return c.json({ ...result, items: result.items.map(item => ({ ...item, running: false, waiting: false, ...states?.get(item.resourceId) })) })
  })
  app.post('/projects/:projectId/sessions', async c => {
    const input = sessionCreate.parse(await c.req.json())
    return c.json(await catalog.createSession(id.parse(c.req.param('projectId')), input.taskId, input.title), 201)
  })
  app.get('/projects/:projectId/sessions/:taskId', async c => c.json(await catalog.getSession(
    id.parse(c.req.param('projectId')), id.parse(c.req.param('taskId')))))
  app.patch('/projects/:projectId/sessions/:taskId', async c => c.json(await catalog.updateSession(
    id.parse(c.req.param('projectId')), id.parse(c.req.param('taskId')), sessionPatch.parse(await c.req.json()))))
  app.post('/projects/:projectId/sessions/:taskId/read', async c => {
    const { messageId } = readReceipt.parse(await c.req.json())
    return c.json(await catalog.markSessionRead(id.parse(c.req.param('projectId')), id.parse(c.req.param('taskId')), messageId))
  })
  app.post('/projects/:projectId/sessions/:taskId/unread', async c => {
    const { unread } = z.object({ unread: z.boolean() }).strict().parse(await c.req.json())
    return c.json(await catalog.setSessionUnread(id.parse(c.req.param('projectId')), id.parse(c.req.param('taskId')), unread))
  })
  return app
}

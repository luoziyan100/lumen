/**
 * [INPUT]: 已组合的诊断服务、产品会话目录授权与 Hono 请求
 * [OUTPUT]: diagnosticsRoutes：trace、标注、导出、只读回看与受限隔离评估 HTTP
 * [POS]: 固定会话归属；评估只能使用保存证据或当前无工具模型，不开放生产执行/存储管理
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { DiagnosticsError, type createDiagnostics } from '../diagnostics/index.ts'

type Diagnostics = ReturnType<typeof createDiagnostics>
const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/)
const identity = z.object({ projectId: id, taskId: id })
const page = z.object({ page: z.coerce.number().int().min(0).max(100000).optional(), perPage: z.coerce.number().int().min(1).max(100).optional() })

export function diagnosticsRoutes(diagnostics: Diagnostics, authorize: (projectId: string, taskId: string) => Promise<unknown>) {
  const app = new Hono()
  app.use('/diagnostics/*', async (c, next) => { c.header('Cache-Control', 'no-store'); await next() })
  async function resource(c: Context) {
    const parsed = identity.safeParse(c.req.query())
    if (!parsed.success) throw new DiagnosticsError('会话身份无效', 400)
    await authorize(parsed.data.projectId, parsed.data.taskId)
    return `${parsed.data.projectId}:${parsed.data.taskId}`
  }
  function pagination(c: Context) {
    const parsed = page.safeParse(c.req.query())
    if (!parsed.success) throw new DiagnosticsError('分页无效', 400)
    return parsed.data
  }
  app.get('/diagnostics/traces', async c => c.json(await diagnostics.listTraces(await resource(c), pagination(c))))
  app.get('/diagnostics/traces/:traceId', async c => c.json(await diagnostics.readTrace(await resource(c), c.req.param('traceId'))))
  app.get('/diagnostics/cases', async c => c.json(await diagnostics.listBadCases(await resource(c), pagination(c))))
  app.post('/diagnostics/cases', async c => c.json(await diagnostics.markBadCase(await resource(c), await c.req.json().catch(() => null)), 201))
  app.patch('/diagnostics/cases/:id', async c => c.json(await diagnostics.updateBadCase(await resource(c), c.req.param('id'), await c.req.json().catch(() => null))))
  app.post('/diagnostics/cases/:id/evaluate', async c => {
    const parsed = z.object({ mode: z.enum(['recorded', 'live']) }).strict().safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) throw new DiagnosticsError('评估模式无效', 400)
    return c.json(await diagnostics.evaluate(await resource(c), c.req.param('id'), parsed.data.mode, c.req.raw.signal))
  })
  app.get('/diagnostics/export', async c => {
    c.header('Cache-Control', 'no-store')
    return c.json(await diagnostics.exportSession(await resource(c), c.req.query('traceId')))
  })
  app.post('/diagnostics/recorded', async c => {
    const parsed = z.object({ content: z.string() }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) throw new DiagnosticsError('请提供诊断 JSON 内容', 400)
    c.header('Cache-Control', 'no-store')
    return c.json(diagnostics.readRecorded(parsed.data.content))
  })
  return app
}

/**
 * [INPUT]: 经当前目录授权的旧档案只读 reader 与 Hono 身份参数
 * [OUTPUT]: legacyDiagnosticsRoutes；旧证据分页/单条读取 HTTP
 * [POS]: 只读产品入口，不提供旧运行时、执行回放或档案文件任意路径访问
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { DiagnosticsError } from '../diagnostics/types.ts'
import type { createLegacyDiagnostics } from '../migration/legacy-diagnostics/reader.ts'

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/)
const identity = z.object({ projectId: id, taskId: id, page: z.coerce.number().int().min(0).max(100000).optional(), perPage: z.coerce.number().int().min(1).max(100).optional() })

export function legacyDiagnosticsRoutes(reader: ReturnType<typeof createLegacyDiagnostics>) {
  const app = new Hono()
  function params(c: Context) {
    const parsed = identity.safeParse(c.req.query())
    if (!parsed.success) throw new DiagnosticsError('会话身份或分页无效', 400)
    c.header('Cache-Control', 'no-store')
    return parsed.data
  }
  app.get('/diagnostics/legacy', async c => {
    const { projectId, taskId, page, perPage } = params(c)
    return c.json(await reader.list(projectId, taskId, { page, perPage }))
  })
  app.get('/diagnostics/legacy/:recordId', async c => {
    const { projectId, taskId } = params(c)
    return c.json(await reader.read(projectId, taskId, c.req.param('recordId')))
  })
  return app
}

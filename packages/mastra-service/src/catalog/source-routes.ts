/**
 * [INPUT]: 项目目录、显式数据根、source.json 领域操作与保存后失效回调
 * [OUTPUT]: projectSourceRoutes：项目外部资料绑定的 GET/PATCH 组合接口
 * [POS]: 认证后的产品配置边界；先验证项目存在，只配置只读资料范围，不修改外部文件
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { Hono } from 'hono'
import { join } from 'node:path'
import { z } from 'zod'
import { CatalogError, type Catalog } from './catalog.ts'
import type { ProjectSource } from './types.ts'
import { readSourceBinding, removeSourceBinding, setSourceBinding, SourceBindingError } from '../workspace/source.ts'
import { SettingsError } from '../settings/schema.ts'

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/)
const patch = z.object({ path: z.string().min(1).max(4096).nullable() }).strict()
interface SourceRouteOptions {
  dataRoot: string
  withUpdate?: (work: () => Promise<Response>) => Promise<Response>
  beforeChange?: () => void | Promise<void>
  changed?: (projectId: string, source: ProjectSource) => void | Promise<void>
}

export function projectSourceRoutes(catalog: Pick<Catalog, 'getProject'>, options: SourceRouteOptions) {
  const app = new Hono()
  const pending = new Map<string, Promise<unknown>>()
  function project(value: string) {
    const projectId = id.parse(value)
    catalog.getProject(projectId)
    return { projectId, root: join(options.dataRoot, 'projects', projectId) }
  }
  function change<T>(projectId: string, work: () => Promise<T>): Promise<T> {
    const result = (pending.get(projectId) ?? Promise.resolve()).catch(() => {}).then(work)
    pending.set(projectId, result)
    void result.finally(() => { if (pending.get(projectId) === result) pending.delete(projectId) }).catch(() => {})
    return result
  }
  app.onError((error, c) => {
    if (error instanceof CatalogError || error instanceof SourceBindingError || error instanceof SettingsError) return c.json({ error: error.message }, error.status)
    if (error instanceof z.ZodError || error instanceof SyntaxError) return c.json({ error: '资料绑定请求无效' }, 400)
    return c.json({ error: '资料绑定操作失败' }, 500)
  })
  app.get('/projects/:projectId/source', async c => {
    const selected = project(c.req.param('projectId'))
    return c.json(await readSourceBinding(selected.root))
  })
  app.patch('/projects/:projectId/source', async c => {
    const selected = project(c.req.param('projectId'))
    const input = patch.parse(await c.req.json())
    const work = async () => {
      catalog.getProject(selected.projectId)
      await options.beforeChange?.()
      const source = input.path === null ? await removeSourceBinding(selected.root) : await setSourceBinding(selected.root, input.path)
      try { await options.changed?.(selected.projectId, source) }
      catch { return c.json({ error: '外部资料已保存，但运行状态更新失败', saved: true, source }, 500) }
      return c.json(source)
    }
    return change(selected.projectId, () => options.withUpdate ? options.withUpdate(work) : work())
  })
  return app
}

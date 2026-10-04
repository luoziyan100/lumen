/**
 * [INPUT]: 已授权项目目录、项目角色组合与统一配置写入边界
 * [OUTPUT]: agentCatalogRoutes：查看角色、全局启停和空闲重载
 * [POS]: 静态角色管理产品入口；编辑定义仍使用项目 Markdown 文件
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { Hono } from 'hono'
import { z } from 'zod'
import { CatalogError, type Catalog } from '../../catalog/catalog.ts'
import { SettingsError } from '../../settings/store.ts'
import type { createProjectSpecialists } from './projects.ts'

const projectId = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/)
const update = z.object({ disabled: z.boolean() }).strict()

export function agentCatalogRoutes(catalog: Catalog, projects: ReturnType<typeof createProjectSpecialists>,
  withUpdate: <T>(work: () => Promise<T>) => Promise<T>) {
  const app = new Hono()
  app.onError((error, c) => {
    if (error instanceof CatalogError || error instanceof SettingsError) return c.json({ error: error.message }, error.status)
    if (error instanceof z.ZodError || error instanceof SyntaxError) return c.json({ error: '角色请求无效' }, 400)
    return c.json({ error: '角色配置加载失败，请检查项目中的 Markdown 定义' }, 500)
  })
  function checked(id: string) { const value = projectId.parse(id); catalog.getProject(value); return value }
  app.get('/projects/:projectId/agents', async c => c.json((await projects.get(checked(c.req.param('projectId')))).catalog))
  app.post('/projects/:projectId/agents/reload', async c => {
    const id = checked(c.req.param('projectId'))
    return withUpdate(async () => { await projects.invalidate(id); return c.json((await projects.get(id)).catalog) })
  })
  app.patch('/projects/:projectId/agents/:name', async c => {
    const id = checked(c.req.param('projectId')), name = c.req.param('name'), input = update.parse(await c.req.json())
    return withUpdate(async () => {
      if (!(await projects.get(id)).catalog.entries.some(entry => entry.role.id === name)) throw new CatalogError('角色不存在', 404)
      await projects.setDisabled(name, input.disabled)
      return c.json((await projects.get(id)).catalog)
    })
  })
  return app
}

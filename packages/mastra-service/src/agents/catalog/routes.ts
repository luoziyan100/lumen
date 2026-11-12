/**
 * [INPUT]: 全局专家组与统一配置写入边界
 * [OUTPUT]: agentCatalogRoutes：查看角色、全局启停和空闲重载
 * [POS]: 静态角色管理产品入口；专家不分主题，编辑定义仍使用用户角色目录里的 Markdown 文件
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { Hono } from 'hono'
import { z } from 'zod'
import { CatalogError } from '../../catalog/catalog.ts'
import { SettingsError } from '../../settings/store.ts'
import type { SpecialistGroup } from './group.ts'

const update = z.object({ disabled: z.boolean() }).strict()

export function agentCatalogRoutes(group: SpecialistGroup, withUpdate: <T>(work: () => Promise<T>) => Promise<T>) {
  const app = new Hono()
  app.onError((error, c) => {
    if (error instanceof CatalogError || error instanceof SettingsError) return c.json({ error: error.message }, error.status)
    if (error instanceof z.ZodError || error instanceof SyntaxError) return c.json({ error: '角色请求无效' }, 400)
    return c.json({ error: '角色配置加载失败，请检查角色目录中的 Markdown 定义' }, 500)
  })
  app.get('/agents', async c => c.json((await group.get()).catalog))
  app.post('/agents/reload', c => withUpdate(async () => { await group.invalidate(); return c.json((await group.get()).catalog) }))
  app.patch('/agents/:name', async c => {
    const name = c.req.param('name'), input = update.parse(await c.req.json())
    return withUpdate(async () => {
      if (!(await group.get()).catalog.entries.some(entry => entry.role.id === name)) throw new CatalogError('角色不存在', 404)
      await group.setDisabled(name, input.disabled)
      return c.json((await group.get()).catalog)
    })
  })
  return app
}

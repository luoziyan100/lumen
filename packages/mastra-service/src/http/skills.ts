/**
 * [INPUT]: 已验证归属的任务技能 registry、Hono 和 Zod
 * [OUTPUT]: skillRoutes：技能目录、显式激活、工作区/完整目录上传安装和卸载
 * [POS]: 产品技能入口；与 Agent 工具共用 registry，无法读任意宿主路径
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { Hono } from 'hono'
import { z } from 'zod'
import type { SkillRegistry } from '../skills/index.ts'

const identity = z.object({ projectId: z.string().min(1), taskId: z.string().min(1) })
const scope = z.enum(['user', 'project'])
type ResolveRegistry = (projectId: string, taskId: string) => Promise<SkillRegistry>

export function skillRoutes(resolveRegistry: ResolveRegistry) {
  const app = new Hono()
  app.get('/skills', async c => {
    const input = identity.safeParse(c.req.query())
    if (!input.success) return c.json({ error: 'Invalid task identity' }, 400)
    const registry = await resolveRegistry(input.data.projectId, input.data.taskId)
    return c.json({ skills: (await registry.list()).map(({ baseDir: _directory, ...skill }) => skill) })
  })
  app.post('/skills/activate', async c => {
    const input = identity.extend({ name: z.string().min(1), args: z.string().optional() }).safeParse(await c.req.json())
    if (!input.success) return c.json({ error: 'Invalid skill request' }, 400)
    const registry = await resolveRegistry(input.data.projectId, input.data.taskId)
    try { return c.json({ content: (await registry.activate(input.data.name, input.data.args)).content }) }
    catch { return c.json({ error: 'Skill could not be read' }, 400) }
  })
  app.post('/skills/install', async c => {
    const input = identity.extend({ path: z.string().min(1), scope: scope.default('project') }).safeParse(await c.req.json())
    if (!input.success) return c.json({ error: 'Invalid skill installation' }, 400)
    const registry = await resolveRegistry(input.data.projectId, input.data.taskId)
    try { const { baseDir: _directory, ...skill } = await registry.install(input.data); return c.json(skill) }
    catch { return c.json({ error: 'Skill installation failed; use a valid workspace package' }, 400) }
  })
  app.post('/skills/package', async c => {
    const input = identity.extend({ scope: scope.default('project') }).safeParse(c.req.query())
    if (!input.success) return c.json({ error: 'Invalid skill installation' }, 400)
    const registry = await resolveRegistry(input.data.projectId, input.data.taskId)
    try {
      const form = await c.req.formData()
      const manifest = z.array(z.object({ path: z.string().min(1).max(4096), executable: z.boolean().optional(), directory: z.boolean().optional() }).strict()).min(1).max(4096).parse(JSON.parse(String(form.get('manifest'))))
      const files = await Promise.all(manifest.map(async (item, index) => {
        if (item.directory) return { ...item, bytes: new Uint8Array() }
        const file = form.get(`file-${index}`)
        if (!(file instanceof File)) throw new Error('技能包文件不完整')
        return { ...item, bytes: new Uint8Array(await file.arrayBuffer()) }
      }))
      const { baseDir: _directory, ...skill } = await registry.installFiles(files, input.data.scope)
      return c.json(skill)
    } catch (error) { return c.json({ error: error instanceof Error ? error.message : '技能包安装失败' }, 400) }
  })
  app.delete('/skills', async c => {
    const input = identity.extend({ name: z.string().min(1), scope }).safeParse(await c.req.json())
    if (!input.success) return c.json({ error: 'Invalid skill removal' }, 400)
    const registry = await resolveRegistry(input.data.projectId, input.data.taskId)
    try { await registry.uninstall(input.data); return c.json({ removed: true }) }
    catch { return c.json({ error: 'Skill removal failed' }, 400) }
  })
  return app
}

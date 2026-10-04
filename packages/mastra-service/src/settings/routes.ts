/**
 * [INPUT]: Hono、设置存储、运行边界的保存前检查与保存后通知
 * [OUTPUT]: settingsRoutes：仅公开脱敏 GET/PATCH，拒绝通过 HTTP 导入任意文件
 * [POS]: 设置产品接口；每次保存及其运行时通知串行完成，凭证只单向写入
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { Hono } from 'hono'
import { parsePatch, SettingsError } from './schema.ts'
import type { SettingsStore } from './store.ts'
import type { PublicSettings, SettingsPatch } from './types.ts'

export interface SettingsRouteHooks {
  withUpdate?: (work: () => Promise<Response>, patch: SettingsPatch) => Promise<Response>
  beforeChange?: (patch: SettingsPatch) => void | Promise<void>
  changed?: (settings: PublicSettings, patch: SettingsPatch) => void | Promise<void>
  busy?: () => boolean | Promise<boolean>
}

export function settingsRoutes(store: SettingsStore, hooks: SettingsRouteHooks = {}) {
  const app = new Hono()
  async function publicView(): Promise<PublicSettings> {
    const settings = store.toPublic()
    return hooks.busy ? { ...settings, busy: await hooks.busy() } : settings
  }
  let pending = Promise.resolve()
  app.onError((error, c) => {
    if (error instanceof SettingsError) return c.json({ error: error.message }, error.status)
    if (error instanceof SyntaxError) return c.json({ error: 'Invalid settings request' }, 400)
    return c.json({ error: 'Settings operation failed' }, 500)
  })
  app.get('/settings', async c => c.json(await publicView()))
  app.patch('/settings', async c => {
    const patch = parsePatch(await c.req.json())
    const work = async () => {
      await hooks.beforeChange?.(patch)
      const settings = await store.update(patch)
      try { await hooks.changed?.(settings, patch) }
      catch { return c.json({ error: 'Settings saved, but runtime configuration failed', saved: true, settings }, 500) }
      return c.json(await publicView())
    }
    const operation = pending.then(() => hooks.withUpdate ? hooks.withUpdate(work, patch) : work())
    pending = operation.then(() => {}, () => {})
    return operation
  })
  return app
}

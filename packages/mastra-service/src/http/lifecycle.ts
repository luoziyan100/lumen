/**
 * [INPUT]: Hono, zod, the session catalog (ownership, per-topic order, archived listing), the studio stores and deletion journal,
 *          the application's idle guard (R1 projection + admission slot) and lifecycle/deletion
 * [OUTPUT]: lifecycleRoutes: DELETE /topics/:topicId, DELETE /topics/:topicId/sessions/:taskId (204 once everything is gone), GET /archived (Settings › Archived, L7)
 * [POS]: the user's only way to delete a topic or a conversation (R18: the AI has no such tool). Marking happens inside the idle check and the topic's catalog order;
 *        the removal itself runs after, outside both, and a second DELETE finds nothing (404). Archiving stays on the PATCH routes of studio/ and catalog/
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { Hono } from 'hono'
import { z } from 'zod'
import { CatalogError, type Catalog } from '../catalog/catalog.ts'
import type { Deletion } from '../lifecycle/deletion.ts'
import { StudioError } from '../studio/errors.ts'
import type { Studio } from '../studio/studio.ts'
import { errorBody } from './error-codes.ts'

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/)
type WhileIdle = <T>(topicId: string, taskId: string | null, work: () => Promise<T> | T) => Promise<T>

export function lifecycleRoutes(options: { catalog: Catalog; studio: Studio; whileIdle: WhileIdle; deletion: Deletion }) {
  const { catalog, studio, whileIdle, deletion } = options
  const app = new Hono()
  app.onError((error, c) => {
    if (error instanceof StudioError) return c.json(errorBody(error.message, error.code, error.params, error.detail), error.status)
    if (error instanceof CatalogError) return c.json(errorBody(error.message, error.code), error.status)
    if (error instanceof z.ZodError) return c.json(errorBody('请求格式不对，请检查后重试', 'request.invalid'), 400)
    throw error
  })
  app.delete('/topics/:topicId', async c => {
    const topicId = id.parse(c.req.param('topicId'))
    await whileIdle(topicId, null, () => catalog.serialized(topicId, () => { studio.topics.get(topicId); studio.deletions.mark(topicId) }))
    await deletion.run({ topicId, taskId: null })
    return c.body(null, 204)
  })
  app.delete('/topics/:topicId/sessions/:taskId', async c => {
    const topicId = id.parse(c.req.param('topicId')), taskId = id.parse(c.req.param('taskId'))
    await whileIdle(topicId, taskId, () => catalog.serialized(topicId, async () => { await catalog.requireSession(topicId, taskId); studio.deletions.mark(topicId, taskId) }))
    await deletion.run({ topicId, taskId })
    return c.body(null, 204)
  })
  app.get('/archived', async c => c.json(await catalog.listArchived()))
  return app
}

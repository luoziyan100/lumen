/**
 * [INPUT]: Mastra 官方 Hono 适配器、新应用组合根、产品目录/诊断脱敏、本机会话 token
 * [OUTPUT]: createHttpService：框架原生 HTTP/SSE + Lumen 产品入口，文件响应带版本校验
 * [POS]: 新应用服务边界；认证先于路由，归属校验与会话绑定分离，模型/角色/资料修改共用执行互斥，不继承旧 WS 协议
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { LocalFilesystem } from '@mastra/core/workspace'
import { MastraServer, type HonoBindings, type HonoVariables } from '@mastra/hono'
import { z } from 'zod'
import { createApplication, type ApplicationOptions } from './application.ts'
import { CatalogError, createCatalog } from './catalog/catalog.ts'
import { catalogRoutes } from './catalog/routes.ts'
import { projectSourceRoutes } from './catalog/source-routes.ts'
import { specialistRoutes } from './agents/resume/routes.ts'
import { agentCatalogRoutes } from './agents/catalog/routes.ts'
import { nativeRoutePolicy } from './http/native-routes.ts'
import { displaySnapshot } from './http/snapshot.ts'
import { skillRoutes } from './http/skills.ts'
import { openSettingsStore, SettingsError } from './settings/store.ts'
import { settingsRoutes } from './settings/routes.ts'
import type { SettingsPatch } from './settings/types.ts'
import { suspensionResponses } from './http/suspensions.ts'
import { SourceUnavailable } from './workspace/source.ts'
import { nativeFileLocation } from './workspace/native-file.ts'
import { DiagnosticsError } from './diagnostics/index.ts'
import { redactPayload } from './diagnostics/redact.ts'
import { diagnosticsRoutes } from './http/diagnostics.ts'
import { legacyDiagnosticsRoutes } from './http/legacy-diagnostics.ts'
import { createLegacyDiagnostics } from './migration/legacy-diagnostics/reader.ts'

const identity = z.object({ projectId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/), taskId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/) })
const upload = identity.extend({ path: z.string().min(1), content: z.string() })
const fileIdentity = identity.extend({ scope: z.enum(['task', 'shared', 'memory', 'source']).default('task') })

function authorized(header: string | undefined, token: string): boolean {
  const actual = Buffer.from(header ?? ''), expected = Buffer.from(`Bearer ${token}`)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export async function createHttpService(options: ApplicationOptions & { token: string; allowedOrigins?: string[] }) {
  if (options.token.length < 24) throw new Error('Service token must contain at least 24 characters')
  const settings = await openSettingsStore({ dataRoot: options.dataRoot })
  function configuredModel() {
    try { return settings.modelSettings() }
    catch (error) { if (error instanceof SettingsError && error.status === 409) return null; throw error }
  }
  const application = await createApplication({ ...options, model: settings.isInitialized() ? configuredModel() ?? undefined : options.model, userInstructions: settings.toPublic().userInstructions,
    researchBudget: () => settings.toPublic().researchBudget,
    pricing: () => {
      const snapshot = settings.toPublic(), profile = snapshot.profiles.find(profile => profile.id === snapshot.activeProfileId)
      return profile?.pricing?.model === profile?.activeModel ? profile?.pricing : undefined
    },
    diagnostics: { enabled: () => settings.toPublic().collectExecEvidence, secrets: () => [options.token, ...settings.secrets(), ...(options.diagnostics?.secrets?.() ?? [])] },
  })
  let catalog: ReturnType<typeof createCatalog>
  try { catalog = createCatalog(application.root, application.memory) }
  catch (error) { await application.close(); throw error }
  const app = new Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>()
  let closing = false
  let reconfiguring = false
  let executionRequests = 0
  let configurationTail = Promise.resolve()
  function isModelSelectionPatch(patch: SettingsPatch | undefined) {
    if (!patch) return false
    const entries = Object.entries(patch)
    if (!entries.length) return false
    return entries.every(([key, value]) => {
      if (key === 'activeProfileId') return typeof value === 'string'
      if (key !== 'upsertProfile' || !value || typeof value !== 'object') return false
      const fields = Object.keys(value)
      return 'activeModel' in value && fields.every(field => field === 'id' || field === 'activeModel')
    })
  }
  function withConfigurationUpdate<T>(work: () => Promise<T>, patch?: SettingsPatch): Promise<T> {
    const operation = configurationTail.then(async () => {
      reconfiguring = true
      try {
        if (!isModelSelectionPatch(patch) && (executionRequests > 0 || await application.isBusy())) throw new SettingsError('请先完成或停止正在进行的研究，再修改配置', 409)
        return await work()
      } finally { reconfiguring = false }
    })
    configurationTail = operation.then(() => {}, () => {})
    return operation
  }
  const origins = new Set(options.allowedOrigins ?? ['tauri://localhost', 'http://tauri.localhost'])
  app.use('*', async (c, next) => {
    if (closing) return c.json({ error: 'Service closing' }, 503)
    const origin = c.req.header('Origin')
    if (origin && !origins.has(origin)) return c.json({ error: 'Origin denied' }, 403)
    if (origin) {
      c.header('Access-Control-Allow-Origin', origin)
      c.header('Vary', 'Origin')
      c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    }
    if (c.req.method === 'OPTIONS') return c.body(null, 204)
    if (!authorized(c.req.header('Authorization'), options.token)) return c.json({ error: 'Unauthorized' }, 401)
    await next()
  })
  app.use('*', (c, next) => {
    const limitMiB = c.req.path === '/lumen/skills/package' ? 34 : 25
    return bodyLimit({ maxSize: limitMiB * 1024 * 1024,
      onError: c => c.json({ error: `上传内容超过 ${limitMiB} MiB 请求上限，请缩小文件后重试` }, 413),
    })(c, next)
  })
  app.use('/api/*', async (c, next) => {
    if (c.req.method === 'POST' && reconfiguring) return c.json({ error: '配置正在保存，请稍后重试' }, 409)
    if (c.req.path.endsWith('/messages') && c.req.method === 'POST' && !application.hasModel()) return c.json({ error: '请先在设置中配置模型' }, 409)
    if (c.req.method !== 'POST') return next()
    executionRequests++
    try { await next() } finally { executionRequests-- }
  })
  async function bindSession(projectId: string, taskId: string) {
    await catalog.requireSession(projectId, taskId)
    return application.session(projectId, taskId)
  }
  async function filesFor({ projectId, taskId, scope }: z.infer<typeof fileIdentity>) {
    await catalog.requireSession(projectId, taskId)
    if (scope !== 'task') return application.projectFiles(projectId, scope)
    const session = await application.session(projectId, taskId)
    const workspace = await application.controller.resolveWorkspace({ session })
    if (!workspace?.filesystem) throw new Error('Workspace unavailable')
    return workspace.filesystem
  }
  app.onError((error, c) => {
    if (error instanceof CatalogError || error instanceof SettingsError || error instanceof DiagnosticsError) return c.json({ error: error.message }, error.status)
    if (error instanceof SourceUnavailable) return c.json({ error: error.message }, 404)
    const detail = redactPayload({ method: c.req.method, path: c.req.path, name: error.name, message: error.message,
      cause: error.cause instanceof Error ? { name: error.cause.name, message: error.cause.message } : undefined,
    }, [options.token, ...settings.secrets(), ...(options.diagnostics?.secrets?.() ?? [])])
    application.mastra.getLogger().error('HTTP request failed', { detail: detail.value })
    return c.json({ error: 'Request failed' }, 500)
  })
  app.use('*', nativeRoutePolicy(bindSession, (projectId, taskId) => catalog.requireSession(projectId, taskId)))
  app.use('*', suspensionResponses(async (projectId, taskId) => ({ session: await bindSession(projectId, taskId), agent: application.agent })))
  app.use('/api/agent-controller/lumen/sessions/:resourceId/messages', async (c, next) => {
    if (c.req.method !== 'POST') return next()
    const body = await c.req.raw.clone().json().catch(() => null)
    const resourceId = decodeURIComponent(c.req.path.split('/').at(-2)!)
    await next()
    if (!c.res.ok || typeof body?.message !== 'string') return
    const [projectId, taskId] = resourceId.split(':')
    try { await catalog.titleFromMessage(projectId!, taskId!, body.message) }
    catch { application.mastra.getLogger().warn('Automatic session title update failed') }
  })
  app.post('/api/agent-controller/lumen/sessions/:resourceId/abort', async c => {
    const [projectId, taskId] = c.req.param('resourceId').split(':')
    await application.stop(projectId!, taskId!)
    return c.json({ ok: true })
  })
  app.route('/lumen', catalogRoutes(catalog, application.liveSessionStates))
  app.route('/lumen', specialistRoutes({ history: application.specialistHistory, budget: application.familyBudget, session: bindSession,
    withExecution: async work => {
      if (reconfiguring) throw new SettingsError('配置正在保存，请稍后重试', 409)
      executionRequests++
      try { return await work() } finally { executionRequests-- }
    },
  }))
  app.route('/lumen', agentCatalogRoutes(catalog, application.specialistProjects, withConfigurationUpdate))
  app.route('/lumen', diagnosticsRoutes(application.diagnostics, (projectId, taskId) => catalog.requireSession(projectId, taskId)))
  app.route('/lumen', legacyDiagnosticsRoutes(createLegacyDiagnostics({
    dataRoot: application.root,
    authorize: (projectId, taskId) => catalog.requireSession(projectId, taskId),
    secrets: () => [options.token, ...settings.secrets(), ...(options.diagnostics?.secrets?.() ?? [])],
  })))
  app.route('/lumen', projectSourceRoutes(catalog, {
    dataRoot: application.root,
    withUpdate: withConfigurationUpdate,
    changed: projectId => application.invalidateProjectSource(projectId),
  }))
  app.route('/lumen', settingsRoutes(settings, {
    busy: () => application.isBusy(),
    withUpdate: (work, patch) => withConfigurationUpdate(work, patch),
    changed: async (publicSettings, patch) => {
      const modelFields = new Set(['activeProfileId', 'deleteProfileId', 'upsertProfile'])
      const onlyPreferences = Object.keys(patch).every(key => key === 'collectExecEvidence' || key === 'userInstructions' || key === 'researchBudget')
      if (onlyPreferences) {
        if ('userInstructions' in patch) application.configureInstructions(publicSettings.userInstructions)
        return
      }
      if (!Object.keys(patch).some(key => modelFields.has(key))) return
      await application.configureModel(configuredModel(), publicSettings.userInstructions)
    },
  }))
  app.route('/lumen', skillRoutes(async (projectId, taskId) => {
    await bindSession(projectId, taskId)
    return application.skillsFor(projectId, taskId)
  }))
  app.get('/lumen/health', c => c.json({ engine: 'mastra', ready: true }))
  app.post('/lumen/sessions', async c => {
    const parsed = identity.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'Invalid identity' }, 400)
    const { projectId, taskId } = parsed.data
    try { await catalog.createSession(projectId, taskId) }
    catch (error) {
      if (error instanceof CatalogError) return c.json({ error: error.message }, error.status)
      throw error
    }
    const session = await bindSession(projectId, taskId)
    return c.json({ resourceId: session.identity.getResourceId(), threadId: session.thread.getId() })
  })
  app.get('/lumen/snapshot', async c => {
    const parsed = identity.safeParse(c.req.query())
    if (!parsed.success) return c.json({ error: 'Invalid identity' }, 400)
    const { projectId, taskId } = parsed.data
    const session = await bindSession(projectId, taskId)
    return c.json({ displayState: displaySnapshot(session.displayState.get(), await application.childUsage.read(session.identity.getResourceId())) })
  })
  app.post('/lumen/files', async c => {
    const parsed = upload.safeParse(await c.req.json())
    if (!parsed.success) return c.json({ error: 'Invalid file' }, 400)
    const { projectId, taskId, path, content } = parsed.data
    const session = await bindSession(projectId, taskId)
    const workspace = await application.controller.resolveWorkspace({ session })
    if (!workspace?.filesystem) return c.json({ error: 'Workspace unavailable' }, 503)
    await workspace.filesystem.writeFile(path, content)
    return c.json({ path })
  })
  app.get('/lumen/files/location', async c => {
    const parsed = fileIdentity.extend({ path: z.string().min(1).max(4096) }).safeParse(c.req.query())
    if (!parsed.success) return c.json({ error: 'Invalid file identity' }, 400)
    const filesystem = await filesFor(parsed.data)
    if (!(filesystem instanceof LocalFilesystem)) return c.json({ error: '当前文件没有本机位置' }, 400)
    try { return c.json(await nativeFileLocation(filesystem.basePath, parsed.data.path)) }
    catch { return c.json({ error: '文件不存在或不在可访问的工作区内' }, 400) }
  })
  app.get('/lumen/files', async c => {
    const parsed = fileIdentity.safeParse(c.req.query())
    if (!parsed.success) return c.json({ error: 'Invalid identity' }, 400)
    const filesystem = await filesFor(parsed.data)
    const path = c.req.query('path') ?? ''
    if (c.req.query('binary') === '1') {
      const stat = await filesystem.stat(path)
      const etag = `"${stat.modifiedAt.getTime().toString(36)}-${stat.size.toString(36)}"`
      c.header('ETag', etag)
      if (c.req.header('If-None-Match') === etag) return c.body(null, 304)
      const bytes = await filesystem.readFile(path)
      c.header('Content-Type', 'application/octet-stream')
      return c.body(new Uint8Array(typeof bytes === 'string' ? Buffer.from(bytes) : bytes))
    }
    const content = await filesystem.readFile(path, { encoding: 'utf8' })
    return c.json({ content })
  })
  app.post('/lumen/uploads', async c => {
    const parsed = fileIdentity.safeParse(c.req.query())
    if (!parsed.success) return c.json({ error: 'Invalid identity' }, 400)
    if (parsed.data.scope === 'source') return c.json({ error: '外部资料只读，请上传到任务或项目资料' }, 403)
    const body = await c.req.formData().catch(() => null)
    if (!body) return c.json({ error: '附件上传内容不完整，请重新选择文件后重试' }, 400)
    const file = body.get('file')
    if (!(file instanceof File)) return c.json({ error: 'A file is required' }, 400)
    const name = file.name.split(/[/\\]/).pop()?.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 120) || 'document'
    const path = parsed.data.scope === 'task' ? `library/${randomUUID()}-${name}` : name
    const filesystem = await filesFor(parsed.data)
    await filesystem.writeFile(path, new Uint8Array(await file.arrayBuffer()), { overwrite: false })
    return c.json({ path, name: file.name, size: file.size, mediaType: file.type })
  })
  app.get('/lumen/assets', async c => {
    const parsed = fileIdentity.safeParse(c.req.query())
    if (!parsed.success) return c.json({ error: 'Invalid identity' }, 400)
    try {
      const filesystem = await filesFor(parsed.data)
      return c.json({ entries: await filesystem.readdir(c.req.query('path') || '.') })
    } catch (error) {
      if (error instanceof SourceUnavailable) return c.json({ entries: [], unbound: true })
      throw error
    }
  })
  app.post('/lumen/stop', async c => {
    const parsed = identity.safeParse(await c.req.json())
    if (!parsed.success) return c.json({ error: 'Invalid identity' }, 400)
    await catalog.requireSession(parsed.data.projectId, parsed.data.taskId)
    await application.stop(parsed.data.projectId, parsed.data.taskId)
    return c.json({ stopped: true })
  })
  app.get('/lumen/children', async c => {
    const parsed = identity.safeParse(c.req.query())
    if (!parsed.success) return c.json({ error: 'Invalid identity' }, 400)
    await catalog.requireSession(parsed.data.projectId, parsed.data.taskId)
    const resourceId = `${parsed.data.projectId}:${parsed.data.taskId}`
    const result = await application.mastra.backgroundTaskManager?.listTasks({ resourceId, perPage: 100 })
    return c.json({ ...(result ?? { tasks: [], total: 0 }), childTokenUsage: await application.childUsage.read(resourceId) })
  })
  app.post('/lumen/children/:id/cancel', async c => {
    const parsed = identity.safeParse(await c.req.json())
    if (!parsed.success) return c.json({ error: 'Invalid identity' }, 400)
    const manager = application.mastra.backgroundTaskManager
    const task = await manager?.getTask(c.req.param('id'))
    if (!task || task.resourceId !== `${parsed.data.projectId}:${parsed.data.taskId}`) return c.json({ error: 'Child not found' }, 404)
    await manager!.cancel(task.id)
    return c.json({ cancelled: true })
  })
  const server = new MastraServer({ app, mastra: application.mastra })
  try { await server.init() } catch (error) { await catalog.close(); await application.close(); throw error }
  return { app, application, catalog, settings, close: async () => { closing = true; await settings.close(); await catalog.close(); await application.close() } }
}

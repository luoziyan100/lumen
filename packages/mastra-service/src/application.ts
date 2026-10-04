/**
 * [INPUT]: Mastra Controller/Memory/Workspace、项目角色/技能只读根、原生步骤守卫与隔离诊断评估
 * [OUTPUT]: createApplication：独立存储、会话/后台活动投影、动态角色、父子预算/专家继续、诊断与排空关闭入口
 * [POS]: 新应用组合根；单一原生执行链，目录、工具和生命周期均绑定受信任务身份
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { mkdir } from 'node:fs/promises'
import { createSkillRegistry, createSkillTools } from './skills/index.ts'
import { trackAgentDrain } from './drain.ts'
import { recoverInterruptedChildren } from './lifecycle/recovery.ts'
import { restoreSuspendedQuestions, cancelSuspendedQuestions } from './lifecycle/questions.ts'
import { researchHttp } from './research/http.ts'
import { createPaperTools } from './research/papers.ts'
import { createWebTools } from './research/web.ts'
import { createPdfTool } from './research/pdf.ts'
import { resolve, join } from 'node:path'
import { Agent } from '@mastra/core/agent'
import { Mastra } from '@mastra/core/mastra'
import { AgentController, type AgentControllerRequestContext } from '@mastra/core/agent-controller'
import type { RequestContext } from '@mastra/core/request-context'
import { TASK_STATE_TYPE, type TaskItemSnapshot } from '@mastra/core/tools'
import { LocalFilesystem, type Workspace } from '@mastra/core/workspace'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import type { ModelSettings } from './model.ts'
import { createConfiguredModels } from './settings/models.ts'
import { SettingsError } from './settings/store.ts'
import { RESEARCH_PERSONA } from './agents/persona.ts'
import { taskWorkspace, projectFilesystem, type ProjectFileScope } from './workspace/workspace.ts'
import { invalidateProjectSourceCache } from './workspace/cache.ts'
import { readSourceBinding, sourcePath } from './workspace/source.ts'
import { createMemoryTools, readMemoryIndex } from './workspace/memory.ts'
import { createSharedTools } from './workspace/shared.ts'
import { createExecutionTools } from './execution/tools.ts'
import { RESEARCH_DOMAINS } from './execution/domains.ts'
import { createIngestionTools, createImageToolResultProcessor, type IngestionWorkspaceResolver } from './ingestion/index.ts'
import { createInputProcessors, modelTools } from './agents/context.ts'
import { createProjectSpecialists } from './agents/catalog/projects.ts'
import { createDiagnostics, DiagnosticsError } from './diagnostics/index.ts'
import { createRunBudget } from './agents/guards/budget.ts'
import { createEmptyActionProcessor } from './agents/guards/empty-action.ts'
import { createHistoryTools } from './agents/guards/history.ts'
import { createChildUsage } from './agents/usage/children.ts'
import { createSpecialistHistory } from './agents/resume/index.ts'
import { createFamilyBudget } from './agents/budget/index.ts'
import type { ResearchBudget, ModelPricing } from './settings/types.ts'

export interface ApplicationOptions { dataRoot: string; researchBudget?: () => ResearchBudget; pricing?: (settings?: Readonly<ModelSettings>) => ModelPricing | undefined; model?: ModelSettings; userInstructions?: string; exclusiveStartup?: true; research?: { fetch?: typeof fetch; openAlexKey?: string; tavilyKey?: string }; diagnostics?: { enabled?: () => boolean; secrets?: () => readonly string[] } }

function safeId(value: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)) throw new Error('Invalid project or task ID')
  return value
}

export async function createApplication(options: ApplicationOptions) {
  const root = resolve(options.dataRoot)
  await mkdir(root, { recursive: true, mode: 0o700 })
  const storage = new LibSQLStore({ id: 'lumen-storage', url: `file:${join(root, 'mastra.sqlite')}` })
  const childUsage = createChildUsage(storage)
  if (options.exclusiveStartup) {
    await storage.init()
    const tasks = await storage.getStore('backgroundTasks')
    if (tasks) await recoverInterruptedChildren(tasks, { exclusiveStartup: true })
  }
  const memory = new Memory({ storage, options: {
    lastMessages: 100, semanticRecall: false, workingMemory: { enabled: false },
  } })
  const specialistHistory = createSpecialistHistory(storage, memory)
  const http = researchHttp(options.research?.fetch)
  const researchTools = { ...createPaperTools(http, options.research?.openAlexKey), ...createWebTools(http, options.research?.tavilyKey), extract_pdf: createPdfTool(http) }
  const workspaces = new Map<string, Workspace>()
  const projectFilesystems = new Map<string, ReturnType<typeof projectFilesystem>>()
  function projectFiles(project: string, scope: ProjectFileScope, readOnly = false) {
    const projectId = safeId(project), key = `${projectId}:${scope}:${readOnly}`
    let files = projectFilesystems.get(key)
    if (!files) {
      files = projectFilesystem(root, projectId, scope, readOnly)
      projectFilesystems.set(key, files)
      void files.catch(() => { if (projectFilesystems.get(key) === files) projectFilesystems.delete(key) })
    }
    return files
  }
  async function invalidateProjectSource(project: string) {
    const projectId = safeId(project)
    await invalidateProjectSourceCache(projectFilesystems, projectId)
    await specialistProjects.invalidate(projectId)
  }
  function projectFromContext(context: AgentControllerRequestContext | undefined) {
    if (!context?.resourceId || !workspaces.has(context.resourceId)) throw new Error('Session workspace is required')
    return context.resourceId.split(':')[0]!
  }
  async function skillsFor(project: string, task: string) {
    const projectId = safeId(project), taskId = safeId(task)
    const projectRoot = join(root, 'projects', projectId)
    const source = await readSourceBinding(projectRoot)
    const sourceRoot = source.path ? await sourcePath(projectRoot) : undefined
    return createSkillRegistry({ workspaceDir: join(root, 'projects', projectId, 'tasks', taskId), roots: {
      userSkillsDir: join(root, 'skills'), projectSkillsDir: join(root, 'projects', projectId, 'skills'),
      sourceSkillsDir: sourceRoot ? join(sourceRoot, '.lumen', 'skills') : undefined,
    } })
  }
  const skillTools = createSkillTools(context => {
    const owner = context?.requestContext?.get<'controller', AgentControllerRequestContext>('controller')
    if (!owner?.resourceId || !workspaces.has(owner.resourceId)) throw new Error('Session workspace is required')
    const [project, task] = owner.resourceId.split(':')
    return skillsFor(project!, task!)
  })
  const memoryTools = createMemoryTools(context => projectFiles(projectFromContext(context?.requestContext?.get<'controller', AgentControllerRequestContext>('controller')), 'memory'))
  const sharedTools = createSharedTools((context, scope) => projectFiles(projectFromContext(context?.requestContext?.get<'controller', AgentControllerRequestContext>('controller')), scope, true))
  async function executionEnvironment(resourceId: string) {
    if (!workspaces.has(resourceId)) throw new Error('Session workspace is required')
    const session = await sessions.get(resourceId)
    if (!session || session.resolveToolApproval('run_code') === 'deny') throw new Error('当前会话已禁止运行代码，专家也不能绕过此限制')
    const [project, task] = resourceId.split(':')
    const skills = await (await skillsFor(project!, task!)).list()
    return { allowedDomains: RESEARCH_DOMAINS, readRoots: skills.map(skill => skill.baseDir) }
  }
  const executionTools = createExecutionTools(async context => {
    const owner = context?.requestContext?.get<'controller', AgentControllerRequestContext>('controller')
    const filesystem = owner?.resourceId ? workspaces.get(owner.resourceId)?.filesystem : undefined
    if (!(filesystem instanceof LocalFilesystem)) throw new Error('Task local filesystem is required')
    return { filesystem, ...await executionEnvironment(owner!.resourceId) }
  })
  const resolveWorkspace: IngestionWorkspaceResolver = context => {
    const owner = context?.requestContext?.get<'controller', AgentControllerRequestContext>('controller')
    const workspace = owner?.resourceId ? workspaces.get(owner.resourceId) : undefined
    if (!workspace) throw new Error('Session workspace is required')
    return workspace
  }
  const ingestionTools = createIngestionTools(resolveWorkspace)
  const imageProcessor = createImageToolResultProcessor(resolveWorkspace)
  const models = createConfiguredModels()
  let modelSettings = options.model
  let selectedModel = options.model ? models.select(options.model) : ''
  let userInstructions = options.userInstructions ?? ''
  const sessionModelIds = new Map<string, string>()
  function sessionModelId(requestContext?: RequestContext) {
    return requestContext?.get<'controller', AgentControllerRequestContext>('controller')?.session.modelId || selectedModel
  }
  function settingsFor(requestContext?: RequestContext) {
    const modelId = sessionModelId(requestContext)
    return (modelId ? models.settings(modelId) : undefined) ?? modelSettings
  }
  function settingsForResource(resourceId?: string) {
    const modelId = resourceId ? sessionModelIds.get(resourceId) : selectedModel
    return (modelId ? models.settings(modelId) : undefined) ?? modelSettings
  }
  const currentModel = ({ requestContext }: { requestContext?: RequestContext } = {}) => {
    const model = sessionModelId(requestContext)
    if (!model) throw new SettingsError('请先在设置中配置模型', 409)
    return model
  }
  const familyBudget = createFamilyBudget({ storage, limits: options.researchBudget ?? (() => ({})),
    pricing: resourceId => {
      const settings = settingsForResource(resourceId)
      return settings?.pricing ?? options.pricing?.(settings)
    },
    contextWindow: resourceId => settingsForResource(resourceId)?.contextWindow ?? 128000,
    mainRunId: resourceId => activeMainRuns.get(resourceId) })
  const activeMainRuns = new Map<string, string>()
  const budget = createRunBudget({ onTimeout: resourceId => { const [project, task] = resourceId.split(':'); return stopSession(project!, task!) } })
  const historyTools = createHistoryTools(memory, (resourceId, threadId) => {
    if (resourceId !== threadId || !workspaces.has(resourceId)) throw new Error('当前会话未绑定')
  })
  const diagnostics = createDiagnostics({ dataRoot: root, storage, enabled: options.diagnostics?.enabled,
    liveModel: () => modelSettings ? { ...modelSettings } : null,
    secrets: () => [modelSettings?.apiKey, options.research?.openAlexKey, options.research?.tavilyKey, ...(options.diagnostics?.secrets?.() ?? [])].filter((value): value is string => !!value),
    authorize: async resourceId => {
      const thread = await memory.getThreadById({ threadId: resourceId })
      if (!thread || thread.resourceId !== resourceId) throw new DiagnosticsError('会话不存在', 404)
      return { resourceId, threadId: thread.id }
    },
  })
  const specialistProjects = createProjectSpecialists({ dataRoot: root, mastra: () => mastra, model: currentModel, memory, childUsage, familyBudget, specialistHistory,
    tools: { ...researchTools, ...skillTools, ...sharedTools, ...memoryTools }, modelSettings: settingsFor,
    resolveExecutionEnvironment: executionEnvironment,
    resolveTaskFilesystem(resourceId) {
      const filesystem = workspaces.get(resourceId)?.filesystem
      if (!(filesystem instanceof LocalFilesystem)) throw new Error('Task local filesystem is required')
      return filesystem
    },
  })
  const agent = new Agent({ id: 'research', name: 'Lumen', model: currentModel,
    instructions: async ({ requestContext }) => {
      const owner = requestContext.get<'controller', AgentControllerRequestContext>('controller')
      const index = owner?.resourceId ? await readMemoryIndex(await projectFiles(projectFromContext(owner), 'memory')) : ''
      return [RESEARCH_PERSONA, userInstructions && `用户研究偏好：\n${userInstructions}`, index && `项目记忆索引（按需读取，不视为外部证据）：\n${index}`].filter(Boolean).join('\n\n')
    },
    memory,
    tools: ({ requestContext }) => modelTools(settingsFor(requestContext), { ...researchTools, ...skillTools, ...memoryTools, ...sharedTools, ...executionTools, ...ingestionTools, ...historyTools }),
    agents: async ({ requestContext }) => (await specialistProjects.get(projectFromContext(requestContext.get<'controller', AgentControllerRequestContext>('controller')))).agents,
    inputProcessors: ({ requestContext }) => [budget.inputProcessor, ...createInputProcessors(settingsFor(requestContext), imageProcessor), familyBudget.inputProcessor],
    outputProcessors: [familyBudget.outputProcessor, createEmptyActionProcessor()], maxProcessorRetries: 1,
    defaultOptions: { delegation: specialistProjects.delegation },
    backgroundTasks: specialistProjects.backgroundTasks,
  })
  const drain = trackAgentDrain(agent)
  const drainSpecialists = specialistProjects.drain
  const controller = new AgentController({
    id: 'lumen', agent, storage, memory,
    workspace: ({ requestContext }) => {
      const context = requestContext.get<'controller', AgentControllerRequestContext>('controller')
      const workspace = workspaces.get(context?.resourceId)
      if (!workspace) throw new Error('Session workspace is required')
      return workspace
    },
    gateways: [models.gateway],
    modes: [{ id: 'research', name: '研究', defaultModelId: selectedModel, metadata: { default: true } }],
    disableBuiltinTools: ['subagent', 'submit_plan'],
    toolCategoryResolver: name => {
      if (['read_file', 'list_files', 'grep', 'read_memory', 'read_history', 'read_project_file', 'list_project_files', 'search_papers', 'get_citations', 'fetch_url', 'search_web', 'extract_pdf', 'extract_docx', 'look_at_image', 'list_skills', 'run_skill', 'read_skill_file', 'task_check'].includes(name)) return 'read'
      if (['write_file', 'edit_file', 'write_memory', 'copy_project_file', 'install_skill', 'task_write', 'task_update', 'task_complete'].includes(name)) return 'edit'
      // 原生 agent-* 只来自已注册的项目角色；角色白名单和独立目录先于执行权限生效。
      if (name === 'run_code' || name.startsWith('agent-')) return 'execute'
      return 'other'
    },
  })
  const mastra = new Mastra({ agents: { research: agent }, agentControllers: { lumen: controller }, storage, gateways: { lumen: models.gateway }, observability: diagnostics.observability,
    backgroundTasks: { enabled: true, recoverStaleTasksOnStart: false, defaultRetries: { maxRetries: 0 }, backpressure: 'reject', globalConcurrency: 4, perAgentConcurrency: 2, defaultTimeoutMs: 300000 },
  })
  try { await controller.init() } catch (error) { await controller.destroy(); await mastra.shutdown(); await diagnostics.close(); await storage.close(); throw error }
  const sessions = new Map<string, ReturnType<typeof controller.createSession>>()
  let closing: Promise<void> | undefined

  function sessionIsBusy(session: Awaited<ReturnType<typeof controller.createSession>>) {
    const state = session.displayState.get()
    return state.isRunning || !!state.pendingApproval || state.pendingSuspensions.size > 0 || session.run.getRunId() !== null
  }

  async function applyModelToSession(session: Awaited<ReturnType<typeof controller.createSession>>) {
    if (!selectedModel || sessionIsBusy(session) || session.model.get() === selectedModel) return
    await session.model.switch({ modelId: selectedModel })
    sessionModelIds.set(session.identity.getResourceId(), selectedModel)
  }

  async function applyModelToIdleSessions() {
    for (const pending of sessions.values()) await applyModelToSession(await pending)
  }

  async function openSession(resourceId: string, projectId: string, taskId: string) {
    const workspace = await taskWorkspace(root, projectId, taskId)
    workspaces.set(resourceId, workspace)
    try {
      await specialistProjects.get(projectId)
      const session = await controller.createSession({ resourceId, threadId: resourceId, workspace })
      // 原生 tally 已从 thread 恢复；零增量事件只同步 DisplayState，不再次累计。
      session.emit({ type: 'usage_update', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } })
      const previousUsage = session.getTokenUsage(), previousChildren = await childUsage.read(resourceId)
      const history = await memory.recall({ threadId: resourceId, resourceId, perPage: 1, page: 0 })
      const previous = previousUsage || previousChildren ? {
        promptTokens: (previousUsage?.promptTokens ?? 0) + (previousChildren?.promptTokens ?? 0),
        completionTokens: (previousUsage?.completionTokens ?? 0) + (previousChildren?.completionTokens ?? 0),
      } : null
      await familyBudget.initialize(resourceId, previous && previous.promptTokens + previous.completionTokens > 0 ? previous : null, history.total > 0)
      budget.observe(session)
      session.subscribe(event => {
        const runId = session.run.getRunId()
        if (runId) activeMainRuns.set(resourceId, runId)
        if (event.type === 'agent_end' && event.reason !== 'suspended') {
          const finishedRun = activeMainRuns.get(resourceId)
          void familyBudget.finish(resourceId, finishedRun, 'main').catch(error => session.emit({ type: 'error', error, errorType: 'budget_settlement' }))
        }
      })
      const state = await storage.getStore('threadState')
      const tasks = await state?.getState<TaskItemSnapshot[]>({ threadId: resourceId, type: TASK_STATE_TYPE })
      if (tasks) session.displayState.restoreTasks(tasks)
      const persistedModel = await session.thread.getSetting({ key: 'modeModelId_research' })
      const usablePersistedModel = typeof persistedModel === 'string' && !!models.settings(persistedModel)
      if (selectedModel && !usablePersistedModel) await session.model.switch({ modelId: selectedModel })
      sessionModelIds.set(resourceId, session.model.get())
      const rules = session.permissions.getRules()
      for (const category of ['read', 'edit', 'execute'] as const) if (!rules.categories[category]) await session.permissions.setForCategory({ category, policy: 'allow' })
      for (const toolName of ['ask_user', 'task_write', 'task_update', 'task_complete', 'task_check']) {
        if (!rules.tools[toolName]) await session.permissions.setForTool({ toolName, policy: 'allow' })
      }
      await restoreSuspendedQuestions({ session, agent })
      return session
    }
    catch (error) {
      sessions.delete(resourceId)
      sessionModelIds.delete(resourceId)
      workspaces.delete(resourceId)
      await workspace.destroy()
      throw error
    }
  }

  async function cancelChildren(resourceId?: string) {
    const manager = mastra.backgroundTaskManager
    if (!manager) return
    for (;;) {
      const { tasks } = await manager.listTasks({ resourceId, status: ['pending', 'running', 'suspended'], perPage: 100 })
      if (!tasks.length) return
      await Promise.all(tasks.map(task => manager.cancel(task.id)))
    }
  }

  async function getSession(project: string, task: string) {
    if (closing) throw new Error('Application is closed')
    const projectId = safeId(project), taskId = safeId(task)
    const resourceId = `${projectId}:${taskId}`
    let pending = sessions.get(resourceId)
    if (!pending) {
      pending = openSession(resourceId, projectId, taskId)
      sessions.set(resourceId, pending)
    }
    const session = await pending
    await applyModelToSession(session)
    return session
  }

  async function shutdown() {
    const pending = await Promise.allSettled(sessions.values())
    const active = pending.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
    for (const session of active) session.abort()
    await cancelChildren()
    await Promise.all(active.map(async session => {
      const signal = AbortSignal.timeout(10000)
      while (session.stream.isActive() || session.run.getRunId() !== null) {
        await Promise.race([session.stream.waitForTeardown(signal), session.run.waitForTeardown(signal)])
        signal.throwIfAborted()
      }
    }))
    await drain()
    await cancelChildren()
    await drainSpecialists()
    await specialistHistory.interrupt()
    for (const resourceId of sessions.keys()) await familyBudget.finish(resourceId)
    budget.close()
    await diagnostics.flush()
    for (const resourceId of sessions.keys()) await controller.deleteSession({ resourceId })
    await controller.destroy()
    await mastra.shutdown({ drainTimeout: 10000 })
    await specialistProjects.close()
    await diagnostics.close()
    for (const workspace of workspaces.values()) await workspace.destroy()
    for (const pending of projectFilesystems.values()) await (await pending).destroy()
    await storage.close()
  }

  return {
    controller, mastra, storage, memory, root, skillsFor, projectFiles, invalidateProjectSource, agent, diagnostics, specialistProjects, childUsage, familyBudget, specialistHistory,
    hasModel: () => !!selectedModel,
    async liveSessionStates() {
      const states = new Map<string, { running: boolean; waiting: boolean }>()
      for (const [resourceId, pending] of sessions) {
        const state = (await pending).displayState.get()
        states.set(resourceId, { running: state.isRunning, waiting: !!state.pendingApproval || state.pendingSuspensions.size > 0 })
      }
      const children = await mastra.backgroundTaskManager?.listTasks({ status: ['pending', 'running', 'suspended'], perPage: 10000 })
      for (const child of children?.tasks ?? []) {
        if (!child.resourceId) continue
        const state = states.get(child.resourceId) ?? { running: false, waiting: false }
        if (child.status === 'suspended') state.waiting = true
        else state.running = true
        states.set(child.resourceId, state)
      }
      return states
    },
    async isBusy() {
      for (const pending of sessions.values()) {
        const session = await pending
        const state = session.displayState.get()
        if (state.isRunning || state.pendingApproval || state.pendingSuspensions.size) return true
      }
      const children = await mastra.backgroundTaskManager?.listTasks({ status: ['pending', 'running', 'suspended'], perPage: 1 })
      if (children?.tasks.length) return true
      const suspended = await agent.listSuspendedRuns({ perPage: 1, page: 0 })
      return suspended.runs.length > 0
    },
    async configureModel(settings: ModelSettings | null, instructions: string) {
      modelSettings = settings ?? undefined
      const nextModel = settings ? models.select(settings) : ''
      const changed = nextModel !== selectedModel
      selectedModel = nextModel
      userInstructions = instructions
      if (changed) await applyModelToIdleSessions()
    },
    configureInstructions(instructions: string) {
      userInstructions = instructions
    },
    session: getSession,
    stop: stopSession,
    close() {
      closing ??= shutdown()
      return closing
    },
  }

  async function stopSession(project: string, task: string) {
    const resourceId = `${safeId(project)}:${safeId(task)}`
    const session = await getSession(project, task)
    session.abort()
    await cancelChildren(resourceId)
    await drain(resourceId)
    await drainSpecialists(resourceId)
    await specialistHistory.interrupt(resourceId)
    await familyBudget.finish(resourceId)
    const workflows = await storage.getStore('workflows')
    if (workflows) await cancelSuspendedQuestions({ session, agent }, workflows)
  }
}

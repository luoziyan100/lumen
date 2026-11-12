/**
 * [INPUT]: Mastra Controller/Memory/Workspace、studio 存储（主题/资料库）、用户角色/技能根、原生步骤守卫与隔离诊断评估
 * [OUTPUT]: createApplication：独立存储、会话/后台活动投影、全局专家组、父子预算/专家继续、诊断与排空关闭入口
 * [POS]: 新应用组合根；单一原生执行链，身份是 topicId:taskId。同主题的对话共用一个主题工作区（按主题缓存、关闭时只销毁一次），材料只经引用清单触达
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { mkdir } from 'node:fs/promises'
import { createSkillRegistry, createSkillTools } from './skills/index.ts'
import { trackAgentDrain } from './drain.ts'
import { recoverInterruptedChildren } from './lifecycle/recovery.ts'
import { restoreSuspendedQuestions, restoreSuspendedApprovals, cancelSuspendedQuestions } from './lifecycle/questions.ts'
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
import { topicWorkspace, memoryFilesystem, type MemoryScope } from './workspace/workspace.ts'
import { createMemoryTools, readMemoryIndex } from './workspace/memory.ts'
import { openStudio } from './studio/studio.ts'
import { createMaterialAccess, createMaterialTools } from './studio/tools.ts'
import { createExecutionTools } from './execution/tools.ts'
import { ALWAYS_ALLOWED_TOOLS, toolCategory } from './permissions.ts'
import { RESEARCH_DOMAINS } from './execution/domains.ts'
import { createIngestionTools, createImageToolResultProcessor, type IngestionWorkspaceResolver, type LibraryReader } from './ingestion/index.ts'
import { createInputProcessors, modelTools } from './agents/context.ts'
import { createSpecialistGroup } from './agents/catalog/group.ts'
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
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)) throw new Error('Invalid topic or task ID')
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
  const studio = openStudio(root)
  const memory = new Memory({ storage, options: {
    lastMessages: 100, semanticRecall: false, workingMemory: { enabled: false },
  } })
  const specialistHistory = createSpecialistHistory(storage, memory)
  const http = researchHttp(options.research?.fetch)
  // -------- 会话绑定：resourceId → 所在主题的共享工作区；只有已打开的受信会话能解析出主题 --------
  const bound = new Map<string, Workspace>()
  const topicWorkspaces = new Map<string, Promise<Workspace>>()
  function workspaceFor(topic: string) {
    const topicId = safeId(topic)
    let pending = topicWorkspaces.get(topicId)
    if (!pending) {
      pending = topicWorkspace(root, topicId)
      topicWorkspaces.set(topicId, pending)
      void pending.catch(() => { if (topicWorkspaces.get(topicId) === pending) topicWorkspaces.delete(topicId) })
    }
    return pending
  }
  const memoryFilesystems = new Map<string, ReturnType<typeof memoryFilesystem>>()
  function memoryFiles(topic: string, scope: MemoryScope) {
    const topicId = safeId(topic), key = scope === 'you' ? 'you' : `topic:${topicId}`
    let files = memoryFilesystems.get(key)
    if (!files) {
      files = memoryFilesystem(root, scope, topicId)
      memoryFilesystems.set(key, files)
      void files.catch(() => { if (memoryFilesystems.get(key) === files) memoryFilesystems.delete(key) })
    }
    return files
  }
  function ownerOf(context: { requestContext?: RequestContext } | undefined) {
    const owner = context?.requestContext?.get<'controller', AgentControllerRequestContext>('controller')
    if (!owner?.resourceId || !bound.has(owner.resourceId)) throw new Error('Session workspace is required')
    return owner.resourceId
  }
  const topicOf = (context: { requestContext?: RequestContext } | undefined) => ownerOf(context).split(':')[0]!
  const materials = createMaterialAccess(studio, topicOf)
  const readLibrary: LibraryReader = async (context, itemId) => {
    const { item, bytes } = await materials.open(context, itemId)
    return { bytes, title: item.title }
  }
  const materialTools = createMaterialTools(materials, studio, topicOf)
  const researchTools = { ...createPaperTools(http, options.research?.openAlexKey), ...createWebTools(http, options.research?.tavilyKey, materials.intake), extract_pdf: createPdfTool(http, materials.intake) }
  function skillsFor(topic: string) {
    const topicId = safeId(topic)
    return createSkillRegistry({ workspaceDir: join(root, 'topics', topicId, 'work'), roots: { userSkillsDir: join(root, 'skills') } })
  }
  const skillTools = createSkillTools(context => skillsFor(topicOf(context)))
  const memoryTools = createMemoryTools((context, scope) => memoryFiles(topicOf(context), scope))
  async function executionEnvironment(resourceId: string) {
    if (!bound.has(resourceId)) throw new Error('Session workspace is required')
    const session = await sessions.get(resourceId)
    if (!session || session.resolveToolApproval('run_code') === 'deny') throw new Error('当前会话已禁止运行代码，专家也不能绕过此限制')
    const skills = await skillsFor(resourceId.split(':')[0]!).list()
    return { allowedDomains: RESEARCH_DOMAINS, readRoots: skills.map(skill => skill.baseDir) }
  }
  const executionTools = createExecutionTools(async context => {
    const resourceId = ownerOf(context)
    const filesystem = bound.get(resourceId)?.filesystem
    if (!(filesystem instanceof LocalFilesystem)) throw new Error('Topic local filesystem is required')
    return { filesystem, ...await executionEnvironment(resourceId) }
  })
  const resolveWorkspace: IngestionWorkspaceResolver = context => bound.get(ownerOf(context))!
  const ingestionTools = createIngestionTools(resolveWorkspace, readLibrary)
  const imageProcessor = createImageToolResultProcessor(resolveWorkspace, readLibrary)
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
  const budget = createRunBudget({ onTimeout: resourceId => { const [topic, task] = resourceId.split(':'); return stopSession(topic!, task!) } })
  const historyTools = createHistoryTools(memory, (resourceId, threadId) => {
    if (resourceId !== threadId || !bound.has(resourceId)) throw new Error('当前会话未绑定')
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
  const specialists = createSpecialistGroup({ dataRoot: root, mastra: () => mastra, model: currentModel, memory, childUsage, familyBudget, specialistHistory,
    tools: { ...researchTools, ...skillTools, ...materialTools, ...memoryTools }, modelSettings: settingsFor, readLibrary,
    resolveExecutionEnvironment: executionEnvironment,
    resolveTaskFilesystem(resourceId) {
      const filesystem = bound.get(resourceId)?.filesystem
      if (!(filesystem instanceof LocalFilesystem)) throw new Error('Topic local filesystem is required')
      return filesystem
    },
  })
  const agent = new Agent({ id: 'research', name: 'Lumen', model: currentModel,
    instructions: async ({ requestContext }) => {
      const owner = requestContext.get<'controller', AgentControllerRequestContext>('controller')
      // -------- 两层记忆索引只是提示词旁路，各自有上限；读取失败如实告知模型，不中断研究运行 --------
      const index = async (scope: MemoryScope) => owner?.resourceId && bound.has(owner.resourceId)
        ? readMemoryIndex(await memoryFiles(owner.resourceId.split(':')[0]!, scope))
          .catch(error => `（MEMORY.md 暂时无法读取：${error instanceof Error ? error.message : String(error)}；需要时用 read_memory 检查。）`) : ''
      const [you, topic] = await Promise.all([index('you'), index('topic')])
      return [RESEARCH_PERSONA, userInstructions && `用户研究偏好：\n${userInstructions}`,
        you && `关于用户的记忆索引（scope=you，按需读取，不视为外部证据）：\n${you}`,
        topic && `这个主题的记忆索引（scope=topic，按需读取，不视为外部证据）：\n${topic}`].filter(Boolean).join('\n\n')
    },
    memory,
    tools: ({ requestContext }) => modelTools(settingsFor(requestContext), { ...researchTools, ...skillTools, ...memoryTools, ...materialTools, ...executionTools, ...ingestionTools, ...historyTools }),
    agents: async () => (await specialists.get()).agents,
    inputProcessors: ({ requestContext }) => [budget.inputProcessor, ...createInputProcessors(settingsFor(requestContext), imageProcessor), familyBudget.inputProcessor],
    outputProcessors: [familyBudget.outputProcessor, createEmptyActionProcessor()], maxProcessorRetries: 1,
    defaultOptions: { delegation: specialists.delegation },
    backgroundTasks: specialists.backgroundTasks,
  })
  const drain = trackAgentDrain(agent)
  const drainSpecialists = specialists.drain
  const controller = new AgentController({
    id: 'lumen', agent, storage, memory,
    workspace: ({ requestContext }) => {
      const context = requestContext.get<'controller', AgentControllerRequestContext>('controller')
      const workspace = context?.resourceId ? bound.get(context.resourceId) : undefined
      if (!workspace) throw new Error('Session workspace is required')
      return workspace
    },
    gateways: [models.gateway],
    modes: [{ id: 'research', name: '研究', defaultModelId: selectedModel, metadata: { default: true } }],
    disableBuiltinTools: ['subagent', 'submit_plan'],
    toolCategoryResolver: toolCategory,
  })
  const mastra = new Mastra({ agents: { research: agent }, agentControllers: { lumen: controller }, storage, gateways: { lumen: models.gateway }, observability: diagnostics.observability,
    backgroundTasks: { enabled: true, recoverStaleTasksOnStart: false, defaultRetries: { maxRetries: 0 }, backpressure: 'reject', globalConcurrency: 4, perAgentConcurrency: 2, defaultTimeoutMs: 300000 },
  })
  try { await controller.init() } catch (error) { await controller.destroy(); await mastra.shutdown(); await diagnostics.close(); await storage.close(); studio.close(); throw error }
  const sessions = new Map<string, ReturnType<typeof controller.createSession>>()
  let closing: Promise<void> | undefined

  function sessionIsBusy(session: Awaited<ReturnType<typeof controller.createSession>>) {
    const state = session.displayState.get()
    return state.isRunning || state.pendingApprovals.size > 0 || state.pendingSuspensions.size > 0 || session.run.getRunId() !== null
  }

  async function applyModelToSession(session: Awaited<ReturnType<typeof controller.createSession>>) {
    if (!selectedModel || sessionIsBusy(session) || session.model.get() === selectedModel) return
    await session.model.switch(selectedModel)
    sessionModelIds.set(session.identity.getResourceId(), selectedModel)
  }

  async function applyModelToIdleSessions() {
    for (const pending of sessions.values()) await applyModelToSession(await pending)
  }

  async function openSession(resourceId: string, topicId: string) {
    const workspace = await workspaceFor(topicId)
    bound.set(resourceId, workspace)
    try {
      await specialists.get()
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
      if (selectedModel && !usablePersistedModel) await session.model.switch(selectedModel)
      sessionModelIds.set(resourceId, session.model.get())
      const rules = session.permissions.getRules()
      for (const category of ['read', 'edit', 'execute'] as const) if (!rules.categories[category]) await session.permissions.setForCategory({ category, policy: 'allow' })
      for (const toolName of ALWAYS_ALLOWED_TOOLS) {
        if (!rules.tools[toolName]) await session.permissions.setForTool({ toolName, policy: 'allow' })
      }
      await restoreSuspendedQuestions({ session, agent })
      await restoreSuspendedApprovals({ session, agent })
      return session
    }
    catch (error) {
      sessions.delete(resourceId)
      sessionModelIds.delete(resourceId)
      bound.delete(resourceId)
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

  async function getSession(topic: string, task: string) {
    if (closing) throw new Error('Application is closed')
    const topicId = safeId(topic), taskId = safeId(task)
    const resourceId = `${topicId}:${taskId}`
    let pending = sessions.get(resourceId)
    if (!pending) {
      pending = openSession(resourceId, topicId)
      sessions.set(resourceId, pending)
    }
    const session = await pending
    await applyModelToSession(session)
    return session
  }

  async function shutdown() {
    const pending = await Promise.allSettled(sessions.values())
    const active = pending.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
    for (const session of active) session.abort({ localOnly: true, keepParked: true })
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
    for (const resourceId of sessions.keys()) await controller.deleteSession({ sessionId: resourceId })
    await controller.destroy()
    await mastra.shutdown({ drainTimeout: 10000 })
    await specialists.close()
    await diagnostics.close()
    // -------- 主题工作区被多段对话共用，只在这里销毁一次 --------
    for (const pending of await Promise.allSettled(topicWorkspaces.values())) if (pending.status === 'fulfilled') await pending.value.destroy()
    for (const pending of await Promise.allSettled(memoryFilesystems.values())) if (pending.status === 'fulfilled') await pending.value.destroy()
    await storage.close()
    studio.close()
  }

  return {
    controller, mastra, storage, memory, root, studio, skillsFor, workspaceFor, memoryFiles, agent, diagnostics, specialists, childUsage, familyBudget, specialistHistory,
    hasModel: () => !!selectedModel,
    async liveSessionStates() {
      const states = new Map<string, { running: boolean; waiting: boolean }>()
      for (const [resourceId, pending] of sessions) {
        const state = (await pending).displayState.get()
        states.set(resourceId, { running: state.isRunning, waiting: state.pendingApprovals.size > 0 || state.pendingSuspensions.size > 0 })
      }
      const children = await mastra.backgroundTaskManager?.listTasks({ status: ['pending', 'running', 'suspended'], perPage: 10000 })
      for (const child of children?.tasks ?? []) {
        if (!child.resourceId) continue
        const state = states.get(child.resourceId) ?? { running: false, waiting: false }
        if (child.status === 'suspended') state.waiting = true
        else state.running = true
        states.set(child.resourceId, state)
      }
      // -------- 未打开会话的持久挂起同样挡配置写闸(isBusy)，必须在目录里可见，否则界面无从解释 409 --------
      for (const run of (await agent.listSuspendedRuns()).runs) {
        if (!run.resourceId) continue
        states.set(run.resourceId, { running: false, ...states.get(run.resourceId), waiting: true })
      }
      return states
    },
    async isBusy() {
      for (const pending of sessions.values()) {
        const session = await pending
        const state = session.displayState.get()
        if (state.isRunning || state.pendingApprovals.size || state.pendingSuspensions.size) return true
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

  async function stopSession(topic: string, task: string) {
    const resourceId = `${safeId(topic)}:${safeId(task)}`
    const session = await getSession(topic, task)
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

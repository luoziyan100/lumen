/**
 * [INPUT]: 应用注入的模型/Memory/工具/用量派生器、受信执行环境解析器、静态角色及父任务文件系统
 * [OUTPUT]: createSpecialists：角色映射、隔离父历史的委派配置、预算准入与同专家继续、明确未完成回报和关闭入口
 * [POS]: 专家组合辅助；不复制调度/审批，真实步骤用量交原生存储派生器，执行工具绑定自身目录
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { Agent, type AgentConfig, type ToolsInput, type DelegationConfig } from '@mastra/core/agent'
import type { AgentBackgroundConfig } from '@mastra/core/background-tasks'
import type { RequestContext } from '@mastra/core/request-context'
import { LocalFilesystem } from '@mastra/core/workspace'
import { createHash } from 'node:crypto'
import { createExecutionTools } from '../execution/tools.ts'
import type { ExecutionEnvironment } from '../execution/process.ts'
import { SPECIALIST_ROLES, type SpecialistId, type SpecialistRole } from './roles.ts'
import { createSpecialistWorkspaces, specialistDirectory, type TaskFilesystemResolver } from './workspaces.ts'
import { createTaskSourceTools } from './sources.ts'
import { createIngestionTools, createImageToolResultProcessor } from '../ingestion/index.ts'
import { createInputProcessors, modelTools, type ContextSettings } from './context.ts'
import { createEmptyActionProcessor } from './guards/empty-action.ts'
import { specialistConclusion, SPECIALIST_MAX_STEPS } from './guards/conclusion.ts'
import type { SpecialistHistory } from './resume/index.ts'
import type { FamilyBudget } from './budget/index.ts'
import type { ChildUsage } from './usage/children.ts'

export interface SpecialistOptions {
  model: AgentConfig['model']
  memory: AgentConfig['memory']
  tools: ToolsInput
  resolveTaskFilesystem: TaskFilesystemResolver
  resolveExecutionEnvironment?: (resourceId: string) => Omit<ExecutionEnvironment, 'filesystem'> | Promise<Omit<ExecutionEnvironment, 'filesystem'>>
  modelSettings?: (requestContext?: RequestContext) => ContextSettings | undefined
  roles?: readonly SpecialistRole[]
  projectId?: string
  specialistHistory?: SpecialistHistory
  familyBudget?: FamilyBudget
  childUsage?: ChildUsage
}

export function createSpecialists(options: SpecialistOptions) {
  const workspaces = createSpecialistWorkspaces(options.resolveTaskFilesystem)
  const agents = {} as Record<SpecialistId, Agent>
  const registeredAgents: Record<string, Agent> = {}
  const roles = options.roles ?? SPECIALIST_ROLES
  const byAgentId = new Map<string, SpecialistRole>()
  const parents = new Map<string, string>()
  for (const role of roles) {
    const id = options.projectId ? `${role.id}--${createHash('sha256').update(JSON.stringify([options.projectId, role])).digest('hex').slice(0, 20)}` : role.id
    const select = (tools: ToolsInput) => Object.fromEntries(Object.entries(tools).filter(([name]) => role.tools.includes(name)))
    byAgentId.set(id, role)
    const tools: ToolsInput = Object.fromEntries(role.tools.filter(name => options.tools[name]).map(name => [name, options.tools[name]!]))
    if (role.writable) Object.assign(tools, select(createTaskSourceTools(context => {
      if (!context?.requestContext) throw new Error('Specialist request context is required')
      return workspaces.parent(context.requestContext)
    })))
    if (role.execute) Object.assign(tools, select(createExecutionTools(async context => {
      if (!context?.requestContext) throw new Error('Specialist request context is required')
      const workspace = await workspaces.resolve(context.requestContext, role)
      if (!(workspace.filesystem instanceof LocalFilesystem)) throw new Error('Specialist local filesystem is required')
      const source = await workspaces.parent(context.requestContext)
      const owner = context.requestContext.get('controller') as { resourceId: string }
      const execution = await options.resolveExecutionEnvironment?.(owner.resourceId)
      return { ...execution, filesystem: workspace.filesystem, readRoots: [...(execution?.readRoots ?? []), source.basePath] }
    })))
    const ingestionWorkspace = (context: { requestContext?: RequestContext } | undefined) => {
      if (!context?.requestContext) throw new Error('Specialist request context is required')
      return workspaces.resolve(context.requestContext, role)
    }
    Object.assign(tools, select(createIngestionTools(ingestionWorkspace)))
    const images = role.tools.includes('look_at_image') ? createImageToolResultProcessor(ingestionWorkspace) : undefined
    agents[role.id] = new Agent({ id, name: role.name, description: `${role.description} 委派 prompt 必须包含本次目标、必要材料路径和约束；其他专家证据通过 contextFromRefs 显式传入，不继承父对话。用户通过专家继续入口指定原专家后，必须委派相同角色，不能新建冒充继续；历史工具只是过去事实，禁止自动重放副作用。`, model: options.model, memory: options.memory,
      instructions: `${role.instructions}\n你只向主研究者回报；用户决策、最终任务清单、共享记忆与技能安装由主研究者负责。不委派下一层专家。最后一步会关闭工具，请总结已经读取的证据及尚未解决的缺口，不能把工具执行本身当作任务完成。`,
      tools: ({ requestContext }) => modelTools(options.modelSettings?.(requestContext), tools),
      defaultOptions: { maxSteps: role.maxSteps }, backgroundTasks: { disabled: true },
      inputProcessors: ({ requestContext }) => [...(options.specialistHistory ? [options.specialistHistory.capture] : []), ...createInputProcessors(options.modelSettings?.(requestContext), images), specialistConclusion, ...(options.familyBudget ? [options.familyBudget.inputProcessor] : [])],
      outputProcessors: [...(options.familyBudget ? [options.familyBudget.outputProcessor] : []), ...(options.childUsage ? [options.childUsage.outputProcessor] : []), createEmptyActionProcessor()], maxProcessorRetries: 1,
      workspace: ({ requestContext }) => workspaces.resolve(requestContext, role),
    })
    registeredAgents[id] = agents[role.id]!
  }
  const delegation: DelegationConfig = {
    hookErrorStrategy: 'throw', enableResultReferences: true,
    // -------- 任务与证据从 prompt / contextFromRefs 显式传递，父工具轨迹不冒充专家历史 --------
    messageFilter: context => options.specialistHistory?.messages(context) ?? [],
    async onDelegationStart(context) {
      const role = byAgentId.get(context.primitiveId)
      if (!role || context.primitiveType !== 'agent') return { proceed: false, rejectionReason: 'Unknown specialist role' }
      const owner = context.requestContext.get('controller') as { resourceId?: string } | undefined
      if (options.projectId && owner?.resourceId?.split(':')[0] !== options.projectId) throw new Error('Specialist project does not match its parent task')
      await options.familyBudget?.admit(context)
      const continued = await options.specialistHistory?.start(context, role)
      const directory = await workspaces.bind(context, role, continued?.directory)
      parents.set(`${context.runId}:${context.toolCallId}`, owner!.resourceId!)
      options.childUsage?.bind(context)
      const scope = role.writable
        ? `你的读写工作区是独立目录。主任务材料使用 list_task_files/read_task_file/copy_task_file。产物在父任务的 ${directory}/；完成时只报告实际写入的文件，禁止修改父任务原件或其他专家产物。`
        : '你的工作区是主任务材料的只读视图。优先读取已有提取文本；extract_pdf 不得设置 save_as。返回证据与建议，不修改文件。'
      const maxSteps = Math.min(context.params.maxSteps ?? role.maxSteps, role.maxSteps)
      context.requestContext.set(SPECIALIST_MAX_STEPS, maxSteps)
      return { modifiedPrompt: `${context.prompt}\n\n${scope}`, modifiedMaxSteps: maxSteps }
    },
    async onDelegationComplete(context) {
      const key = `${context.runId}:${context.toolCallId}`, parent = parents.get(key)
      parents.delete(key)
      if (parent) await options.familyBudget?.finish(parent, context.runId, context.toolCallId)
      const record = await options.specialistHistory?.complete(context)
      const identity = record ? `\n\n专家继续ID：${record.id}（通过专家继续入口继续同一角色）；状态：${record.status}` : ''
      const role = byAgentId.get(context.primitiveId)
      if (!context.success) return identity ? { resultText: `[专家执行失败，不能视为已完成。${context.error?.message ?? ''}]${identity}` } : undefined
      const output = context.result.text?.trim()
      if (!output || context.result.finishReason === 'content-filter' || context.result.finishReason === 'length') {
        const tools = context.result.subAgentToolResults?.map(result => result.toolName).filter(Boolean).join('、') || '无'
        const directory = role?.writable ? `；独立工作目录：${(record?.directory ?? specialistDirectory(role.id, context.runId, context.toolCallId))}/` : ''
        const reason = context.result.finishReason ?? 'unknown'
        const partial = output ? `\n未完成片段：${output}` : ''
        return { resultText: `[专家未完成；终止原因：${reason}。${output ? '以下仅为未完成片段' : '未返回可见总结'}，不能视为已核对完成。已执行工具：${tools}${directory}]${partial}${identity}` }
      }
      const directory = role?.writable ? `\n\n本次独立工作目录：${record?.directory ?? specialistDirectory(role.id, context.runId, context.toolCallId)}/` : ''
      if (identity || directory) return { resultText: `${context.result.text}${directory}${identity}` }
    },
  }
  const backgroundTasks: AgentBackgroundConfig = { tools: Object.fromEntries(roles.map(role => [role.id,
    role.execute || !SPECIALIST_ROLES.some(builtin => builtin.id === role.id) ? false : { enabled: true, defaultDisposition: 'foreground' as const, timeoutMs: 300_000 },
  ])) }
  return { agents, registeredAgents, delegation, backgroundTasks, accepts: (id: string) => byAgentId.has(id), close: workspaces.close }
}

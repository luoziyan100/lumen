/**
 * [INPUT]: 显式项目配置根、专家工厂、Mastra 注册入口与受信 Controller 身份
 * [OUTPUT]: createProjectSpecialists：按项目加载角色快照、路由委派及上下文过滤、排空与空闲失效
 * [POS]: 配置与原生 Agent 的组合边界；不持有任务状态或另建调度器
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { join } from 'node:path'
import type { Mastra } from '@mastra/core/mastra'
import type { DelegationConfig } from '@mastra/core/agent'
import type { AgentBackgroundConfig, AgentBackgroundToolConfig } from '@mastra/core/background-tasks'
import { createSpecialists, type SpecialistOptions } from '../specialists.ts'
import { SPECIALIST_ROLES } from '../roles.ts'
import { readSourceBinding } from '../../workspace/source.ts'
import { trackAgentDrain } from '../../drain.ts'
import { loadAgentCatalog } from './registry.ts'
import { setAgentDisabled } from './toggles.ts'

interface Options extends Omit<SpecialistOptions, 'roles' | 'projectId'> { dataRoot: string; mastra: () => Mastra }

export function createProjectSpecialists(options: Options) {
  const groups = new Map<string, ReturnType<typeof load>>()
  const togglesPath = join(options.dataRoot, 'subagent-toggles.json')
  const backgroundTools: Record<string, AgentBackgroundToolConfig> = Object.fromEntries(SPECIALIST_ROLES.map(role => [role.id,
    role.execute ? false : { enabled: true, defaultDisposition: 'foreground', timeoutMs: 300_000 },
  ]))
  const backgroundTasks: AgentBackgroundConfig = { tools: backgroundTools }

  async function load(projectId: string) {
    const projectRoot = join(options.dataRoot, 'projects', projectId)
    const source = await readSourceBinding(projectRoot)
    const catalog = await loadAgentCatalog({ roots: { userAgentsDir: join(options.dataRoot, 'subagents'),
      workspaceAgentsDir: join(projectRoot, 'subagents'), projectAgentsDir: source.path ? join(source.path, '.lumen', 'subagents') : null,
    }, togglesPath })
    const group = createSpecialists({ ...options, projectId, roles: catalog.roles })
    for (const role of catalog.roles) if (!SPECIALIST_ROLES.some(builtin => builtin.id === role.id)) backgroundTools[role.id] = false
    const drains = Object.values(group.agents).map(trackAgentDrain)
    for (const agent of Object.values(group.registeredAgents)) options.mastra().addAgent(agent)
    return { ...group, catalog, drain: (resourceId?: string) => Promise.all(drains.map(drain => drain(resourceId))) }
  }

  function get(projectId: string) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(projectId)) throw new Error('Invalid project ID')
    let group = groups.get(projectId)
    if (!group) {
      group = load(projectId); groups.set(projectId, group)
      const pending = group
      void pending.catch(() => { if (groups.get(projectId) === pending) groups.delete(projectId) })
    }
    return group
  }

  async function byId(id: string) {
    const loaded = await Promise.all(groups.values())
    const group = loaded.find(group => group.accepts(id))
    if (!group) throw new Error('Unknown specialist role')
    return group
  }
  const delegation: DelegationConfig = { hookErrorStrategy: 'throw', enableResultReferences: true,
    messageFilter: async context => (await byId(context.primitiveId)).delegation.messageFilter!(context),
    onDelegationStart: async context => (await byId(context.primitiveId)).delegation.onDelegationStart!(context),
    onDelegationComplete: async context => (await byId(context.primitiveId)).delegation.onDelegationComplete!(context),
  }

  async function invalidate(projectId?: string) {
    const keys = projectId ? [projectId] : [...groups.keys()]
    for (const key of keys) {
      const pending = groups.get(key)
      if (!pending) continue
      groups.delete(key)
      const group = await pending
      await group.drain()
      for (const id of Object.keys(group.registeredAgents)) options.mastra().removeAgent(id)
      await group.close()
    }
  }

  return { get, delegation, backgroundTasks, invalidate,
    async setDisabled(name: string, disabled: boolean) { await setAgentDisabled(togglesPath, name, disabled); await invalidate() },
    async drain(resourceId?: string) { await Promise.all([...groups.values()].map(async pending => (await pending).drain(resourceId))) },
    close: () => invalidate(),
  }
}

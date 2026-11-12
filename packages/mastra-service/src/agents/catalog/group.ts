/**
 * [INPUT]: 显式数据根下的用户角色目录与启停文件、专家工厂、Mastra 注册入口
 * [OUTPUT]: createSpecialistGroup：全局唯一一组专家的加载快照、委派钩子转发、排空与空闲重载
 * [POS]: 配置与原生 Agent 的组合边界；专家不分主题，主题边界由受信会话身份和工具解析承担。不持有任务状态或另建调度器
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { join } from 'node:path'
import type { Mastra } from '@mastra/core/mastra'
import type { DelegationConfig } from '@mastra/core/agent'
import type { AgentBackgroundConfig, AgentBackgroundToolConfig } from '@mastra/core/background-tasks'
import { createSpecialists, type SpecialistOptions } from '../specialists.ts'
import { SPECIALIST_ROLES } from '../roles.ts'
import { trackAgentDrain } from '../../drain.ts'
import { loadAgentCatalog } from './registry.ts'
import { setAgentDisabled } from './toggles.ts'

interface Options extends Omit<SpecialistOptions, 'roles' | 'versioned'> { dataRoot: string; mastra: () => Mastra }

export function createSpecialistGroup(options: Options) {
  let current: ReturnType<typeof load> | undefined
  const togglesPath = join(options.dataRoot, 'subagent-toggles.json')
  const backgroundTools: Record<string, AgentBackgroundToolConfig> = Object.fromEntries(SPECIALIST_ROLES.map(role => [role.id,
    role.execute ? false : { enabled: true, defaultDisposition: 'foreground', timeoutMs: 300_000 },
  ]))
  const backgroundTasks: AgentBackgroundConfig = { tools: backgroundTools }

  async function load() {
    const catalog = await loadAgentCatalog({ roots: { userAgentsDir: join(options.dataRoot, 'subagents') }, togglesPath })
    const group = createSpecialists({ ...options, versioned: true, roles: catalog.roles })
    for (const role of catalog.roles) if (!SPECIALIST_ROLES.some(builtin => builtin.id === role.id)) backgroundTools[role.id] = false
    const drains = Object.values(group.agents).map(trackAgentDrain)
    for (const agent of Object.values(group.registeredAgents)) options.mastra().addAgent(agent)
    return { ...group, catalog, drain: (resourceId?: string) => Promise.all(drains.map(drain => drain(resourceId))) }
  }

  function get() {
    if (!current) {
      const pending = current = load()
      void pending.catch(() => { if (current === pending) current = undefined })
    }
    return current
  }

  async function accepting(id: string) {
    const group = await get()
    if (!group.accepts(id)) throw new Error('Unknown specialist role')
    return group
  }
  const delegation: DelegationConfig = { hookErrorStrategy: 'throw', enableResultReferences: true,
    messageFilter: async context => (await accepting(context.primitiveId)).delegation.messageFilter!(context),
    onDelegationStart: async context => (await accepting(context.primitiveId)).delegation.onDelegationStart!(context),
    onDelegationComplete: async context => (await accepting(context.primitiveId)).delegation.onDelegationComplete!(context),
  }

  /** 只在空闲时调用（配置写闸保证）：排空、注销旧注册，下次使用时按新定义重载。 */
  async function invalidate() {
    const pending = current
    if (!pending) return
    current = undefined
    const group = await pending
    await group.drain()
    for (const id of Object.keys(group.registeredAgents)) options.mastra().removeAgent(id)
    await group.close()
  }

  return { get, delegation, backgroundTasks, invalidate,
    async setDisabled(name: string, disabled: boolean) { await setAgentDisabled(togglesPath, name, disabled); await invalidate() },
    async drain(resourceId?: string) { if (current) await (await current).drain(resourceId) },
    close: invalidate,
  }
}

export type SpecialistGroup = ReturnType<typeof createSpecialistGroup>

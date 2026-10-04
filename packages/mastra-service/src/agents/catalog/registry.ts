/**
 * [INPUT]: 显式角色根、全局启停文件、当前内建专家和能力收窄规则
 * [OUTPUT]: loadAgentCatalog：项目静态快照；project > workspace > builtin > user > plugin
 * [POS]: 加载只读配置；配置错误保留诊断，损坏的开关文件阻止悄悄重新启用角色
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { SPECIALIST_ROLES } from '../roles.ts'
import { discoverAgentFiles } from './discovery.ts'
import { constrainAgent } from './policy.ts'
import { readAgentToggles } from './toggles.ts'
import type { AgentCatalog, AgentDiagnostic, AgentLayer, AgentRoots, CatalogEntry } from './types.ts'

const priority: Record<AgentLayer, number> = { plugin: 1, user: 2, builtin: 3, workspace: 4, project: 5 }

export async function loadAgentCatalog(options: { roots: AgentRoots; togglesPath: string }): Promise<AgentCatalog> {
  const toggles = await readAgentToggles(options.togglesPath)
  const entries = new Map<string, CatalogEntry>(SPECIALIST_ROLES.map(role => [role.id, { role, layer: 'builtin', sourcePath: null, disabled: false }]))
  const diagnostics: AgentDiagnostic[] = []
  const roots: Array<[AgentLayer, string | null | undefined]> = [['plugin', options.roots.pluginAgentsDir], ['user', options.roots.userAgentsDir],
    ['workspace', options.roots.workspaceAgentsDir], ['project', options.roots.projectAgentsDir]]
  for (const [layer, root] of roots) {
    const discovered = await discoverAgentFiles(root, layer)
    diagnostics.push(...discovered.diagnostics)
    for (const { definition, sourcePath } of discovered.entries) {
      const previous = entries.get(definition.name)
      if (previous && priority[previous.layer] > priority[layer]) continue
      if (previous?.layer === layer) diagnostics.push({ sourcePath, message: `同层重复角色 ${definition.name}，按文件名排序后覆盖` })
      const { role, notes } = constrainAgent(definition)
      diagnostics.push(...notes.map(message => ({ sourcePath, message })))
      entries.set(role.id, { role, layer, sourcePath, disabled: definition.disabled })
    }
  }
  const merged = [...entries.values()].sort((a, b) => a.role.id.localeCompare(b.role.id)).map(entry => ({ ...entry,
    disabled: Object.hasOwn(toggles, entry.role.id) ? toggles[entry.role.id]! : entry.disabled,
  }))
  return { entries: merged, roles: merged.filter(entry => !entry.disabled).map(entry => entry.role), diagnostics }
}

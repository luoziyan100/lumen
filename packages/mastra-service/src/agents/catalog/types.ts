/**
 * [INPUT]: 专家能力合同；不引用旧运行时
 * [OUTPUT]: 角色配置、层级、发现根、诊断和静态目录快照类型
 * [POS]: 自定义角色配置边界，配置身份和框架运行身份分离
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { BuiltinSpecialistId, SpecialistRole } from '../roles.ts'

export type AgentLayer = 'plugin' | 'user' | 'builtin' | 'workspace' | 'project'
export type AgentCapability = 'read-only' | 'read-write' | 'execute' | 'all'
export interface AgentRoots { userAgentsDir: string; workspaceAgentsDir: string; projectAgentsDir?: string | null; pluginAgentsDir?: string | null }
export interface AgentDefinition {
  name: string; description: string; instructions: string
  capability: AgentCapability; preset: BuiltinSpecialistId; maxSteps: number
  toolNames?: string[]; disabled: boolean; allowNested: boolean; isolation: 'none' | 'worktree'
}
export interface AgentDiagnostic { sourcePath: string | null; message: string }
export interface CatalogEntry { role: SpecialistRole; layer: AgentLayer; sourcePath: string | null; disabled: boolean }
export interface AgentCatalog { entries: CatalogEntry[]; roles: SpecialistRole[]; diagnostics: AgentDiagnostic[] }
export type AgentToggles = Record<string, boolean>

/**
 * [INPUT]: core 的 Tool/RoleDef/ModelPort；subagent/resolution builtins
 * [OUTPUT]: WORKER_ROLE_SPECS / buildRoles —— 兼容旧 spawn(role=searcher|…)；真源迁 builtin definitions
 * [POS]: §6 Agent Graph。T1 起角色工具表由 buildChildTools 裁剪，禁止双真源漂移
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { Tool } from '../core/tool.ts'
import type { RoleDef } from '../core/spawn.ts'
import type { ModelPort } from '../core/model-port.ts'
import { buildChildTools, resolveAgentDefinition } from '../subagent/resolution.ts'

/** @deprecated 兼容测试与旧 prompt；新代码用 resolveAgentDefinition */
export interface RoleSpec {
  name: string
  systemPrompt: string
  allowedTools: string[]
  maxSteps: number
}

/** 兼容导出：从 builtin 投影，不再手写第二份工具表 */
export const WORKER_ROLE_SPECS: RoleSpec[] = (['searcher', 'reader', 'verifier'] as const).map((name) => {
  const d = resolveAgentDefinition(name)!
  return {
    name: d.name,
    systemPrompt: d.systemPrompt,
    allowedTools: [], // 由 buildRoles → buildChildTools 决定
    maxSteps: d.maxSteps,
  }
})

export function buildRoles(allTools: Tool[], options: { model?: ModelPort; maxDepth?: number } = {}): Record<string, RoleDef> {
  const maxDepth = options.maxDepth ?? 3
  const roles: Record<string, RoleDef> = {}
  for (const name of ['searcher', 'reader', 'verifier', 'explore', 'plan', 'general-purpose'] as const) {
    const def = resolveAgentDefinition(name)
    if (!def) continue
    const { tools } = buildChildTools(allTools, def, null, 'all')
    roles[name] = {
      systemPrompt: def.systemPrompt,
      tools,
      limits: { maxSteps: def.maxSteps, maxDepth },
      ...(options.model ? { model: options.model } : {}),
    }
  }
  return roles
}

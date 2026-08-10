/**
 * [INPUT]: builtins + discoverAgents + toggles
 * [OUTPUT]: mergeAgentRegistry / resolveFromRegistry / listCallable —— visible==callable
 * [POS]: subagent T8；优先级 project > workspace > builtin > user > plugin
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import * as path from 'node:path'
import { homedir } from 'node:os'
import { BUILTIN_DEFINITIONS, type AgentDefinition } from './resolution.ts'
import {
  discoverAgents,
  type AgentDiscoverRoots,
  type AgentLayer,
  type DiscoveredAgent,
} from './discovery.ts'

/** 层优先级：数字越大越高（同名覆盖） */
const LAYER_RANK: Record<AgentLayer, number> = {
  plugin: 1,
  user: 2,
  builtin: 3,
  workspace: 4,
  project: 5,
}

export type AgentToggleMap = Record<string, boolean>

export function defaultTogglesPath(home = homedir()): string {
  return path.join(home, '.lumen', 'subagent-toggles.json')
}

export function loadToggles(filePath: string): AgentToggleMap {
  try {
    const raw = readFileSync(filePath, 'utf8')
    const j = JSON.parse(raw) as unknown
    if (!j || typeof j !== 'object') return {}
    const out: AgentToggleMap = {}
    for (const [k, v] of Object.entries(j as Record<string, unknown>)) {
      if (typeof v === 'boolean') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

export function saveToggles(filePath: string, toggles: AgentToggleMap): void {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(toggles, null, 2) + '\n', 'utf8')
}

/**
 * 合并 builtin + 磁盘发现 + toggle。
 * toggle[name]=true → disabled；false → 强制启用（覆盖 frontmatter disabled）。
 * 缺省：沿用 def.disabled（builtin 恒 false）。
 */
export function mergeAgentRegistry(
  roots: AgentDiscoverRoots | null,
  toggles: AgentToggleMap = {},
  builtins: readonly AgentDefinition[] = BUILTIN_DEFINITIONS,
): Map<string, DiscoveredAgent> {
  const byName = new Map<string, DiscoveredAgent>()

  for (const b of builtins) {
    byName.set(b.name, {
      ...b,
      layer: 'builtin',
      sourcePath: null,
      disabled: false,
    })
  }

  if (roots) {
    for (const d of discoverAgents(roots)) {
      const prev = byName.get(d.name)
      if (!prev || LAYER_RANK[d.layer] >= LAYER_RANK[prev.layer]) {
        byName.set(d.name, d)
      }
    }
  }

  // 应用 toggle：true=禁用，false=启用
  for (const [name, agent] of byName) {
    if (name in toggles) {
      byName.set(name, { ...agent, disabled: toggles[name] === true })
    }
  }

  return byName
}

/** visible == callable：未 disabled 才可 spawn / 列表展示 */
export function listCallableAgents(registry: Map<string, DiscoveredAgent>): DiscoveredAgent[] {
  return [...registry.values()]
    .filter((a) => !a.disabled)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function listAllAgents(registry: Map<string, DiscoveredAgent>): DiscoveredAgent[] {
  return [...registry.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function resolveFromRegistry(
  registry: Map<string, DiscoveredAgent>,
  name: string,
): DiscoveredAgent | null {
  const a = registry.get(name)
  if (!a || a.disabled) return null
  return a
}

/** 设置 toggle 并写盘；返回更新后的 map */
export function setAgentToggle(
  togglesPath: string,
  name: string,
  disabled: boolean,
): AgentToggleMap {
  const t = loadToggles(togglesPath)
  t[name] = disabled
  saveToggles(togglesPath, t)
  return t
}

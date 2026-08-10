/**
 * [INPUT]: node:fs；AgentDefinition 形状
 * [OUTPUT]: discoverAgents / parseAgentMarkdown / roots —— project>builtin>user 发现
 * [POS]: subagent T8；与 skills 同构分层，路径互不混用
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import * as path from 'node:path'
import type { AgentDefinition } from './resolution.ts'
import type { CapabilityMode, IsolationMode } from './types.ts'

export type AgentLayer = 'plugin' | 'user' | 'builtin' | 'workspace' | 'project'

export interface DiscoveredAgent extends AgentDefinition {
  layer: AgentLayer
  /** 磁盘来源；builtin 为 null */
  sourcePath: string | null
  /** frontmatter disabled 或 toggle 覆盖后的最终不可用 */
  disabled: boolean
}

export interface AgentDiscoverRoots {
  /** ~/.lumen/subagents */
  userAgentsDir: string
  /** workspaces/<project>/subagents */
  workspaceAgentsDir: string
  /** <source>/.lumen/subagents */
  projectAgentsDir: string | null
  /** 预留插件目录 */
  pluginAgentsDir?: string | null
}

const NAME_RE = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,63}$/i
const BODY_MAX = 80_000

export function defaultUserAgentsDir(home = homedir()): string {
  return path.join(home, '.lumen', 'subagents')
}

export function workspaceAgentsDir(workspacesDir: string, projectId: string): string {
  return path.join(workspacesDir, projectId, 'subagents')
}

export function projectAgentsDir(sourcePath: string | null | undefined): string | null {
  if (!sourcePath?.trim()) return null
  return path.join(sourcePath.trim(), '.lumen', 'subagents')
}

export function buildAgentDiscoverRoots(opts: {
  workspacesDir: string
  projectId: string
  sourcePath?: string | null
  userAgentsDir?: string
  pluginAgentsDir?: string | null
}): AgentDiscoverRoots {
  return {
    userAgentsDir: opts.userAgentsDir ?? defaultUserAgentsDir(),
    workspaceAgentsDir: workspaceAgentsDir(opts.workspacesDir, opts.projectId),
    projectAgentsDir: projectAgentsDir(opts.sourcePath),
    pluginAgentsDir: opts.pluginAgentsDir ?? null,
  }
}

function stripQuotes(s: string): string {
  const t = s.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1)
  }
  return t
}

function parseBool(v: string): boolean {
  const s = stripQuotes(v).toLowerCase()
  return s === 'true' || s === 'yes' || s === '1'
}

function parseCapability(v: string): CapabilityMode | null {
  const s = stripQuotes(v)
  if (s === 'read-only' || s === 'read-write' || s === 'execute' || s === 'all') return s
  return null
}

function parseIsolation(v: string): IsolationMode | null {
  const s = stripQuotes(v)
  if (s === 'none' || s === 'worktree') return s
  return null
}

function parsePreset(v: string): AgentDefinition['kindPreset'] | null {
  const s = stripQuotes(v)
  const allowed: AgentDefinition['kindPreset'][] = [
    'explore', 'plan', 'general-purpose', 'searcher', 'reader', 'verifier',
  ]
  return (allowed as string[]).includes(s) ? (s as AgentDefinition['kindPreset']) : null
}

function normalizeName(raw: string): string | null {
  const n = raw.trim().toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-')
  if (!NAME_RE.test(n)) return null
  return n
}

/** 极简 frontmatter + body */
export function parseAgentMarkdown(
  raw: string,
  opts: { fileBase: string },
): { def: Omit<DiscoveredAgent, 'layer' | 'sourcePath'> } | { error: string } {
  const text = raw.replace(/^\uFEFF/, '')
  let fm: Record<string, string> = {}
  let body = text
  if (text.startsWith('---')) {
    const end = text.indexOf('\n---', 3)
    if (end >= 0) {
      const block = text.slice(3, end).replace(/^\r?\n/, '')
      body = text.slice(end + 4).replace(/^\r?\n/, '')
      for (const line of block.split(/\r?\n/)) {
        const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/)
        if (!m) continue
        const key = m[1]!.toLowerCase().replace(/_/g, '-')
        fm[key] = stripQuotes(m[2] ?? '')
      }
    }
  }
  if (body.length > BODY_MAX) body = body.slice(0, BODY_MAX)

  const name = normalizeName(fm.name ?? opts.fileBase)
  if (!name) return { error: `invalid agent name: ${fm.name ?? opts.fileBase}` }

  const description = (fm.description ?? name).slice(0, 1024)
  const defaultCapability = parseCapability(fm['default-capability'] ?? fm.capability ?? '') ?? 'read-only'
  const isolationDefault = parseIsolation(fm.isolation ?? '') ?? 'none'
  const allowNested = fm['allow-nested'] != null ? parseBool(fm['allow-nested']) : false
  const maxSteps = Math.max(1, Math.min(100, Number(fm['max-steps'] ?? fm.maxsteps ?? 12) || 12))
  const kindPreset = parsePreset(fm['kind-preset'] ?? fm.preset ?? '') ?? 'explore'
  const disabled = fm.disabled != null ? parseBool(fm.disabled) : false
  let toolNames: string[] | undefined
  if (fm.tools) {
    toolNames = fm.tools.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)
  }

  const systemPrompt = body.trim() || `你是 ${name} 子 agent。${description}`

  return {
    def: {
      name,
      description,
      defaultCapability,
      isolationDefault,
      allowNested,
      maxSteps,
      kindPreset,
      systemPrompt,
      ...(toolNames?.length ? { toolNames } : {}),
      disabled,
    },
  }
}

function listAgentFiles(root: string): string[] {
  try {
    if (!statSync(root).isDirectory()) return []
  } catch {
    return []
  }
  const out: string[] = []
  for (const ent of readdirSync(root, { withFileTypes: true })) {
    if (ent.name.startsWith('.')) continue
    const full = path.join(root, ent.name)
    if (ent.isFile() && /\.md$/i.test(ent.name)) {
      out.push(full)
      continue
    }
    if (ent.isDirectory()) {
      const agentMd = path.join(full, 'AGENT.md')
      try {
        if (statSync(agentMd).isFile()) out.push(agentMd)
      } catch { /* skip */ }
    }
  }
  return out
}

function loadFromRoot(root: string | null | undefined, layer: AgentLayer): DiscoveredAgent[] {
  if (!root) return []
  const agents: DiscoveredAgent[] = []
  for (const file of listAgentFiles(root)) {
    let raw: string
    try {
      raw = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const base = path.basename(file, path.extname(file))
    const fileBase = base === 'AGENT' ? path.basename(path.dirname(file)) : base
    const parsed = parseAgentMarkdown(raw, { fileBase })
    if ('error' in parsed) continue
    agents.push({
      ...parsed.def,
      layer,
      sourcePath: file,
    })
  }
  return agents
}

/**
 * 扫描磁盘自定义 agents（不含 builtin）。
 * 合并优先级由 mergeAgentRegistry 处理。
 */
export function discoverAgents(roots: AgentDiscoverRoots): DiscoveredAgent[] {
  return [
    ...loadFromRoot(roots.pluginAgentsDir, 'plugin'),
    ...loadFromRoot(roots.userAgentsDir, 'user'),
    ...loadFromRoot(roots.workspaceAgentsDir, 'workspace'),
    ...loadFromRoot(roots.projectAgentsDir, 'project'),
  ]
}

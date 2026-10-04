/**
 * [INPUT]: 旧角色 Markdown 文本与文件名回退值
 * [OUTPUT]: parseAgentMarkdown / normalizeAgentName，生成与框架无关的角色定义
 * [POS]: 仅理解既有标量 frontmatter，不实现通用 YAML 或插件机制
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { SPECIALIST_ROLES } from '../roles.ts'
import type { AgentCapability, AgentDefinition } from './types.ts'

export function normalizeAgentName(raw: string): string {
  const name = raw.trim().toLowerCase().replace(/[_\s]+/g, '-')
  if (!/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,63}$/.test(name)) throw new Error('角色名须为 1–64 位英文数字与单连字符')
  return name
}
const scalar = (raw: string) => raw.trim().replace(/^(["'])([\s\S]*)\1$/, '$2')
const bool = (raw?: string) => /^(true|yes|1)$/i.test(raw ?? '')

export function parseAgentMarkdown(raw: string, fileBase: string): AgentDefinition {
  const text = raw.replace(/^\uFEFF/, ''), fields: Record<string, string> = {}
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (text.startsWith('---\n') || text.startsWith('---\r\n')) {
    if (!frontmatter) throw new Error('角色 frontmatter 缺少结束分隔符')
    for (const line of frontmatter[1]!.split(/\r?\n/)) {
      const field = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/)
      if (field) fields[field[1]!.toLowerCase().replace(/_/g, '-')] = scalar(field[2]!)
    }
  }
  const body = text.slice(frontmatter?.[0].length ?? 0).trim()
  if (body.length > 80_000) throw new Error('角色正文超过 80000 字符上限')
  const name = normalizeAgentName(fields.name ?? fileBase)
  const capability = fields['default-capability'] ?? fields.capability ?? 'read-only'
  if (!['read-only', 'read-write', 'execute', 'all'].includes(capability)) throw new Error('角色 capability 无效')
  const preset = SPECIALIST_ROLES.find(role => role.id === (fields['kind-preset'] ?? fields.preset ?? 'explore'))
  if (!preset) throw new Error('角色 kind_preset 无效')
  const maxSteps = Number(fields['max-steps'] ?? fields.maxsteps ?? preset.maxSteps)
  if (!Number.isFinite(maxSteps) || maxSteps < 1) throw new Error('角色 max_steps 必须是正数')
  if (fields.isolation && !['none', 'worktree'].includes(fields.isolation)) throw new Error('角色 isolation 无效')
  const description = (fields.description ?? name).slice(0, 1024)
  return { name, description, instructions: body || `你是 ${name} 子 Agent。${description}`,
    capability: capability as AgentCapability, preset: preset.id, maxSteps: Math.floor(maxSteps),
    ...(fields.tools ? { toolNames: [...new Set(fields.tools.split(/[,;\s]+/).filter(Boolean))] } : {}),
    disabled: bool(fields.disabled), allowNested: bool(fields['allow-nested']), isolation: fields.isolation === 'worktree' ? 'worktree' : 'none',
  }
}

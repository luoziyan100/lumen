/**
 * [INPUT]: types + tool-kind；可选全量 Tool[]
 * [OUTPUT]: AgentDefinition / resolveAgentDefinition / buildChildTools / builtins
 * [POS]: subagent T1 Resolution 纯逻辑（无 I/O）
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { Tool } from '../core/tool.ts'
import { filterToolsForChild, kindOf, type ChildToolFilterOptions } from './tool-kind.ts'
import {
  meetCapability,
  type CapabilityMode,
  type IsolationMode,
} from './types.ts'

export interface AgentDefinition {
  name: string
  description: string
  /** 默认 capability */
  defaultCapability: CapabilityMode
  isolationDefault: IsolationMode
  allowNested: boolean
  maxSteps: number
  /** 按 kind 预设选取工具；与 toolNames 二选一优先 toolNames */
  kindPreset: 'explore' | 'plan' | 'general-purpose' | 'searcher' | 'reader' | 'verifier'
  systemPrompt: string
  /** 显式工具名白名单；空 = 仅 kindPreset */
  toolNames?: string[]
  /** T8：frontmatter/disabled；registry 再叠 toggle */
  disabled?: boolean
}

/** explore：只读勘察 */
const EXPLORE_KINDS = new Set(['Read', 'List', 'Search', 'Web', 'MemoryGet', 'Plan'])
/** plan：只读 + todo */
const PLAN_KINDS = new Set(['Read', 'List', 'Search', 'Web', 'MemoryGet', 'Plan'])
/** searcher 研究 */
const SEARCHER_KINDS = new Set(['Read', 'List', 'Search', 'Web', 'Write', 'MemoryGet'])
/** reader */
const READER_KINDS = new Set(['Read', 'Search', 'Write', 'List'])
/** verifier：偏只读校验 */
const VERIFIER_KINDS = new Set(['Read', 'Search', 'List', 'Web'])

function kindsForPreset(preset: AgentDefinition['kindPreset']): Set<string> | 'all' {
  switch (preset) {
    case 'explore': return EXPLORE_KINDS
    case 'plan': return PLAN_KINDS
    case 'searcher': return SEARCHER_KINDS
    case 'reader': return READER_KINDS
    case 'verifier': return VERIFIER_KINDS
    case 'general-purpose': return 'all'
  }
}

export const BUILTIN_DEFINITIONS: readonly AgentDefinition[] = [
  {
    name: 'explore',
    description: 'Fast read-only codebase/workspace exploration. No writes or shell.',
    defaultCapability: 'read-only',
    isolationDefault: 'none',
    allowNested: false,
    maxSteps: 12,
    kindPreset: 'explore',
    systemPrompt:
      '你是 explore 子 agent：只读勘察。用 read/list/grep/search 收集事实，回报结构化结论。禁止改文件或执行代码。',
  },
  {
    name: 'plan',
    description: 'Read-only planning with todos. No shell or file mutation.',
    defaultCapability: 'read-only',
    isolationDefault: 'none',
    allowNested: false,
    maxSteps: 10,
    kindPreset: 'plan',
    systemPrompt:
      '你是 plan 子 agent：只读规划。可更新 todo，产出可执行计划与验收标准。禁止写业务文件或 run_code。',
  },
  {
    name: 'general-purpose',
    description: 'Full toolset implementer for multi-step work.',
    defaultCapability: 'all',
    isolationDefault: 'none',
    allowNested: false,
    maxSteps: 24,
    kindPreset: 'general-purpose',
    systemPrompt:
      '你是 general-purpose 子 agent：在 scope 内自主完成任务，改文件、跑代码、验证。回报结论与关键路径。不要扩 scope。',
  },
  {
    name: 'searcher',
    description: 'Research retrieval worker (papers/web) with note writing.',
    defaultCapability: 'read-write',
    isolationDefault: 'none',
    allowNested: false,
    maxSteps: 8,
    kindPreset: 'searcher',
    systemPrompt:
      '你是检索 worker。用研究工具按 scope 找论文/网页，把要点写进工作区文件，最后用一段结构化文本回报（Scope / 命中 / 备注）。只回报结论，不回报过程。',
  },
  {
    name: 'reader',
    description: 'Deep-read papers/links into structured notes.',
    defaultCapability: 'read-write',
    isolationDefault: 'none',
    allowNested: false,
    maxSteps: 8,
    kindPreset: 'reader',
    systemPrompt:
      '你是精读 worker。读取指定论文/链接的正文，产出结构化笔记写入工作区，回报一段摘要（要点 / 方法 / 局限）。',
  },
  {
    name: 'verifier',
    description: 'Evidence checker; default skeptical; read-only tools.',
    defaultCapability: 'read-only',
    isolationDefault: 'none',
    allowNested: false,
    maxSteps: 6,
    kindPreset: 'verifier',
    systemPrompt:
      '你是校验 worker。针对给定主张找原始证据或反例，回报判断（成立 / 存疑 / 反驳 + 依据）。默认怀疑。',
  },
]

const BY_NAME = new Map(BUILTIN_DEFINITIONS.map((d) => [d.name, d]))

export function listBuiltinNames(): string[] {
  return BUILTIN_DEFINITIONS.map((d) => d.name)
}

/**
 * 仅查 builtin（兼容旧调用）。
 * 生产路径请用 registry.resolveFromRegistry（含发现 + toggle）。
 */
export function resolveAgentDefinition(name: string): AgentDefinition | null {
  return BY_NAME.get(name) ?? null
}

/**
 * 从全量工具中按 definition.kindPreset / toolNames 选取，再套 capability 过滤。
 */
export function buildChildTools(
  allTools: Tool[],
  definition: AgentDefinition,
  spawnCapability?: CapabilityMode | null,
  parentCeiling?: CapabilityMode | null,
): { tools: Tool[]; effectiveCapability: CapabilityMode } {
  const effective =
    meetCapability(
      meetCapability(spawnCapability, definition.defaultCapability),
      parentCeiling ?? 'all',
    ) ?? definition.defaultCapability

  const byName = new Map(allTools.map((t) => [t.spec.name, t]))
  let selected: Tool[]

  if (definition.toolNames?.length) {
    selected = definition.toolNames
      .map((n) => byName.get(n))
      .filter((t): t is Tool => Boolean(t))
  } else {
    const preset = kindsForPreset(definition.kindPreset)
    selected = allTools.filter((t) => {
      const k = kindOf(t.spec.name)
      if (preset === 'all') return k !== 'Unknown'
      return preset.has(k)
    })
  }

  const filterOpts: ChildToolFilterOptions = {
    capability: effective,
    allowNested: definition.allowNested,
    stripAskUser: true,
  }
  return {
    tools: filterToolsForChild(selected, filterOpts),
    effectiveCapability: effective,
  }
}

/** 校验：explore 不得含写/执行 */
export function assertExploreReadOnly(tools: Tool[]): void {
  for (const t of tools) {
    const k = kindOf(t.spec.name)
    if (k === 'Write' || k === 'Edit' || k === 'Execute' || k === 'MemoryWrite' || k === 'Task') {
      throw new Error(`explore toolset must not include ${t.spec.name} (${k})`)
    }
  }
}

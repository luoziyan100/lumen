/**
 * [INPUT]: Tool 名；types.ToolKind / CapabilityMode
 * [OUTPUT]: kindOf / filterToolsForChild —— Lumen 工具分类与 child 工具表裁剪
 * [POS]: subagent T1；fail-closed Unknown；RO/RW/EX 无 Task
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { Tool } from '../core/tool.ts'
import {
  kindsAllowedByCapability,
  type CapabilityMode,
  type ToolKind,
} from './types.ts'

/** 现有工具 → ToolKind（新工具必须登记，否则 Unknown 被剔除） */
export const TOOL_KIND_BY_NAME: Readonly<Record<string, ToolKind>> = {
  // Read
  read_file: 'Read',
  extract_pdf: 'Read',
  fetch_url: 'Read',
  fetch_paper: 'Read',
  look_at_image: 'Read',
  read_memory: 'MemoryGet',
  // List
  list_dir: 'List',
  glob: 'List',
  // Search
  grep: 'Search',
  search_papers: 'Search',
  search_web: 'Search',
  get_citations: 'Search',
  // Edit / Write
  edit_file: 'Edit',
  write_file: 'Write',
  install_skill: 'Write',
  write_memory: 'MemoryWrite',
  // Execute
  run_code: 'Execute',
  run_skill: 'Execute',
  // Plan
  todo_write: 'Plan',
  update_plan: 'Plan',
  // AskUser（child 永不）
  ask_user: 'AskUser',
  // Task fan-out（T4 将挂名；先登记）
  spawn: 'Task',
  spawn_subagent: 'Task',
  get_subagent_output: 'TaskControl',
  kill_subagent: 'TaskControl',
  wait_subagents: 'TaskControl',
}

export function kindOf(toolName: string): ToolKind {
  return TOOL_KIND_BY_NAME[toolName] ?? 'Unknown'
}

export interface ChildToolFilterOptions {
  /** effective capability（spawn ∩ definition ∩ parent） */
  capability: CapabilityMode
  /** definition.allow_nested_subagents；仅 all 时有意义 */
  allowNested: boolean
  /** child 永不 ask_user（默认 true） */
  stripAskUser?: boolean
}

/**
 * 构建 child 有效工具表（R1.1/R1.3 过滤顺序）。
 *
 * 1. 输入 = definition 已选工具全集（或主工具表子集）
 * 2. 按 capability Kind 白名单
 * 3. RO/RW/EX 剔除 Task；all 且 !allowNested 剔除 Task
 * 4. 无 Task → 剔除全部 TaskControl
 * 5. 剔除 AskUser（默认）
 * 6. Unknown → 剔除
 */
export function filterToolsForChild(tools: Tool[], opts: ChildToolFilterOptions): Tool[] {
  const stripAsk = opts.stripAskUser !== false
  const allowed = kindsAllowedByCapability(opts.capability)

  let out = tools.filter((t) => {
    const k = kindOf(t.spec.name)
    if (k === 'Unknown') return false
    if (stripAsk && k === 'AskUser') return false
    if (allowed === 'all') return true
    return allowed.has(k)
  })

  const nestedOk = opts.capability === 'all' && opts.allowNested
  if (!nestedOk) {
    out = out.filter((t) => kindOf(t.spec.name) !== 'Task')
  }
  if (!out.some((t) => kindOf(t.spec.name) === 'Task')) {
    out = out.filter((t) => kindOf(t.spec.name) !== 'TaskControl')
  }
  return out
}

/** 写型：含 Write|Edit|Execute（用于 none 并行 workers/ 条带） */
export function isWriteCapableToolset(tools: Tool[]): boolean {
  return tools.some((t) => {
    const k = kindOf(t.spec.name)
    return k === 'Write' || k === 'Edit' || k === 'Execute' || k === 'MemoryWrite'
  })
}

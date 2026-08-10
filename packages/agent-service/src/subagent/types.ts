/**
 * [INPUT]: briefs/active/subagent-system.md R1.3 L0
 * [OUTPUT]: Subagent 协议类型、状态矩阵、错误码、capability 格（T1 过滤用骨架）
 * [POS]: subagent/ 协议层;TaskStore/Coordinator/Runner 共用
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

/** 子 Agent 生命周期状态（存储/query 用） */
export type SubagentStatus =
  | 'queued'
  | 'running'
  | 'cancelling'
  | 'done'
  | 'exhausted'
  | 'interrupted'
  | 'aborted'
  | 'error'
  | 'failed'

export type CapabilityMode = 'read-only' | 'read-write' | 'execute' | 'all'
export type IsolationMode = 'none' | 'worktree'

/** 可作 resume_from 源：done | interrupted | exhausted */
export function resumeAllowed(status: SubagentStatus): boolean {
  return status === 'done' || status === 'interrupted' || status === 'exhausted'
}

export function isTerminalStatus(status: SubagentStatus): boolean {
  return (
    status === 'done'
    || status === 'exhausted'
    || status === 'interrupted'
    || status === 'aborted'
    || status === 'error'
    || status === 'failed'
  )
}

/** 计入并发上限 */
export function countsTowardConcurrency(status: SubagentStatus): boolean {
  return status === 'queued' || status === 'running' || status === 'cancelling'
}

/** 协议错误码（工具 llmContent / data 用） */
export const SUBAGENT_ERROR = {
  CONCURRENCY_LIMIT: 'subagent_concurrency_limit',
  CWD_FORBIDDEN_WITH_WORKTREE: 'cwd_forbidden_with_worktree',
  RESUME_NOT_ALLOWED: 'subagent_resume_not_allowed',
  NOT_FOUND: 'subagent_not_found',
  SPAWN_BLOCKED: 'subagent_spawn_blocked',
  DEPTH_EXCEEDED: 'subagent_depth_exceeded',
  TYPE_UNKNOWN: 'subagent_type_unknown',
} as const

export type SubagentErrorCode = (typeof SUBAGENT_ERROR)[keyof typeof SUBAGENT_ERROR]

export interface SubagentUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  cost_usd?: number
}

export interface SubagentRecord {
  id: string
  parent_task_id: string
  parent_turn_id: string
  /** 直接父 subagent；null = 挂在主 task 上 */
  parent_subagent_id: string | null
  subagent_type: string
  description: string
  status: SubagentStatus
  depth: number
  isolation: IsolationMode
  cwd_root: string | null
  worktree_path: string | null
  snapshot_ref: string | null
  surface_completion: number // 0|1
  reminder_consumed: number // 0|1
  completion_summary: string | null
  last_error: string | null
  active_turn_id: string | null
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  tool_calls: number
  turns: number
  created_at: string
  updated_at: string
  finished_at: string | null
}

export interface CreateSubagentInput {
  id?: string
  parent_task_id: string
  parent_turn_id: string
  parent_subagent_id?: string | null
  subagent_type: string
  description: string
  depth?: number
  isolation?: IsolationMode
  cwd_root?: string | null
  worktree_path?: string | null
  surface_completion?: boolean
}

export interface SubagentConfig {
  max_depth: number
  max_concurrent_per_task: number
  max_concurrent_global: number
  completion_output_cap: number
  default_background: boolean
  foreground_budget_ms: number
  worktree_root: string
}

export const DEFAULT_SUBAGENT_CONFIG: SubagentConfig = {
  max_depth: 1,
  max_concurrent_per_task: 8,
  max_concurrent_global: 16,
  completion_output_cap: 32_000,
  default_background: true,
  foreground_budget_ms: 120_000,
  worktree_root: '~/.lumen/worktrees',
}

/** Capability 格 meet（R1 · RW∩EX=RO） */
export function meetCapability(
  a: CapabilityMode | null | undefined,
  b: CapabilityMode | null | undefined,
): CapabilityMode | null {
  if (a == null && b == null) return null
  if (a == null) return b ?? null
  if (b == null) return a
  if (a === 'all') return b
  if (b === 'all') return a
  if (a === 'read-only' || b === 'read-only') return 'read-only'
  if (a === b) return a
  // read-write ∩ execute = read-only
  if (
    (a === 'read-write' && b === 'execute')
    || (a === 'execute' && b === 'read-write')
  ) {
    return 'read-only'
  }
  return 'read-only'
}

export type ToolKind =
  | 'Read'
  | 'List'
  | 'Search'
  | 'Edit'
  | 'Write'
  | 'Execute'
  | 'Plan'
  | 'AskUser'
  | 'MemoryGet'
  | 'MemoryWrite'
  | 'Task'
  | 'TaskControl'
  | 'Web'
  | 'Unknown'

/** RO/RW/EX 均不含 Task；Task 仅 all（再由 allow_nested 决定） */
export function kindsAllowedByCapability(mode: CapabilityMode): ReadonlySet<ToolKind> | 'all' {
  const ro: ToolKind[] = [
    'Read', 'List', 'Search', 'Plan', 'Web', 'MemoryGet',
  ]
  if (mode === 'all') return 'all'
  if (mode === 'read-only') return new Set(ro)
  if (mode === 'read-write') return new Set([...ro, 'Edit', 'Write', 'MemoryWrite'])
  // execute
  return new Set([...ro, 'Execute'])
}

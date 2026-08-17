/**
 * [INPUT]: briefs/active/subagent-system.md R1.3 L0
 * [OUTPUT]: Subagent 协议类型、状态矩阵、错误码(含 PARENT_BUDGET)、capability 格（T1 过滤用骨架）
 * [POS]: subagent/ 协议层;TaskStore/Coordinator/Runner 共用;parent_budget 供 spawn 准入读父 token 账
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { TaskBudget } from '../storage/budget.ts'

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
  /** isolation=worktree 物化失败；禁止 fallback none */
  WORKTREE_FAILED: 'subagent_worktree_failed',
  /** 父 task token/cost 预算已耗尽(含飞行中子代已烧) */
  PARENT_BUDGET: 'subagent_parent_budget',
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
  /** 父 task 预算;spawn 准入看 token/cost(含飞行中子代 live 步) */
  parent_budget?: TaskBudget
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

/** bg spawn 立即返回 */
export interface SpawnImmediateResult {
  success: boolean
  subagent_id?: string
  subagent_type?: string
  status?: 'queued' | 'running'
  demoted?: boolean
  error_code?: string
  error?: string
}

/** 完成结构（get_output / wait 终态） */
export interface SubagentCompletionResult {
  output: string
  subagent_id: string
  subagent_type: string
  status: SubagentStatus
  tool_calls: number
  turns: number
  duration_ms: number
  worktree_path?: string
  cwd_root?: string
  resume_hint: string
  resume_allowed: boolean
  error?: string
  usage: SubagentUsage
  usage_applied_to_parent: boolean
  truncated?: boolean
  full_output_path?: string
}

export interface WaitOptions {
  /** 等待上限 ms；foreground 用 config.foreground_budget_ms */
  timeoutMs?: number
  /**
   * 超时后是否 demote 为 background 继续跑（不杀）。
   * true = 协议 foreground 超时行为；false = 仅超时返回仍 running。
   */
  demoteOnTimeout?: boolean
  signal?: AbortSignal
}

export interface WaitResult {
  /** 全部终态 → done；任一超时且 demote → demoted；超时未 demote → timeout */
  outcome: 'done' | 'demoted' | 'timeout' | 'aborted'
  results: SubagentCompletionResult[]
  /** 仍未终态的 id */
  pending_ids: string[]
}

/** isolation=worktree 时禁止模型 cwd；cwd_root 由 runner 物化后写入 */
export function assertSpawnCwdLegal(
  isolation: IsolationMode,
  modelCwd: string | null | undefined,
): { ok: true } | { ok: false; error_code: string; error: string } {
  if (isolation === 'worktree' && modelCwd != null && modelCwd !== '') {
    return {
      ok: false,
      error_code: SUBAGENT_ERROR.CWD_FORBIDDEN_WITH_WORKTREE,
      error: 'cwd is forbidden when isolation=worktree',
    }
  }
  return { ok: true }
}

/** none 隔离 + 写型：默认 workers/<id>/ 条带 */
export function defaultWriteStripeCwd(subagentId: string): string {
  return `workers/${subagentId}`
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

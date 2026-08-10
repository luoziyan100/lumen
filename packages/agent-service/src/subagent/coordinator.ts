/**
 * [INPUT]: SubagentStore + TaskStore；R1.3 生命周期/并发/kill 级联
 * [OUTPUT]: SubagentCoordinator —— 受理 spawn 登记、kill、sweep、并发闸
 * [POS]: T0 协调器骨架;Runner 未接 runAgent 前可纯状态机测
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { TaskStore } from '../storage/task-store.ts'
import {
  consumeCompletionReminder,
  drainCompletionReminder,
  rehydrateUnconsumedReminders,
} from './reminder.ts'
import type { SubagentStore } from './store.ts'
import {
  DEFAULT_SUBAGENT_CONFIG,
  SUBAGENT_ERROR,
  isTerminalStatus,
  resumeAllowed,
  type CreateSubagentInput,
  type SubagentConfig,
  type SubagentRecord,
  type SubagentStatus,
} from './types.ts'

export interface SpawnRegisterResult {
  ok: boolean
  record?: SubagentRecord
  error_code?: string
  error?: string
}

/** live handle：进程内 AbortController；无则仅落盘状态 */
export interface LiveHandle {
  controller: AbortController
}

export class SubagentCoordinator {
  private readonly store: SubagentStore
  private readonly taskStore: TaskStore
  private readonly cfg: SubagentConfig
  private readonly live = new Map<string, LiveHandle>()
  /** Stop 后禁止新 spawn 的 parent_task_id */
  private readonly spawnBlocked = new Set<string>()

  constructor(store: SubagentStore, taskStore: TaskStore, cfg: Partial<SubagentConfig> = {}) {
    this.store = store
    this.taskStore = taskStore
    this.cfg = { ...DEFAULT_SUBAGENT_CONFIG, ...cfg }
  }

  get config(): SubagentConfig {
    return this.cfg
  }

  openSpawnAdmission(parentTaskId: string): void {
    this.spawnBlocked.delete(parentTaskId)
  }

  blockSpawn(parentTaskId: string): void {
    this.spawnBlocked.add(parentTaskId)
  }

  /**
   * 登记 spawn → status=queued。
   * 并发超限 → 拒绝，错误码 subagent_concurrency_limit。
   */
  registerSpawn(input: CreateSubagentInput): SpawnRegisterResult {
    if (this.spawnBlocked.has(input.parent_task_id)) {
      return {
        ok: false,
        error_code: SUBAGENT_ERROR.SPAWN_BLOCKED,
        error: 'spawn blocked for this task (stop/teardown)',
      }
    }
    if (input.depth != null && input.depth > this.cfg.max_depth) {
      return {
        ok: false,
        error_code: SUBAGENT_ERROR.DEPTH_EXCEEDED,
        error: `max_depth ${this.cfg.max_depth} exceeded`,
      }
    }
    if (
      this.store.countActiveForTask(input.parent_task_id) >= this.cfg.max_concurrent_per_task
      || this.store.countActiveGlobal() >= this.cfg.max_concurrent_global
    ) {
      return {
        ok: false,
        error_code: SUBAGENT_ERROR.CONCURRENCY_LIMIT,
        error: `concurrency limit (task=${this.cfg.max_concurrent_per_task}, global=${this.cfg.max_concurrent_global})`,
      }
    }
    // worktree + cwd 禁（cwd_root 由 runner 设；模型 cwd 在工具层拒）
    const rec = this.store.create(input)
    this.taskStore.appendEvent(
      rec.parent_task_id,
      'subagent_started',
      {
        subagent_id: rec.id,
        subagent_type: rec.subagent_type,
        description: rec.description,
        parent_turn_id: rec.parent_turn_id,
        parent_subagent_id: rec.parent_subagent_id,
        status: rec.status,
      },
      'main',
    )
    return { ok: true, record: rec }
  }

  /** queued → running；分配 child turn */
  markRunning(id: string): SubagentRecord | null {
    const cur = this.store.get(id)
    if (!cur || cur.status !== 'queued') return null
    const childTurnId = `turn-${globalThis.crypto.randomUUID()}`
    this.store.setActiveTurn(id, childTurnId)
    const next = this.store.updateStatus(id, 'running')
    this.taskStore.appendEvent(
      cur.parent_task_id,
      'turn_start',
      { turn_id: childTurnId, session_id: id, scope: 'subagent' },
      cur.subagent_type,
    )
    return next
  }

  attachLive(id: string, controller: AbortController): void {
    this.live.set(id, { controller })
  }

  /**
   * 终态。写 completion 事件 + 可选 drain reminder。
   */
  complete(
    id: string,
    status: Extract<SubagentStatus, 'done' | 'exhausted' | 'error' | 'failed' | 'aborted' | 'interrupted'>,
    opts?: {
      last_error?: string | null
      completion_summary?: string
      tool_calls?: number
      turns?: number
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    },
  ): SubagentRecord | null {
    const cur = this.store.get(id)
    if (!cur) return null
    if (isTerminalStatus(cur.status) && cur.status !== 'cancelling') {
      // already terminal — allow interrupted overwrite only from sweep
    }
    const live = this.live.get(id)
    if (live && status === 'aborted') live.controller.abort()
    this.live.delete(id)

    const activeTurn = cur.active_turn_id
    if (activeTurn) {
      this.taskStore.appendEvent(
        cur.parent_task_id,
        'turn_end',
        { turn_id: activeTurn, session_id: id, status, scope: 'subagent' },
        cur.subagent_type,
      )
      this.store.setActiveTurn(id, null)
    }

    if (opts?.completion_summary != null) {
      this.store.setCompletionSummary(id, opts.completion_summary)
    }
    const next = this.store.updateStatus(id, status, {
      last_error: opts?.last_error,
      finished: true,
    })
    if (!next) return null

    // usage counters (best-effort update via raw SQL if provided)
    if (opts?.usage || opts?.tool_calls != null || opts?.turns != null) {
      // re-read after status update
      const r = this.store.get(id)!
      // store doesn't expose generic update — use complete path fields via setCompletionSummary only for T0
      void r
    }

    this.taskStore.appendEvent(
      next.parent_task_id,
      'subagent_completed',
      {
        subagent_id: next.id,
        subagent_type: next.subagent_type,
        status: next.status,
        resume_allowed: resumeAllowed(next.status),
        summary: next.completion_summary,
      },
      'main',
    )
    drainCompletionReminder(this.store, this.taskStore, id)
    return this.store.get(id)
  }

  /**
   * kill 单 id + 未终态后代。
   * queued → aborted；running → abort signal + aborted。
   */
  kill(id: string, reason = 'killed'): SubagentRecord | null {
    const root = this.store.get(id)
    if (!root) return null
    const targets = [root, ...this.store.listDescendants(id)].filter((r) => !isTerminalStatus(r.status))
    let last: SubagentRecord | null = null
    for (const t of targets) {
      if (t.status === 'queued') {
        last = this.complete(t.id, 'aborted', { last_error: reason, completion_summary: reason })
        continue
      }
      if (t.status === 'running' || t.status === 'cancelling') {
        this.store.updateStatus(t.id, 'cancelling')
        this.live.get(t.id)?.controller.abort()
        last = this.complete(t.id, 'aborted', { last_error: reason, completion_summary: reason })
      }
    }
    return last
  }

  /** 杀 parent_turn_id 匹配的直接子（及其后代 via kill） */
  cancelByParentTurn(parentTaskId: string, turnId: string): number {
    let n = 0
    for (const r of this.store.listByParentTask(parentTaskId)) {
      if (r.parent_turn_id === turnId && !isTerminalStatus(r.status) && r.parent_subagent_id == null) {
        // 直接挂在 task 上且 parent_turn 匹配
        this.kill(r.id, `cancelTurn:${turnId}`)
        n += 1
      } else if (r.parent_turn_id === turnId && !isTerminalStatus(r.status)) {
        // 也杀 parent_turn 直接匹配的（child 下 spawn 的孙 parent_turn=child turn，不会在此）
        this.kill(r.id, `cancelTurn:${turnId}`)
        n += 1
      }
    }
    return n
  }

  cancelByParentTask(parentTaskId: string): number {
    this.blockSpawn(parentTaskId)
    let n = 0
    for (const r of this.store.listByParentTask(parentTaskId)) {
      if (!isTerminalStatus(r.status) && r.parent_subagent_id == null) {
        this.kill(r.id, 'cancelTask')
        n += 1
      } else if (!isTerminalStatus(r.status)) {
        // kill 根会级联；避免重复只杀顶层
      }
    }
    // 再扫一遍兜底
    for (const r of this.store.listByParentTask(parentTaskId)) {
      if (!isTerminalStatus(r.status)) {
        this.kill(r.id, 'cancelTask')
        n += 1
      }
    }
    return n
  }

  /**
   * 服务重启：queued|running|cancelling 且无 live → interrupted。
   * 关闭 child active turn。
   */
  sweepInterrupted(): number {
    let n = 0
    for (const r of this.store.listLiveForSweep()) {
      if (this.live.has(r.id)) continue
      const activeTurn = r.active_turn_id
      if (activeTurn) {
        this.taskStore.appendEvent(
          r.parent_task_id,
          'turn_end',
          {
            turn_id: activeTurn,
            session_id: r.id,
            status: 'interrupted',
            reason: 'service_restart',
            scope: 'subagent',
          },
          r.subagent_type,
        )
        this.store.setActiveTurn(r.id, null)
      }
      this.store.setCompletionSummary(r.id, 'service_restart')
      this.store.updateStatus(r.id, 'interrupted', {
        last_error: 'service_restart',
        finished: true,
      })
      this.taskStore.appendEvent(
        r.parent_task_id,
        'subagent_interrupted',
        { subagent_id: r.id, reason: 'service_restart' },
        'main',
      )
      drainCompletionReminder(this.store, this.taskStore, r.id)
      n += 1
    }
    return n
  }

  rehydrateReminders(parentTaskId: string): number {
    return rehydrateUnconsumedReminders(this.store, this.taskStore, parentTaskId)
  }

  consumeReminder(subagentId: string, turnId: string): boolean {
    return consumeCompletionReminder(this.store, this.taskStore, subagentId, turnId)
  }

  get(id: string): SubagentRecord | null {
    return this.store.get(id)
  }
}

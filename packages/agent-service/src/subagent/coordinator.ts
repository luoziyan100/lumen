/**
 * [INPUT]: SubagentStore + TaskStore；R1.3 生命周期/并发/kill/wait/fg demote
 * [OUTPUT]: SubagentCoordinator —— spawn 登记、kill、cancel、wait、getOutput、sweep
 * [POS]: T2 全命令 + 落盘;Runner(runAgent) 在 T3 挂 live handle
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
  assertSpawnCwdLegal,
  defaultWriteStripeCwd,
  isTerminalStatus,
  resumeAllowed,
  type CreateSubagentInput,
  type IsolationMode,
  type SpawnImmediateResult,
  type SubagentCompletionResult,
  type SubagentConfig,
  type SubagentRecord,
  type SubagentStatus,
  type WaitOptions,
  type WaitResult,
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
  startedAt: number
  demoted: boolean
  /** foreground 等待时 demote 回调 */
  onDemote?: () => void
}

export class SubagentCoordinator {
  private readonly store: SubagentStore
  private readonly taskStore: TaskStore
  private readonly cfg: SubagentConfig
  private readonly live = new Map<string, LiveHandle>()
  /** Stop 后禁止新 spawn 的 parent_task_id */
  private readonly spawnBlocked = new Set<string>()
  private readonly fgTimers = new Map<string, ReturnType<typeof setTimeout>>()

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
   * 校验 + 登记 spawn → status=queued。
   * 并发超限 / worktree+cwd / depth / blocked → 拒绝。
   */
  registerSpawn(
    input: CreateSubagentInput & {
      /** 模型传入的 cwd（虚拟相对路径）；worktree 时禁止 */
      model_cwd?: string | null
      /** 写型 none 隔离时自动 workers/<id>/ */
      write_capable?: boolean
    },
  ): SpawnRegisterResult {
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
    const isolation: IsolationMode = input.isolation ?? 'none'
    const cwdCheck = assertSpawnCwdLegal(isolation, input.model_cwd)
    if (!cwdCheck.ok) {
      return { ok: false, error_code: cwdCheck.error_code, error: cwdCheck.error }
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

    const id = input.id ?? `sub-${globalThis.crypto.randomUUID()}`
    let cwd_root = input.cwd_root ?? null
    // none + 写型 + 未指定 cwd → 强制 workers/<id>/ 条带
    if (isolation === 'none' && input.write_capable && !cwd_root && !input.model_cwd) {
      cwd_root = defaultWriteStripeCwd(id)
    } else if (isolation === 'none' && input.model_cwd) {
      cwd_root = input.model_cwd
    }

    const rec = this.store.create({
      ...input,
      id,
      isolation,
      cwd_root,
    })
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
        isolation: rec.isolation,
        cwd_root: rec.cwd_root,
      },
      'main',
    )
    return { ok: true, record: rec }
  }

  /** bg 立即响应形状（工具层用） */
  toImmediateResult(record: SubagentRecord, demoted = false): SpawnImmediateResult {
    return {
      success: true,
      subagent_id: record.id,
      subagent_type: record.subagent_type,
      status: record.status === 'running' ? 'running' : 'queued',
      ...(demoted ? { demoted: true } : {}),
    }
  }

  /** queued → running；分配 **child 自有** turn（≠ parent_turn / root） */
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
    this.live.set(id, { controller, startedAt: Date.now(), demoted: false })
  }

  isLive(id: string): boolean {
    return this.live.has(id)
  }

  isDemoted(id: string): boolean {
    return this.live.get(id)?.demoted === true
  }

  /**
   * 启动 foreground 预算表：到期 demote（不杀），子继续 bg。
   * Runner/工具层在 background=false 时调用。
   */
  armForegroundBudget(id: string, budgetMs = this.cfg.foreground_budget_ms): void {
    this.clearFgTimer(id)
    const handle = this.live.get(id)
    if (!handle) return
    const timer = setTimeout(() => {
      this.demoteToBackground(id)
    }, budgetMs)
    // 不 block 进程退出
    if (typeof timer === 'object' && 'unref' in timer) (timer as NodeJS.Timeout).unref()
    this.fgTimers.set(id, timer)
  }

  /** foreground 超时 → demote；不 abort */
  demoteToBackground(id: string): boolean {
    this.clearFgTimer(id)
    const handle = this.live.get(id)
    if (!handle || handle.demoted) return false
    const rec = this.store.get(id)
    if (!rec || isTerminalStatus(rec.status)) return false
    handle.demoted = true
    this.taskStore.appendEvent(
      rec.parent_task_id,
      'subagent_demoted',
      { subagent_id: id, reason: 'foreground_budget' },
      'main',
    )
    handle.onDemote?.()
    return true
  }

  private clearFgTimer(id: string): void {
    const t = this.fgTimers.get(id)
    if (t) clearTimeout(t)
    this.fgTimers.delete(id)
  }

  /**
   * 终态。写 completion 事件 + usage 落盘 + drain reminder。
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
      cwd_root?: string | null
      worktree_path?: string | null
    },
  ): SubagentRecord | null {
    const cur = this.store.get(id)
    if (!cur) return null
    if (isTerminalStatus(cur.status)) {
      // already terminal — idempotent get
      return cur
    }

    this.clearFgTimer(id)
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
    if (opts?.cwd_root !== undefined || opts?.worktree_path !== undefined) {
      this.store.setWorkspacePaths(id, {
        cwd_root: opts.cwd_root,
        worktree_path: opts.worktree_path,
      })
    }
    if (opts?.usage || opts?.tool_calls != null || opts?.turns != null) {
      this.store.setUsage(id, {
        prompt_tokens: opts.usage?.prompt_tokens,
        completion_tokens: opts.usage?.completion_tokens,
        total_tokens: opts.usage?.total_tokens,
        tool_calls: opts.tool_calls,
        turns: opts.turns,
      })
    }

    const next = this.store.updateStatus(id, status, {
      last_error: opts?.last_error,
      finished: true,
    })
    if (!next) return null

    this.taskStore.appendEvent(
      next.parent_task_id,
      'subagent_completed',
      {
        subagent_id: next.id,
        subagent_type: next.subagent_type,
        status: next.status,
        resume_allowed: resumeAllowed(next.status),
        summary: next.completion_summary,
        usage: {
          prompt_tokens: next.prompt_tokens,
          completion_tokens: next.completion_tokens,
          total_tokens: next.total_tokens,
        },
      },
      'main',
    )
    drainCompletionReminder(this.store, this.taskStore, id)
    return this.store.get(id)
  }

  /**
   * 读完成结构（running 也可 query，output 可能空）。
   * 截断：completion_output_cap。
   */
  getOutput(id: string): SubagentCompletionResult | null {
    const r = this.store.get(id)
    if (!r) return null
    return this.toCompletionResult(r)
  }

  private toCompletionResult(r: SubagentRecord): SubagentCompletionResult {
    const raw = r.completion_summary ?? ''
    const cap = this.cfg.completion_output_cap
    const truncated = raw.length > cap
    const output = truncated ? raw.slice(0, cap) : raw
    const allowed = resumeAllowed(r.status)
    const started = this.live.get(r.id)?.startedAt
    const endMs = r.finished_at ? Date.parse(r.finished_at) : Date.now()
    const startMs = started ?? Date.parse(r.created_at)
    const duration_ms = Math.max(0, endMs - startMs)

    let resume_hint = ''
    if (allowed) {
      resume_hint = `resume_from=${r.id} (status=${r.status})`
    } else if (isTerminalStatus(r.status)) {
      resume_hint = `not resumeable (status=${r.status})`
    } else {
      resume_hint = 'still running; use wait or get_output later'
    }

    return {
      output,
      subagent_id: r.id,
      subagent_type: r.subagent_type,
      status: r.status,
      tool_calls: r.tool_calls,
      turns: r.turns,
      duration_ms,
      ...(r.worktree_path ? { worktree_path: r.worktree_path } : {}),
      ...(r.cwd_root ? { cwd_root: r.cwd_root } : {}),
      resume_hint,
      resume_allowed: allowed,
      ...(r.last_error ? { error: r.last_error } : {}),
      usage: {
        prompt_tokens: r.prompt_tokens,
        completion_tokens: r.completion_tokens,
        total_tokens: r.total_tokens,
      },
      // parent budget 接线在 T3 Runner
      usage_applied_to_parent: false,
      ...(truncated ? { truncated: true } : {}),
    }
  }

  /**
   * 等待一组子到达终态，或 timeout / demote / abort。
   * 轮询落盘状态（Runner 未就绪时测试可 complete 推进）。
   */
  async wait(ids: string[], opts: WaitOptions = {}): Promise<WaitResult> {
    const timeoutMs = opts.timeoutMs ?? this.cfg.foreground_budget_ms
    const demoteOnTimeout = opts.demoteOnTimeout === true
    const deadline = Date.now() + timeoutMs
    const pending = new Set(ids)
    const signal = opts.signal

    // 注册 demote 唤醒
    const demoteWaiters: Array<() => void> = []
    for (const id of ids) {
      const h = this.live.get(id)
      if (h) {
        const prev = h.onDemote
        h.onDemote = () => {
          prev?.()
          for (const w of demoteWaiters) w()
        }
      }
    }

    const poll = (): boolean => {
      for (const id of [...pending]) {
        const r = this.store.get(id)
        if (r && isTerminalStatus(r.status)) pending.delete(id)
      }
      return pending.size === 0
    }

    if (poll()) {
      return {
        outcome: 'done',
        results: ids.map((id) => this.getOutput(id)!).filter(Boolean),
        pending_ids: [],
      }
    }

    return await new Promise<WaitResult>((resolve) => {
      let settled = false
      const finish = (outcome: WaitResult['outcome']) => {
        if (settled) return
        settled = true
        clearInterval(iv)
        signal?.removeEventListener('abort', onAbort)
        const pending_ids = [...pending]
        resolve({
          outcome,
          results: ids
            .map((id) => this.getOutput(id))
            .filter((x): x is SubagentCompletionResult => Boolean(x)),
          pending_ids,
        })
      }

      const onAbort = () => finish('aborted')
      signal?.addEventListener('abort', onAbort, { once: true })
      if (signal?.aborted) {
        finish('aborted')
        return
      }

      demoteWaiters.push(() => {
        if (demoteOnTimeout) finish('demoted')
      })

      const iv = setInterval(() => {
        if (poll()) {
          finish('done')
          return
        }
        if (Date.now() >= deadline) {
          if (demoteOnTimeout) {
            for (const id of pending) this.demoteToBackground(id)
            finish('demoted')
          } else {
            finish('timeout')
          }
        }
      }, 20)
      if (typeof iv === 'object' && 'unref' in iv) (iv as NodeJS.Timeout).unref()
    })
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

  /**
   * cancelTurn：杀 parent_turn_id === turnId 的子（及其后代 via kill 级联）。
   * 孙的 parent_turn 是 child turn，不会被 root turn 误匹配。
   */
  cancelByParentTurn(parentTaskId: string, turnId: string): number {
    let n = 0
    for (const r of this.store.listByParentTask(parentTaskId)) {
      if (r.parent_turn_id === turnId && !isTerminalStatus(r.status)) {
        this.kill(r.id, `cancelTurn:${turnId}`)
        n += 1
      }
    }
    return n
  }

  /** 别名：产品层 cancelTurn */
  cancelTurn(parentTaskId: string, turnId: string): number {
    return this.cancelByParentTurn(parentTaskId, turnId)
  }

  /** 杀 task 下全部活跃子并 block 新 spawn */
  cancelByParentTask(parentTaskId: string): number {
    this.blockSpawn(parentTaskId)
    let n = 0
    // 先杀顶层（级联后代），再兜底
    for (const r of this.store.listByParentTask(parentTaskId)) {
      if (!isTerminalStatus(r.status) && r.parent_subagent_id == null) {
        this.kill(r.id, 'cancelTask')
        n += 1
      }
    }
    for (const r of this.store.listByParentTask(parentTaskId)) {
      if (!isTerminalStatus(r.status)) {
        this.kill(r.id, 'cancelTask')
        n += 1
      }
    }
    return n
  }

  cancelTask(parentTaskId: string): number {
    return this.cancelByParentTask(parentTaskId)
  }

  /**
   * 服务重启：queued|running|cancelling 且无 live → interrupted。
   */
  sweepInterrupted(): number {
    let n = 0
    for (const r of this.store.listLiveForSweep()) {
      if (this.live.has(r.id)) continue
      this.clearFgTimer(r.id)
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

  listByParentTask(parentTaskId: string): SubagentRecord[] {
    return this.store.listByParentTask(parentTaskId)
  }

  setWorkspacePaths(
    id: string,
    paths: { cwd_root?: string | null; worktree_path?: string | null; snapshot_ref?: string | null },
  ): void {
    this.store.setWorkspacePaths(id, paths)
  }

  /**
   * resume 资格 + 同 task + type 匹配 → reopen queued。
   * 不继承 parent_turn（新 turn 由 markRunning 分配）；cwd/worktree 保留在行上。
   */
  prepareResume(opts: {
    resume_from: string
    parent_task_id: string
    parent_turn_id: string
    subagent_type: string
  }): SpawnRegisterResult {
    const src = this.store.get(opts.resume_from)
    if (!src) {
      return { ok: false, error_code: SUBAGENT_ERROR.NOT_FOUND, error: `resume source not found: ${opts.resume_from}` }
    }
    if (src.parent_task_id !== opts.parent_task_id) {
      return {
        ok: false,
        error_code: SUBAGENT_ERROR.RESUME_NOT_ALLOWED,
        error: 'resume_from must be under the same parent task',
      }
    }
    if (src.subagent_type !== opts.subagent_type) {
      return {
        ok: false,
        error_code: SUBAGENT_ERROR.RESUME_NOT_ALLOWED,
        error: `subagent_type mismatch: source=${src.subagent_type} requested=${opts.subagent_type}`,
      }
    }
    if (!resumeAllowed(src.status)) {
      return {
        ok: false,
        error_code: SUBAGENT_ERROR.RESUME_NOT_ALLOWED,
        error: `status ${src.status} is not resumeable`,
      }
    }
    if (this.spawnBlocked.has(opts.parent_task_id)) {
      return {
        ok: false,
        error_code: SUBAGENT_ERROR.SPAWN_BLOCKED,
        error: 'spawn blocked for this task (stop/teardown)',
      }
    }
    if (
      this.store.countActiveForTask(opts.parent_task_id) >= this.cfg.max_concurrent_per_task
      || this.store.countActiveGlobal() >= this.cfg.max_concurrent_global
    ) {
      return {
        ok: false,
        error_code: SUBAGENT_ERROR.CONCURRENCY_LIMIT,
        error: 'concurrency limit',
      }
    }
    // reopen 前快照路径（reopen 不碰 cwd/worktree）
    const paths = {
      cwd_root: src.cwd_root,
      worktree_path: src.worktree_path,
      snapshot_ref: src.snapshot_ref,
    }
    const reopened = this.store.reopenForResume(src.id, opts.parent_turn_id)
    if (!reopened) {
      return { ok: false, error_code: SUBAGENT_ERROR.NOT_FOUND, error: 'reopen failed' }
    }
    this.store.setWorkspacePaths(src.id, paths)
    this.taskStore.appendEvent(
      opts.parent_task_id,
      'subagent_started',
      {
        subagent_id: src.id,
        subagent_type: src.subagent_type,
        description: src.description,
        parent_turn_id: opts.parent_turn_id,
        resume_from: src.id,
        status: 'queued',
        isolation: src.isolation,
        cwd_root: paths.cwd_root,
        worktree_path: paths.worktree_path,
      },
      'main',
    )
    return { ok: true, record: this.store.get(src.id)! }
  }
}

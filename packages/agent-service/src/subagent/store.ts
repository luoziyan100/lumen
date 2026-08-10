/**
 * [INPUT]: db.ts DB；subagent/types
 * [OUTPUT]: SubagentStore —— subagents 表 CRUD + 并发计数 + reminder 列
 * [POS]: subagent/ 持久化;task_events 仍经 TaskStore.appendEvent
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { DB } from '../storage/db.ts'
import {
  countsTowardConcurrency,
  isTerminalStatus,
  type CreateSubagentInput,
  type SubagentRecord,
  type SubagentStatus,
} from './types.ts'

function now(): string {
  return new Date().toISOString()
}

function uuid(): string {
  return globalThis.crypto.randomUUID()
}

function rowToRecord(row: Record<string, unknown>): SubagentRecord {
  return {
    id: String(row.id),
    parent_task_id: String(row.parent_task_id),
    parent_turn_id: String(row.parent_turn_id),
    parent_subagent_id: row.parent_subagent_id == null ? null : String(row.parent_subagent_id),
    subagent_type: String(row.subagent_type),
    description: String(row.description ?? ''),
    status: String(row.status) as SubagentStatus,
    depth: Number(row.depth ?? 0),
    isolation: (row.isolation as SubagentRecord['isolation']) || 'none',
    cwd_root: row.cwd_root == null ? null : String(row.cwd_root),
    worktree_path: row.worktree_path == null ? null : String(row.worktree_path),
    snapshot_ref: row.snapshot_ref == null ? null : String(row.snapshot_ref),
    surface_completion: Number(row.surface_completion ?? 1),
    reminder_consumed: Number(row.reminder_consumed ?? 0),
    completion_summary: row.completion_summary == null ? null : String(row.completion_summary),
    last_error: row.last_error == null ? null : String(row.last_error),
    active_turn_id: row.active_turn_id == null ? null : String(row.active_turn_id),
    prompt_tokens: Number(row.prompt_tokens ?? 0),
    completion_tokens: Number(row.completion_tokens ?? 0),
    total_tokens: Number(row.total_tokens ?? 0),
    tool_calls: Number(row.tool_calls ?? 0),
    turns: Number(row.turns ?? 0),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    finished_at: row.finished_at == null ? null : String(row.finished_at),
  }
}

export class SubagentStore {
  private readonly db: DB

  constructor(db: DB) {
    this.db = db
  }

  create(input: CreateSubagentInput): SubagentRecord {
    const ts = now()
    const id = input.id ?? `sub-${uuid()}`
    const rec: SubagentRecord = {
      id,
      parent_task_id: input.parent_task_id,
      parent_turn_id: input.parent_turn_id,
      parent_subagent_id: input.parent_subagent_id ?? null,
      subagent_type: input.subagent_type,
      description: input.description,
      status: 'queued',
      depth: input.depth ?? 1,
      isolation: input.isolation ?? 'none',
      cwd_root: input.cwd_root ?? null,
      worktree_path: input.worktree_path ?? null,
      snapshot_ref: null,
      surface_completion: input.surface_completion === false ? 0 : 1,
      reminder_consumed: 0,
      completion_summary: null,
      last_error: null,
      active_turn_id: null,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      tool_calls: 0,
      turns: 0,
      created_at: ts,
      updated_at: ts,
      finished_at: null,
    }
    this.db.prepare(`
      INSERT INTO subagents (
        id, parent_task_id, parent_turn_id, parent_subagent_id, subagent_type, description,
        status, depth, isolation, cwd_root, worktree_path, snapshot_ref,
        surface_completion, reminder_consumed, completion_summary, last_error, active_turn_id,
        prompt_tokens, completion_tokens, total_tokens, tool_calls, turns,
        created_at, updated_at, finished_at
      ) VALUES (
        @id, @parent_task_id, @parent_turn_id, @parent_subagent_id, @subagent_type, @description,
        @status, @depth, @isolation, @cwd_root, @worktree_path, @snapshot_ref,
        @surface_completion, @reminder_consumed, @completion_summary, @last_error, @active_turn_id,
        @prompt_tokens, @completion_tokens, @total_tokens, @tool_calls, @turns,
        @created_at, @updated_at, @finished_at
      )
    `).run(rec)
    return rec
  }

  get(id: string): SubagentRecord | null {
    const row = this.db.prepare('SELECT * FROM subagents WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined
    return row ? rowToRecord(row) : null
  }

  listByParentTask(parentTaskId: string): SubagentRecord[] {
    const rows = this.db.prepare(
      'SELECT * FROM subagents WHERE parent_task_id = ? ORDER BY created_at ASC',
    ).all(parentTaskId) as Record<string, unknown>[]
    return rows.map(rowToRecord)
  }

  /** 直接子（parent_subagent_id = id） */
  listChildren(parentSubagentId: string): SubagentRecord[] {
    const rows = this.db.prepare(
      'SELECT * FROM subagents WHERE parent_subagent_id = ? ORDER BY created_at ASC',
    ).all(parentSubagentId) as Record<string, unknown>[]
    return rows.map(rowToRecord)
  }

  countActiveForTask(parentTaskId: string): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS c FROM subagents
      WHERE parent_task_id = ? AND status IN ('queued','running','cancelling')
    `).get(parentTaskId) as { c: number }
    return row.c
  }

  countActiveGlobal(): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS c FROM subagents
      WHERE status IN ('queued','running','cancelling')
    `).get() as { c: number }
    return row.c
  }

  updateStatus(
    id: string,
    status: SubagentStatus,
    opts?: { last_error?: string | null; finished?: boolean },
  ): SubagentRecord | null {
    const cur = this.get(id)
    if (!cur) return null
    const ts = now()
    const finished = opts?.finished ?? isTerminalStatus(status)
    this.db.prepare(`
      UPDATE subagents SET status=?, last_error=?, updated_at=?,
        finished_at=CASE WHEN ? THEN COALESCE(finished_at, ?) ELSE finished_at END
      WHERE id=?
    `).run(
      status,
      opts?.last_error === undefined ? cur.last_error : opts.last_error,
      ts,
      finished ? 1 : 0,
      finished ? ts : null,
      id,
    )
    return this.get(id)
  }

  setActiveTurn(id: string, turnId: string | null): void {
    this.db.prepare('UPDATE subagents SET active_turn_id=?, updated_at=? WHERE id=?').run(
      turnId,
      now(),
      id,
    )
  }

  setCompletionSummary(id: string, summary: string | null): void {
    this.db.prepare(
      'UPDATE subagents SET completion_summary=?, updated_at=? WHERE id=?',
    ).run(summary, now(), id)
  }

  setReminderConsumed(id: string, consumed: boolean): boolean {
    const r = this.db.prepare(`
      UPDATE subagents SET reminder_consumed=?, updated_at=?
      WHERE id=? AND reminder_consumed=?
    `).run(consumed ? 1 : 0, now(), id, consumed ? 0 : 1)
    return r.changes > 0
  }

  /** rehydrate：surface && terminal && !reminder_consumed */
  listNeedingReminderRehydrate(parentTaskId: string): SubagentRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM subagents
      WHERE parent_task_id = ?
        AND surface_completion = 1
        AND reminder_consumed = 0
        AND status IN ('done','exhausted','interrupted','aborted','error','failed')
      ORDER BY finished_at ASC, created_at ASC
    `).all(parentTaskId) as Record<string, unknown>[]
    return rows.map(rowToRecord)
  }

  /** 重启 sweep 候选：queued|running|cancelling */
  listLiveForSweep(): SubagentRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM subagents
      WHERE status IN ('queued','running','cancelling')
      ORDER BY updated_at ASC
    `).all() as Record<string, unknown>[]
    return rows.map(rowToRecord)
  }

  /** 后代（BFS，parent_subagent_id 链） */
  listDescendants(rootId: string): SubagentRecord[] {
    const out: SubagentRecord[] = []
    const queue = [rootId]
    while (queue.length) {
      const pid = queue.shift()!
      for (const c of this.listChildren(pid)) {
        out.push(c)
        queue.push(c.id)
      }
    }
    return out
  }

  /** 测试/诊断：是否计入并发 */
  static countsTowardConcurrency = countsTowardConcurrency
}

/**
 * [INPUT]: db.ts 的 DB
 * [OUTPUT]: TaskStore / EPHEMERAL_EVENT_KINDS —— tasks / task_events 持久化
 * [POS]: §存储层。事件流是 runtime 的 source of truth;seq 事务内单调自增;
 *        ephemeral kind 由 runtime 旁路不入库;archived_at 软归档;pinned_at 置顶
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { DB } from './db.ts'

export type TaskStatus = 'queued' | 'running' | 'interrupted' | 'done' | 'failed' | 'canceled'

export interface Task {
  id: string
  project_id: string
  goal: string
  /** 侧栏短名(总结);NULL=尚未生成,UI 回退 goal。≠ goal(首句/resume 兜底) */
  title?: string | null
  status: TaskStatus
  last_error: string | null
  created_at: string
  updated_at: string
  finished_at: string | null
  /** ISO 时间;NULL/缺省 = 未归档 */
  archived_at?: string | null
  /** ISO 时间;NULL/缺省 = 未置顶;钉档内按此倒序(≠活跃时间) */
  pinned_at?: string | null
}

export type TaskEventKind =
  | 'status_change'
  | 'user'
  | 'context_init'
  | 'text_delta' // live-only:runtime 不入库
  | 'tool_call_start' // live-only:runtime 不入库
  | 'model_step'
  | 'tool_call'
  | 'tool_result'
  | 'spawn'
  | 'reply'
  | 'error'
  | 'budget_extension'
  | 'compaction'
  | 'context_usage'

/** 高频/可重放冗余:只广播不落库 */
export const EPHEMERAL_EVENT_KINDS = new Set<string>(['text_delta', 'tool_call_start'])

export interface TaskEvent {
  id: string
  task_id: string
  seq: number
  kind: string
  payload_json: string
  /** 事件来自哪个 agent：'main' / worker 角色名；NULL = 老数据（视为 main）或系统事件 */
  agent_role: string | null
  created_at: string
}

const FINISHED: TaskStatus[] = ['done', 'failed', 'canceled']

function now(): string {
  return new Date().toISOString()
}

function uuid(): string {
  return globalThis.crypto.randomUUID()
}

export class TaskStore {
  private readonly db: DB
  private readonly stmts: {
    insertTask: ReturnType<DB['prepare']>
    getTask: ReturnType<DB['prepare']>
    listTasks: ReturnType<DB['prepare']>
    listAllTasks: ReturnType<DB['prepare']>
    updateTask: ReturnType<DB['prepare']>
    updateTaskTitle: ReturnType<DB['prepare']>
    setTaskPinned: ReturnType<DB['prepare']>
    archiveTask: ReturnType<DB['prepare']>
    touchTask: ReturnType<DB['prepare']>
    insertEvent: ReturnType<DB['prepare']>
    maxSeq: ReturnType<DB['prepare']>
    listEvents: ReturnType<DB['prepare']>
    listEventsAfter: ReturnType<DB['prepare']>
    findInterrupted: ReturnType<DB['prepare']>
  }
  private readonly appendTx: (taskId: string, kind: string, payloadJson: string, agentRole: string | null) => TaskEvent

  constructor(db: DB) {
    this.db = db
    this.stmts = {
      insertTask: db.prepare(
        'INSERT INTO tasks (id, project_id, goal, status, last_error, created_at, updated_at, finished_at) VALUES (@id,@project_id,@goal,@status,@last_error,@created_at,@updated_at,@finished_at)',
      ),
      getTask: db.prepare('SELECT * FROM tasks WHERE id = ?'),
      // 钉档优先 → 钉内 pinned_at 新者上 → 未钉 created_at;不跟活跃重排
      listTasks: db.prepare(
        `SELECT * FROM tasks WHERE project_id = ? AND archived_at IS NULL
         ORDER BY (pinned_at IS NULL) ASC, pinned_at DESC, created_at DESC`,
      ),
      listAllTasks: db.prepare(
        `SELECT * FROM tasks WHERE archived_at IS NULL
         ORDER BY (pinned_at IS NULL) ASC, pinned_at DESC, created_at DESC`,
      ),
      updateTask: db.prepare('UPDATE tasks SET status=?, last_error=?, finished_at=?, updated_at=? WHERE id=?'),
      updateTaskTitle: db.prepare('UPDATE tasks SET title=?, updated_at=? WHERE id=?'),
      setTaskPinned: db.prepare('UPDATE tasks SET pinned_at=?, updated_at=? WHERE id=?'),
      archiveTask: db.prepare(
        'UPDATE tasks SET archived_at = COALESCE(archived_at, ?), updated_at = ? WHERE id = ?',
      ),
      touchTask: db.prepare('UPDATE tasks SET updated_at=? WHERE id=?'),
      insertEvent: db.prepare(
        'INSERT INTO task_events (id, task_id, seq, kind, payload_json, agent_role, created_at) VALUES (?,?,?,?,?,?,?)',
      ),
      maxSeq: db.prepare('SELECT COALESCE(MAX(seq), 0) AS m FROM task_events WHERE task_id = ?'),
      listEvents: db.prepare('SELECT * FROM task_events WHERE task_id = ? ORDER BY seq ASC'),
      listEventsAfter: db.prepare('SELECT * FROM task_events WHERE task_id = ? AND seq > ? ORDER BY seq ASC'),
      findInterrupted: db.prepare(
        "SELECT * FROM tasks WHERE status IN ('running','interrupted') AND archived_at IS NULL ORDER BY updated_at DESC",
      ),
    }
    this.appendTx = db.transaction((taskId: string, kind: string, payloadJson: string, agentRole: string | null): TaskEvent => {
      const seq = (this.stmts.maxSeq.get(taskId) as { m: number }).m + 1
      const event: TaskEvent = {
        id: uuid(), task_id: taskId, seq, kind, payload_json: payloadJson, agent_role: agentRole, created_at: now(),
      }
      this.stmts.insertEvent.run(event.id, event.task_id, event.seq, event.kind, event.payload_json, event.agent_role, event.created_at)
      this.stmts.touchTask.run(event.created_at, taskId)
      return event
    })
  }

  createTask(projectId: string, goal: string): Task {
    const ts = now()
    const task: Task = {
      id: `task-${uuid()}`,
      project_id: projectId,
      goal,
      status: 'queued',
      last_error: null,
      created_at: ts,
      updated_at: ts,
      finished_at: null,
    }
    this.stmts.insertTask.run(task)
    this.appendEvent(task.id, 'status_change', { to: 'queued' })
    return task
  }

  getTask(id: string): Task | null {
    return (this.stmts.getTask.get(id) as Task | undefined) ?? null
  }

  listTasks(projectId?: string): Task[] {
    return (projectId ? this.stmts.listTasks.all(projectId) : this.stmts.listAllTasks.all()) as Task[]
  }

  /** 软归档:列表隐藏;幂等(已归档不改 archived_at) */
  archiveTask(id: string): boolean {
    const task = this.getTask(id)
    if (!task) return false
    const ts = now()
    this.stmts.archiveTask.run(ts, ts, id)
    return true
  }

  updateTaskStatus(id: string, status: TaskStatus, lastError: string | null = null): void {
    const ts = now()
    const finishedAt = FINISHED.includes(status) ? ts : null
    this.stmts.updateTask.run(status, lastError, finishedAt, ts, id)
    this.appendEvent(id, 'status_change', { to: status, error: lastError })
  }

  /** 侧栏短标题;不改 goal */
  updateTaskTitle(id: string, title: string): boolean {
    const task = this.getTask(id)
    if (!task) return false
    const ts = now()
    this.stmts.updateTaskTitle.run(title, ts, id)
    return true
  }

  /** 置顶/取消;pin=true 写当前 ISO,false 清 NULL;幂等 */
  setTaskPinned(id: string, pinned: boolean): boolean {
    const task = this.getTask(id)
    if (!task) return false
    const ts = now()
    const already = task.pinned_at != null && String(task.pinned_at).trim() !== ''
    if (pinned && already) return true
    if (!pinned && !already) return true
    this.stmts.setTaskPinned.run(pinned ? ts : null, ts, id)
    return true
  }

  appendEvent(taskId: string, kind: TaskEventKind | string, payload: unknown, agentRole?: string): TaskEvent {
    const payloadJson = typeof payload === 'string' ? payload : JSON.stringify(payload)
    return this.appendTx(taskId, kind, payloadJson, agentRole ?? null)
  }

  listEvents(taskId: string, afterSeq?: number): TaskEvent[] {
    return (afterSeq == null
      ? this.stmts.listEvents.all(taskId)
      : this.stmts.listEventsAfter.all(taskId, afterSeq)) as TaskEvent[]
  }

  findInterrupted(): Task[] {
    return this.stmts.findInterrupted.all() as Task[]
  }
}

/**
 * [INPUT]: db.ts 的 DB
 * [OUTPUT]: TaskStore —— tasks / task_events 持久化（事件流是 runtime 的 source of truth）
 * [POS]: §存储层。语义搬自 old_lumen services/tasks.ts；seq 在事务内单调自增
 */
import type { DB } from './db.ts'

export type TaskStatus = 'queued' | 'running' | 'interrupted' | 'done' | 'failed' | 'canceled'

export interface Task {
  id: string
  project_id: string
  goal: string
  status: TaskStatus
  last_error: string | null
  created_at: string
  updated_at: string
  finished_at: string | null
}

export type TaskEventKind =
  | 'status_change'
  | 'context_init'
  | 'model_step'
  | 'tool_call'
  | 'tool_result'
  | 'spawn'
  | 'reply'
  | 'error'
  | 'budget_extension'

export interface TaskEvent {
  id: string
  task_id: string
  seq: number
  kind: string
  payload_json: string
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
    touchTask: ReturnType<DB['prepare']>
    insertEvent: ReturnType<DB['prepare']>
    maxSeq: ReturnType<DB['prepare']>
    listEvents: ReturnType<DB['prepare']>
    listEventsAfter: ReturnType<DB['prepare']>
    findInterrupted: ReturnType<DB['prepare']>
  }
  private readonly appendTx: (taskId: string, kind: string, payloadJson: string) => TaskEvent

  constructor(db: DB) {
    this.db = db
    this.stmts = {
      insertTask: db.prepare(
        'INSERT INTO tasks (id, project_id, goal, status, last_error, created_at, updated_at, finished_at) VALUES (@id,@project_id,@goal,@status,@last_error,@created_at,@updated_at,@finished_at)',
      ),
      getTask: db.prepare('SELECT * FROM tasks WHERE id = ?'),
      listTasks: db.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC'),
      listAllTasks: db.prepare('SELECT * FROM tasks ORDER BY created_at DESC'),
      updateTask: db.prepare('UPDATE tasks SET status=?, last_error=?, finished_at=?, updated_at=? WHERE id=?'),
      touchTask: db.prepare('UPDATE tasks SET updated_at=? WHERE id=?'),
      insertEvent: db.prepare(
        'INSERT INTO task_events (id, task_id, seq, kind, payload_json, created_at) VALUES (?,?,?,?,?,?)',
      ),
      maxSeq: db.prepare('SELECT COALESCE(MAX(seq), 0) AS m FROM task_events WHERE task_id = ?'),
      listEvents: db.prepare('SELECT * FROM task_events WHERE task_id = ? ORDER BY seq ASC'),
      listEventsAfter: db.prepare('SELECT * FROM task_events WHERE task_id = ? AND seq > ? ORDER BY seq ASC'),
      findInterrupted: db.prepare(
        "SELECT * FROM tasks WHERE status IN ('running','interrupted') ORDER BY updated_at DESC",
      ),
    }
    this.appendTx = db.transaction((taskId: string, kind: string, payloadJson: string): TaskEvent => {
      const seq = (this.stmts.maxSeq.get(taskId) as { m: number }).m + 1
      const event: TaskEvent = { id: uuid(), task_id: taskId, seq, kind, payload_json: payloadJson, created_at: now() }
      this.stmts.insertEvent.run(event.id, event.task_id, event.seq, event.kind, event.payload_json, event.created_at)
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

  updateTaskStatus(id: string, status: TaskStatus, lastError: string | null = null): void {
    const ts = now()
    const finishedAt = FINISHED.includes(status) ? ts : null
    this.stmts.updateTask.run(status, lastError, finishedAt, ts, id)
    this.appendEvent(id, 'status_change', { to: status, error: lastError })
  }

  appendEvent(taskId: string, kind: TaskEventKind | string, payload: unknown): TaskEvent {
    const payloadJson = typeof payload === 'string' ? payload : JSON.stringify(payload)
    return this.appendTx(taskId, kind, payloadJson)
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

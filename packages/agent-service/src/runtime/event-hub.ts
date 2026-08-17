/**
 * [INPUT]: TaskStore.appendEvent/listEvents/getTask;session-file;core AgentEvent
 * [OUTPUT]: EventHub —— subscribe/notify/makeEmit/emitUser/notifyStatus/onTaskUpdated
 * [POS]: runtime/ 事件总线。durable 先落库再推送;ephemeral(seq=-1)只 notify 不入库。
 *        AgentRuntime 编排层持有本 hub,不在主文件里再写一套 listeners。
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { AgentEvent } from '../core/types.ts'
import type { ImageData } from '../core/types.ts'
import { EPHEMERAL_EVENT_KINDS, type Task, type TaskEvent, type TaskStore } from '../storage/task-store.ts'
import { appendSessionEntry, type SessionEntry } from '../storage/session-file.ts'
import { sanitizeActivePath, type UploadRef } from './upload-awareness.ts'

export type EventListener = (event: TaskEvent) => void
export type TaskMetaListener = (task: Task) => void

export class EventHub {
  private readonly store: TaskStore
  private readonly sessionDir: string
  private readonly listeners = new Map<string, Set<EventListener>>()
  private readonly taskMetaListeners = new Set<TaskMetaListener>()

  constructor(store: TaskStore, sessionDir: string) {
    this.store = store
    this.sessionDir = sessionDir
  }

  subscribe(taskId: string, listener: EventListener): () => void {
    const set = this.listeners.get(taskId) ?? new Set<EventListener>()
    set.add(listener)
    this.listeners.set(taskId, set)
    return () => {
      set.delete(listener)
      if (set.size === 0) this.listeners.delete(taskId)
    }
  }

  notify(taskId: string, event: TaskEvent): void {
    for (const listener of this.listeners.get(taskId) ?? []) listener(event)
  }

  onTaskUpdated(listener: TaskMetaListener): () => void {
    this.taskMetaListeners.add(listener)
    return () => { this.taskMetaListeners.delete(listener) }
  }

  emitTaskUpdated(task: Task): void {
    for (const listener of this.taskMetaListeners) listener(task)
  }

  /** 发一条 user 事件(进 DB + 实时 notify)。submit/continue 共用。 */
  emitUser(
    taskId: string,
    content: string,
    images?: ImageData[],
    uploads?: UploadRef[],
    activePath?: string | null,
  ): void {
    const safePath = sanitizeActivePath(activePath ?? null)
    const stored = this.store.appendEvent(taskId, 'user', {
      content,
      ...(images?.length ? { images } : {}),
      ...(uploads?.length ? { uploads } : {}),
      ...(safePath ? { activePath: safePath } : {}),
    }, 'main')
    this.notify(taskId, stored)
  }

  makeEmit(taskId: string): (event: AgentEvent) => void {
    return (event: AgentEvent) => {
      if (EPHEMERAL_EVENT_KINDS.has(event.kind)) {
        const live: TaskEvent = {
          id: globalThis.crypto.randomUUID(),
          task_id: taskId,
          seq: -1,
          kind: event.kind,
          payload_json: JSON.stringify(event.payload ?? {}),
          agent_role: event.agentRole,
          created_at: new Date().toISOString(),
        }
        this.notify(taskId, live)
        return
      }
      const stored = this.store.appendEvent(taskId, event.kind, event.payload, event.agentRole)
      for (const entry of toSessionEntries(taskId, event)) appendSessionEntry(this.sessionDir, entry)
      this.notify(taskId, stored)
    }
  }

  /** 终态:把最后一条 status_change 推给订阅者,并广播 task_updated */
  notifyStatus(taskId: string): void {
    const events = this.store.listEvents(taskId)
    const last = events[events.length - 1]
    if (last && last.kind === 'status_change') this.notify(taskId, last)
    const task = this.store.getTask(taskId)
    if (task) this.emitTaskUpdated(task)
  }
}

function toSessionEntries(taskId: string, event: AgentEvent): SessionEntry[] {
  const timestamp = new Date().toISOString()
  const agent = event.agentRole !== 'main' ? { agent: event.agentRole } : {}
  if (event.kind === 'model_step') {
    const p = event.payload as { content?: string; toolCalls?: unknown[] }
    return [{ type: 'assistant', task_id: taskId, timestamp, content: p.content ?? '', ...(p.toolCalls?.length ? { tool_calls: p.toolCalls } : {}), ...agent }]
  }
  if (event.kind === 'tool_result') {
    const p = event.payload as { id?: string; name?: string; llmContent?: string }
    return [{ type: 'tool_result', task_id: taskId, timestamp, tool_call_id: p.id ?? '', tool: p.name ?? '', content: p.llmContent ?? '', ...agent }]
  }
  if (event.kind === 'error') {
    const p = event.payload as { error?: string }
    return [{ type: 'error', task_id: taskId, timestamp, error: p.error ?? '' }]
  }
  return []
}

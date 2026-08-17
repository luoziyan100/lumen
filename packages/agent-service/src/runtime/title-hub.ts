/**
 * [INPUT]: TaskStore;task-title 纯函数;EventHub.emitTaskUpdated
 * [OUTPUT]: TitleHub —— scheduleTitleIfNeeded / enqueueTitleBackfill
 * [POS]: runtime/ 侧栏标题回填。与对话共用 ModelPort,execute 终态 await 以免抢调用。
 *        从 agent-runtime 切出以满足单文件 ≤800。
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { ModelPort } from '../core/model-port.ts'
import type { Task, TaskStore } from '../storage/task-store.ts'
import {
  extractTitleSource,
  generateTaskTitle,
  shouldBackfillTitle,
} from './task-title.ts'

export class TitleHub {
  private readonly store: TaskStore
  private readonly defaultModel: () => ModelPort
  private readonly emitTaskUpdated: (task: Task) => void
  private readonly inflight = new Set<string>()
  private backfillActive = 0
  private readonly backfillQueue: Array<{ taskId: string; model?: ModelPort }> = []

  constructor(
    store: TaskStore,
    defaultModel: () => ModelPort,
    emitTaskUpdated: (task: Task) => void,
  ) {
    this.store = store
    this.defaultModel = defaultModel
    this.emitTaskUpdated = emitTaskUpdated
  }

  enqueueTitleBackfill(tasks: Task[], model?: ModelPort): void {
    for (const t of tasks) {
      if (!shouldBackfillTitle(t)) continue
      if (this.inflight.has(t.id)) continue
      this.backfillQueue.push({ taskId: t.id, model })
    }
    void this.pump()
  }

  scheduleTitleIfNeeded(taskId: string, model?: ModelPort): Promise<void> {
    const task = this.store.getTask(taskId)
    if (!task) return Promise.resolve()
    if (task.title != null && String(task.title).trim() !== '') return Promise.resolve()
    if (this.inflight.has(taskId)) return Promise.resolve()
    const source = extractTitleSource(this.store.listEvents(taskId))
    if (!source) return Promise.resolve()
    this.inflight.add(taskId)
    const port = model ?? this.defaultModel()
    return generateTaskTitle(port, source, task.goal)
      .then((title) => {
        if (!title) return
        const latest = this.store.getTask(taskId)
        if (!latest) return
        if (latest.title != null && String(latest.title).trim() !== '') return
        if (!this.store.updateTaskTitle(taskId, title)) return
        const updated = this.store.getTask(taskId)
        if (updated) this.emitTaskUpdated(updated)
      })
      .finally(() => {
        this.inflight.delete(taskId)
      })
  }

  private async pump(): Promise<void> {
    if (this.backfillActive >= 1) return
    const job = this.backfillQueue.shift()
    if (!job) return
    this.backfillActive++
    try {
      await this.scheduleTitleIfNeeded(job.taskId, job.model)
    } finally {
      this.backfillActive--
      void this.pump()
    }
  }
}

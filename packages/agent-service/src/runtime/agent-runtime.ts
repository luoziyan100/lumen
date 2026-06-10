/**
 * [INPUT]: core（runAgent/Thread/spawn）、storage（TaskStore/session/budget/resume）、workspace（FsWorkspace）
 * [OUTPUT]: AgentRuntime —— 把内核、存储、工作区、worker 角色拼成可执行、可订阅、可恢复的任务运行时
 * [POS]: §4 运行环境。一个任务 = 一次 runAgent；emit 同时落 task_events + session jsonl + 通知订阅者（WS）
 */
import { Thread, type ForModelOptions } from '../core/thread.ts'
import { runAgent } from '../core/loop.ts'
import { createSpawnFn, spawnTool, type RoleDef } from '../core/spawn.ts'
import type { ModelPort } from '../core/model-port.ts'
import type { AgentEvent } from '../core/types.ts'
import type { Tool, ToolContext } from '../core/tool.ts'
import type { Limits } from '../core/limits.ts'
import { TaskStore, type Task, type TaskEvent } from '../storage/task-store.ts'
import { appendSessionEntry, type SessionEntry } from '../storage/session-file.ts'
import { rebuildThread } from '../storage/resume.ts'
import { mergeBudget, type TaskBudget } from '../storage/budget.ts'
import { FsWorkspace } from '../workspace/fs-workspace.ts'

export interface RuntimeContextInfo {
  currentDate: string
  localPaperCount: number
}

export interface AgentRuntimeConfig {
  store: TaskStore
  model: ModelPort
  sessionDir: string
  workspacesDir: string
  libraryRoot?: string
  mainTools: Tool[]
  roles?: Record<string, RoleDef>
  budget?: Partial<TaskBudget>
  maxDepth?: number
  buildSystemPrompt?: (info: RuntimeContextInfo) => string
  contextInfo?: () => RuntimeContextInfo
  /** 上下文折叠；不传用 DEFAULT_CONTEXT_FOLD。显式传 {} 可关闭（测试用） */
  contextFold?: ForModelOptions
}

/** 长任务不撑爆上下文的泄压阀：老 tool_result 超 8000 字符折叠，最近 6 条豁免 */
export const DEFAULT_CONTEXT_FOLD: ForModelOptions = { maxToolResultChars: 8000, keepRecentToolResults: 6 }

export interface SubmitInput {
  projectId: string
  userText: string
}

type Listener = (event: TaskEvent) => void

function defaultSystemPrompt(info: RuntimeContextInfo): string {
  return [
    '你是 Lumen 的研究 agent，面向独立研究者。',
    `今天是 ${info.currentDate}。本地论文库有 ${info.localPaperCount} 篇。`,
    '你有工作区文件工具（read_file/write_file/edit_file/list_dir/grep/glob）与研究工具。',
    '把检索到的内容、笔记、草稿写进工作区文件，需要时再读回——不要把所有内容堆在对话里。',
    '事实性结论要能追溯到来源。完成后直接给用户简洁的中文回答。',
  ].join('\n')
}

export class AgentRuntime {
  private readonly cfg: AgentRuntimeConfig
  private readonly listeners = new Map<string, Set<Listener>>()
  private readonly running = new Map<string, { controller: AbortController; promise: Promise<void> }>()

  constructor(config: AgentRuntimeConfig) {
    this.cfg = config
  }

  submit(input: SubmitInput): string {
    const task = this.cfg.store.createTask(input.projectId, input.userText)
    this.startSession(task, input.userText)
    const controller = new AbortController()
    const promise = this.execute(task, this.buildInitialThread(task, input.userText), controller.signal)
    this.running.set(task.id, { controller, promise })
    return task.id
  }

  async resume(taskId: string): Promise<boolean> {
    const task = this.cfg.store.getTask(taskId)
    if (!task) return false
    if (this.running.has(taskId)) return true
    const events = this.cfg.store.listEvents(taskId)
    const thread = rebuildThread(events, {
      systemPrompt: this.systemPrompt(),
      userText: task.goal,
    })
    const controller = new AbortController()
    const promise = this.execute(task, thread, controller.signal)
    this.running.set(taskId, { controller, promise })
    return true
  }

  cancel(taskId: string): void {
    this.running.get(taskId)?.controller.abort()
  }

  isRunning(taskId: string): boolean {
    return this.running.has(taskId)
  }

  listTasks(projectId?: string): Task[] {
    return this.cfg.store.listTasks(projectId)
  }

  listEvents(taskId: string, afterSeq?: number): TaskEvent[] {
    return this.cfg.store.listEvents(taskId, afterSeq)
  }

  subscribe(taskId: string, listener: Listener): () => void {
    const set = this.listeners.get(taskId) ?? new Set<Listener>()
    set.add(listener)
    this.listeners.set(taskId, set)
    return () => {
      set.delete(listener)
      if (set.size === 0) this.listeners.delete(taskId)
    }
  }

  async waitFor(taskId: string): Promise<void> {
    await this.running.get(taskId)?.promise
  }

  /** 等所有在跑任务结束（测试/优雅关停用） */
  async drain(): Promise<void> {
    await Promise.all([...this.running.values()].map((r) => r.promise))
  }

  /**
   * 服务启动时调用：上个进程死亡时仍 'running' 的任务标记为 interrupted（可 resume）。
   * 不自动续跑——续跑花钱，交给用户/UI 决定。
   */
  sweepInterrupted(): number {
    let swept = 0
    for (const task of this.cfg.store.findInterrupted()) {
      if (task.status === 'running' && !this.running.has(task.id)) {
        this.cfg.store.updateTaskStatus(task.id, 'interrupted', '服务中断时任务未完成；resume 可续跑')
        swept += 1
      }
    }
    return swept
  }

  // ---- internals ----

  private systemPrompt(): string {
    const info = this.cfg.contextInfo?.() ?? { currentDate: new Date().toISOString().slice(0, 10), localPaperCount: 0 }
    return (this.cfg.buildSystemPrompt ?? defaultSystemPrompt)(info)
  }

  private buildInitialThread(_task: Task, userText: string): Thread {
    return new Thread([
      { role: 'system', content: this.systemPrompt() },
      { role: 'user', content: userText },
    ])
  }

  private startSession(task: Task, userText: string): void {
    const ts = new Date().toISOString()
    appendSessionEntry(this.cfg.sessionDir, {
      type: 'session_start', task_id: task.id, timestamp: ts, user_text: userText, project_id: task.project_id,
    })
    appendSessionEntry(this.cfg.sessionDir, { type: 'user', task_id: task.id, timestamp: ts, content: userText })
  }

  private makeWorkspace(projectId: string): FsWorkspace {
    return new FsWorkspace({
      root: `${this.cfg.workspacesDir}/${projectId}`,
      libraryRoot: this.cfg.libraryRoot,
    })
  }

  private makeEmit(taskId: string): (event: AgentEvent) => void {
    return (event: AgentEvent) => {
      const stored = this.cfg.store.appendEvent(taskId, event.kind, event.payload, event.agentRole)
      for (const entry of toSessionEntries(taskId, event)) appendSessionEntry(this.cfg.sessionDir, entry)
      this.notify(taskId, stored)
    }
  }

  private notify(taskId: string, event: TaskEvent): void {
    for (const listener of this.listeners.get(taskId) ?? []) listener(event)
  }

  private async execute(task: Task, thread: Thread, signal: AbortSignal): Promise<void> {
    const startedAt = Date.now()
    const emit = this.makeEmit(task.id)
    const budget = mergeBudget(this.cfg.budget)
    const limits: Limits = { maxSteps: budget.maxSteps, maxDepth: this.cfg.maxDepth ?? 3, maxSeconds: budget.maxSeconds }
    const workspace = this.makeWorkspace(task.project_id)
    const spawn = createSpawnFn({
      model: this.cfg.model,
      roles: this.cfg.roles ?? {},
      maxDepth: limits.maxDepth,
    })
    const ctx: ToolContext = {
      taskId: task.id,
      agentRole: 'main',
      depth: 0,
      spawn,
      emit,
      workspace,
      deps: { model: this.cfg.model },
    }
    const tools = this.cfg.roles && Object.keys(this.cfg.roles).length ? [...this.cfg.mainTools, spawnTool] : this.cfg.mainTools

    try {
      this.cfg.store.updateTaskStatus(task.id, 'running')
      this.notifyStatus(task.id)
      const result = await runAgent({
        thread, model: this.cfg.model, tools, limits, ctx, signal,
        forModelOptions: this.cfg.contextFold ?? DEFAULT_CONTEXT_FOLD,
      })
      // exhausted ≠ done：预算耗尽是"可续跑的中断"，不能伪装成完成（reply 是空的）
      const status = result.status === 'done' ? 'done'
        : result.status === 'aborted' ? 'canceled'
          : result.status === 'exhausted' ? 'interrupted'
            : 'failed'
      const lastError = result.status === 'error' ? result.reply
        : result.status === 'exhausted' ? '预算耗尽（步数或墙钟）；resume 可续跑' : null
      this.cfg.store.updateTaskStatus(task.id, status, lastError)
      this.notifyStatus(task.id)
      this.endSession(task.id, status, Date.now() - startedAt)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.cfg.store.updateTaskStatus(task.id, 'failed', message)
      this.notifyStatus(task.id)
      appendSessionEntry(this.cfg.sessionDir, { type: 'error', task_id: task.id, timestamp: new Date().toISOString(), error: message })
      this.endSession(task.id, 'failed', Date.now() - startedAt)
    } finally {
      this.running.delete(task.id)
    }
  }

  private notifyStatus(taskId: string): void {
    const events = this.cfg.store.listEvents(taskId)
    const last = events[events.length - 1]
    if (last && last.kind === 'status_change') this.notify(taskId, last)
  }

  private endSession(taskId: string, status: string, durationMs: number): void {
    appendSessionEntry(this.cfg.sessionDir, {
      type: 'session_end', task_id: taskId, timestamp: new Date().toISOString(), status, duration_ms: durationMs,
    })
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

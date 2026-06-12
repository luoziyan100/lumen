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
import { readdirSync } from 'node:fs'
import { LUMEN_PERSONA } from '../agents/persona.ts'

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

/** 侧栏要显示的"会话资产":论文 PDF 原件 / 模型生成的文档(.md) */
export interface WorkspaceAsset {
  path: string
  kind: 'pdf' | 'doc'
  name: string
}

type Listener = (event: TaskEvent) => void

function defaultSystemPrompt(info: RuntimeContextInfo): string {
  // 人格(剧本)+ 运行时上下文。人格在 agents/persona.ts,改动需经 owner。
  return `${LUMEN_PERSONA}\n\n# 此刻\n今天是 ${info.currentDate}。本地论文库有 ${info.localPaperCount} 篇。`
}

export class AgentRuntime {
  private readonly cfg: AgentRuntimeConfig
  private readonly listeners = new Map<string, Set<Listener>>()
  private readonly running = new Map<string, { controller: AbortController; promise: Promise<void> }>()

  constructor(config: AgentRuntimeConfig) {
    this.cfg = config
  }

  /** 发一条 user 事件(进 DB + 实时 notify 已订阅的客户端)。submit/continue 共用,
   *  保证多轮记忆与刷新重建看到的是同一条事件流。 */
  private emitUser(taskId: string, content: string): void {
    const stored = this.cfg.store.appendEvent(taskId, 'user', { content }, 'main')
    this.notify(taskId, stored)
  }

  submit(input: SubmitInput): string {
    const task = this.cfg.store.createTask(input.projectId, input.userText)
    this.emitUser(task.id, input.userText) // 首句进事件流,多轮重建 + 刷新恢复用
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
      systemPrompt: this.systemPrompt(task.project_id),
      userText: task.goal,
    })
    const controller = new AbortController()
    const promise = this.execute(task, thread, controller.signal)
    this.running.set(taskId, { controller, promise })
    return true
  }

  /** 在已有对话(task)上追加一轮:存 user 事件 → 重建累积线程 → 续跑。多轮记忆的实现。 */
  continueTask(taskId: string, userText: string): boolean {
    const task = this.cfg.store.getTask(taskId)
    if (!task) return false
    if (this.running.has(taskId)) return false
    this.emitUser(taskId, userText)
    appendSessionEntry(this.cfg.sessionDir, {
      type: 'user', task_id: taskId, timestamp: new Date().toISOString(), content: userText,
    })
    const events = this.cfg.store.listEvents(taskId)
    const thread = rebuildThread(events, { systemPrompt: this.systemPrompt(task.project_id), userText: task.goal })
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

  /** 列本 project 工作区的"会话资产":论文 PDF 原件 + 生成的 .md(过滤 txt 抽取中间物与检索缓存) */
  async listAssets(projectId: string): Promise<WorkspaceAsset[]> {
    const ws = this.makeWorkspace(projectId)
    const base = (p: string): string => p.split('/').pop() ?? p
    const pdfs = (await ws.glob('**/*.pdf').catch(() => [] as string[]))
      .map((p) => ({ path: p, kind: 'pdf' as const, name: base(p) }))
    const docs = (await ws.glob('**/*.md').catch(() => [] as string[]))
      .filter((p) => !/(^|\/)search-/.test(p)) // 排除 search-*.md 检索缓存
      .map((p) => ({ path: p, kind: 'doc' as const, name: base(p) }))
    return [...pdfs, ...docs]
  }

  /** 读一个文本资产(.md)。PDF 二进制走 HTTP /pdf,不经这里 */
  async readAsset(projectId: string, path: string): Promise<string | null> {
    try {
      return await this.makeWorkspace(projectId).readFile(path)
    } catch {
      return null
    }
  }

  /** 取资产二进制(PDF 原件),供 HTTP /pdf 给前端 pdf.js 渲染。路径经沙箱校验 */
  async readAssetBytes(projectId: string, path: string): Promise<Uint8Array | null> {
    try {
      return await this.makeWorkspace(projectId).readBytes(path)
    } catch {
      return null
    }
  }

  /** 用户上传的 PDF 存进工作区 papers/(原件),返回工作区相对路径 */
  async saveUpload(projectId: string, name: string, bytes: Uint8Array): Promise<string> {
    const safe = (name.split(/[/\\]/).pop() || 'upload').replace(/[^\w.\-]/g, '_')
    const file = `papers/${/\.pdf$/i.test(safe) ? safe : `${safe}.pdf`}`
    await this.makeWorkspace(projectId).writeBytes(file, bytes)
    return file
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

  private systemPrompt(projectId?: string): string {
    const info = this.cfg.contextInfo?.() ?? { currentDate: new Date().toISOString().slice(0, 10), localPaperCount: 0 }
    const base = (this.cfg.buildSystemPrompt ?? defaultSystemPrompt)(info)
    const digest = projectId ? this.workspaceDigest(projectId) : ''
    return digest ? `${base}\n\n${digest}` : base
  }

  /** 列本 project 工作区的文件清单,注入 systemPrompt——让模型知道有哪些 PDF/笔记可直接读;
   *  否则用户说"那篇论文"模型不知指哪个、会误答"你没附上"。 */
  private workspaceDigest(projectId: string): string {
    const root = `${this.cfg.workspacesDir}/${projectId}`
    const pdfs: string[] = []
    const docs: string[] = []
    const scan = (dir: string, prefix: string): void => {
      try {
        for (const f of readdirSync(dir)) {
          if (f.endsWith('.pdf')) pdfs.push(`${prefix}${f}`)
          else if (f.endsWith('.md')) docs.push(`${prefix}${f}`)
        }
      } catch { /* 目录不存在,跳过 */ }
    }
    scan(`${root}/papers`, 'papers/')
    scan(root, '')
    scan(`${root}/notes`, 'notes/')
    if (!pdfs.length && !docs.length) return ''
    const lines = ['# 工作区文件（已在本项目里,可直接读取,不用让用户重新提供）']
    if (pdfs.length) lines.push('论文 PDF（用 extract_pdf(source=路径) 读正文）:', ...pdfs.map((p) => `- ${p}`))
    if (docs.length) lines.push('笔记/产物（用 read_file 读）:', ...docs.map((d) => `- ${d}`))
    lines.push('用户说"这篇/那篇 X 论文"多半就指上面某个 PDF——据年份/作者匹配文件名,先 extract_pdf 读它再答,别说"你没附上"。')
    return lines.join('\n')
  }

  private buildInitialThread(task: Task, userText: string): Thread {
    return new Thread([
      { role: 'system', content: this.systemPrompt(task.project_id) },
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

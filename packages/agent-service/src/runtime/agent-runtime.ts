/**
 * [INPUT]: core（runAgent/Thread/spawn）、storage（TaskStore/session/budget/resume）、workspace（FsWorkspace）
 * [OUTPUT]: AgentRuntime —— 把内核、存储、工作区、worker 角色拼成可执行、可订阅、可恢复的任务运行时
 * [POS]: §4 运行环境。一个任务 = 一次 runAgent；emit 同时落 task_events + session jsonl + 通知订阅者（WS）
 */
import { Thread, type ForModelOptions } from '../core/thread.ts'
import { runAgent } from '../core/loop.ts'
import { createSpawnFn, spawnTool, type RoleDef } from '../core/spawn.ts'
import type { ModelPort } from '../core/model-port.ts'
import type { AgentEvent, ImageData } from '../core/types.ts'
import type { Tool, ToolContext } from '../core/tool.ts'
import type { Limits } from '../core/limits.ts'
import { TaskStore, type Task, type TaskEvent } from '../storage/task-store.ts'
import { appendSessionEntry, type SessionEntry } from '../storage/session-file.ts'
import { rebuildThread } from '../storage/resume.ts'
import { DEFAULT_COMPACTION, estimateWatermark, isContextOverflowError, planCompaction, withResultPersist, type CompactionPayload } from '../storage/context-budget.ts'
import { mergeBudget, type TaskBudget } from '../storage/budget.ts'
import { FsWorkspace } from '../workspace/fs-workspace.ts'
import { readdirSync } from 'node:fs'
import { LUMEN_PERSONA } from '../agents/persona.ts'
import { createMemoryTools, readMemoryIndex } from '../tools/env/memory-tools.ts'

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
  /** 上下文预算(方案 B,owner 拍板 2026-07-14):不传或无 window = 整套水位/压缩/落盘不启用,行为与旧版一致 */
  contextBudget?: {
    window?: () => number
    triggerRatio?: number
    keepRecentTokens?: number
    userVerbatimTokens?: number
    persistToolResultChars?: number
  }
}

/** 长任务不撑爆上下文的泄压阀：老 tool_result 超 8000 字符折叠，最近 6 条豁免 */
export const DEFAULT_CONTEXT_FOLD: ForModelOptions = { maxToolResultChars: 8000, keepRecentToolResults: 6 }

export interface SubmitInput {
  projectId: string
  userText: string
  images?: ImageData[] // 粘贴/上传进对话的图片,随 user 消息进模型
}

/** 侧栏要显示的"会话资产":论文 PDF / 文档 / 图片 / 其它上传件 */
export interface WorkspaceAsset {
  path: string
  kind: 'pdf' | 'doc' | 'html' | 'image' | 'file'
  name: string
}

type Listener = (event: TaskEvent) => void

export function defaultSystemPrompt(info: RuntimeContextInfo): string {
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
   *  保证多轮记忆与刷新重建看到的是同一条事件流。图片持久化在 payload 里,重建/恢复不丢图。 */
  private emitUser(taskId: string, content: string, images?: ImageData[]): void {
    const stored = this.cfg.store.appendEvent(taskId, 'user', { content, ...(images?.length ? { images } : {}) }, 'main')
    this.notify(taskId, stored)
  }

  submit(input: SubmitInput): string {
    const task = this.cfg.store.createTask(input.projectId, input.userText)
    this.emitUser(task.id, input.userText, input.images) // 首句进事件流,多轮重建 + 刷新恢复用
    this.startSession(task, input.userText)
    const controller = new AbortController()
    const promise = this.execute(task, this.buildInitialThread(task, input.userText, input.images), controller.signal)
    this.running.set(task.id, { controller, promise })
    return task.id
  }

  /** 草稿会话:只建档(status=queued)不开跑。新对话先上传文件用;首条消息由 continueTask 续上。 */
  createDraft(projectId: string, goal: string): string {
    return this.cfg.store.createTask(projectId, goal).id
  }

  async resume(taskId: string): Promise<boolean> {
    const task = this.cfg.store.getTask(taskId)
    if (!task) return false
    if (this.running.has(taskId)) return true
    const events = this.cfg.store.listEvents(taskId)
    const compacted = this.maybeCompact(task, events) // 回合前水位检查(方案 B)
    const thread = rebuildThread(compacted ?? events, {
      systemPrompt: this.systemPrompt(task.project_id),
      userText: task.goal,
    })
    const controller = new AbortController()
    const promise = this.execute(task, thread, controller.signal)
    this.running.set(taskId, { controller, promise })
    return true
  }

  /** 在已有对话(task)上追加一轮:存 user 事件 → 重建累积线程 → 续跑。多轮记忆的实现。 */
  continueTask(taskId: string, userText: string, images?: ImageData[]): boolean {
    const task = this.cfg.store.getTask(taskId)
    if (!task) return false
    if (this.running.has(taskId)) return false
    this.emitUser(taskId, userText, images)
    appendSessionEntry(this.cfg.sessionDir, {
      type: 'user', task_id: taskId, timestamp: new Date().toISOString(), content: userText,
    })
    const events = this.cfg.store.listEvents(taskId)
    const compacted = this.maybeCompact(task, events) // 回合前水位检查(方案 B)
    const thread = rebuildThread(compacted ?? events, { systemPrompt: this.systemPrompt(task.project_id), userText: task.goal })
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

  /** 列工作区"会话资产":带 taskId 列该会话独立目录;一次遍历按扩展名分类(大小写不敏感),过滤检索缓存 */
  async listAssets(projectId: string, taskId?: string): Promise<WorkspaceAsset[]> {
    const ws = this.makeWorkspace(projectId, taskId)
    const base = (p: string): string => p.split('/').pop() ?? p
    const raw = await ws.glob('**/*').catch(() => [] as string[])
    // 项目根视图不混入各会话的独立目录(会话内相对路径不带 sessions/ 前缀,此过滤对会话视图无影响);
    // cache/ = 模型的中间产物(extract_pdf 提取文本等),只给模型读,不对用户陈列
    const all = raw.filter((p) => !p.startsWith('sessions/') && !p.startsWith('cache/'))

    const TEXT_EXT = ['txt', 'tex', 'csv', 'json']
    const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif']
    const assets: WorkspaceAsset[] = []
    for (const p of all) {
      const ext = (p.match(/\.([A-Za-z0-9]+)$/)?.[1] ?? '').toLowerCase()
      if (ext === 'pdf') assets.push({ path: p, kind: 'pdf', name: base(p) })
      else if (ext === 'md' && !/(^|\/)search-/.test(p)) assets.push({ path: p, kind: 'doc', name: base(p) })
      else if (ext === 'html' || ext === 'htm') assets.push({ path: p, kind: 'html', name: base(p) })
      else if (TEXT_EXT.includes(ext) && p.startsWith('docs/')) assets.push({ path: p, kind: 'doc', name: base(p) })
      else if (IMAGE_EXT.includes(ext)) assets.push({ path: p, kind: 'image', name: base(p) })
      // 其它格式原样存进 uploads/(agent 暂不解析,先无损保存)
      else if (p.startsWith('uploads/')) assets.push({ path: p, kind: 'file', name: base(p) })
    }
    return assets
  }

  /** 读一个文本资产(.md)。PDF 二进制走 HTTP /pdf,不经这里 */
  async readAsset(projectId: string, path: string, taskId?: string): Promise<string | null> {
    try {
      return await this.makeWorkspace(projectId, taskId).readFile(path)
    } catch {
      return null
    }
  }

  /** 取资产二进制(PDF 原件),供 HTTP /pdf 给前端 pdf.js 渲染。路径经沙箱校验 */
  async readAssetBytes(projectId: string, path: string, taskId?: string): Promise<Uint8Array | null> {
    try {
      return await this.makeWorkspace(projectId, taskId).readBytes(path)
    } catch {
      return null
    }
  }

  /** 用户上传文件按类型归位:PDF→papers/ 文本→docs/ 图片→images/ 其它→uploads/(无损保存,先存后判) */
  async saveUpload(projectId: string, name: string, bytes: Uint8Array, taskId?: string): Promise<string> {
    const safe = (name.split(/[/\\]/).pop() || 'upload').replace(/[^\w.\-一-鿿]/g, '_')
    const ext = (safe.match(/\.([A-Za-z0-9]+)$/)?.[1] ?? '').toLowerCase()
    const dir = ext === 'pdf' ? 'papers'
      : ['md', 'txt', 'tex', 'csv', 'json', 'html'].includes(ext) ? 'docs'
        : ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) ? 'images'
          : 'uploads'
    const file = `${dir}/${safe}`
    await this.makeWorkspace(projectId, taskId).writeBytes(file, bytes)
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
    // 工作区"房间地图"已写进 persona L3(静态、稳定)。动态注入暂时关掉:
    // 裸列文件名既占 context 又会随文件膨胀;以后可让 workspaceDigest 改成注入"非文件名"的信息
    // (论文标题/摘要、数量统计等)再在此启用。projectId 先留着接口。
    // 跨会话记忆(CC 范式,owner 拍板 2026-07-15):索引常驻开局,正文按需 read_memory
    const memory = projectId ? readMemoryIndex(this.memoryDir(projectId)) : ''
    if (!memory) return base
    return base + '\n\n# 跨会话记忆(索引)\n' +
      '以下是你此前为本项目记下的长期记忆,一行一条。需要正文用 read_memory(文件名);' +
      '遇到值得长期记住的事实(用户偏好/纠正/项目约定,而非对话内容本身)用 write_memory 记录并同步更新 MEMORY.md。' +
      '记忆对用户完全可见。\n' + memory
  }

  /** 项目级记忆目录(跨会话):workspaces/<project>/memory */
  private memoryDir(projectId: string): string {
    return this.cfg.workspacesDir + '/' + projectId + '/memory'
  }

  /** [暂未启用,保留待改造] 原本列工作区文件清单注入 systemPrompt;现"房间地图"已进 persona L3。
   *  以后改成注入"非文件名"信息(论文标题/摘要、数量统计等)而非裸列文件名,再到 systemPrompt 里启用。 */
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

  private buildInitialThread(task: Task, userText: string, images?: ImageData[]): Thread {
    return new Thread([
      { role: 'system', content: this.systemPrompt(task.project_id) },
      { role: 'user', content: userText, ...(images?.length ? { images } : {}) },
    ])
  }

  private startSession(task: Task, userText: string): void {
    const ts = new Date().toISOString()
    appendSessionEntry(this.cfg.sessionDir, {
      type: 'session_start', task_id: task.id, timestamp: ts, user_text: userText, project_id: task.project_id,
    })
    appendSessionEntry(this.cfg.sessionDir, { type: 'user', task_id: task.id, timestamp: ts, content: userText })
  }

  /** 工作区定根:带 taskId = 会话独立目录(owner 拍板 2026-07-05);不带 = 项目根(兼容旧语义/旧数据) */
  private makeWorkspace(projectId: string, taskId?: string): FsWorkspace {
    const root = taskId
      ? `${this.cfg.workspacesDir}/${projectId}/sessions/${taskId}`
      : `${this.cfg.workspacesDir}/${projectId}`
    return new FsWorkspace({ root, libraryRoot: this.cfg.libraryRoot })
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
    const workspace = this.makeWorkspace(task.project_id, task.id)
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
    const memoryTools = createMemoryTools(this.memoryDir(task.project_id)) // 跨会话记忆:仅主 agent,worker 不带
    const mains = [...this.cfg.mainTools, ...memoryTools]
    const baseTools = this.cfg.roles && Object.keys(this.cfg.roles).length ? [...mains, spawnTool] : mains
    // 大结果落盘(方案 B):启用预算时,超限工具输出全文进会话 cache/tool-results/,上下文只留预览+路径
    const tools = this.cfg.contextBudget?.window
      ? baseTools.map((t) => withResultPersist(t, workspace, this.cfg.contextBudget?.persistToolResultChars))
      : baseTools

    try {
      this.cfg.store.updateTaskStatus(task.id, 'running')
      this.notifyStatus(task.id)
      let result = await runAgent({
        thread, model: this.cfg.model, tools, limits, ctx, signal,
        forModelOptions: this.cfg.contextFold ?? DEFAULT_CONTEXT_FOLD,
      })
      // 软着陆(方案 B):超窗错误 → 确定性压缩后原地重试一次。已完成的 tool_result 都在事件流里,进度不丢
      if (result.status === 'error' && this.cfg.contextBudget?.window && isContextOverflowError(result.reply)) {
        const events = this.cfg.store.listEvents(task.id)
        const compacted = this.appendCompaction(task, events, estimateWatermark(events).estimatedTotal)
        if (compacted) {
          const rebuilt = rebuildThread(compacted, { systemPrompt: this.systemPrompt(task.project_id), userText: task.goal })
          result = await runAgent({
            thread: rebuilt, model: this.cfg.model, tools, limits, ctx, signal,
            forModelOptions: this.cfg.contextFold ?? DEFAULT_CONTEXT_FOLD,
          })
        }
        if (result.status === 'error' && isContextOverflowError(result.reply)) {
          result = { ...result, reply: '会话上下文已满:自动整理后仍超出模型窗口。请开新对话继续(工作区文件都在),或在设置中换更大窗口的模型。' }
        }
      }
      // exhausted ≠ done：预算耗尽是"可续跑的中断"，不能伪装成完成（reply 是空的）
      const status = result.status === 'done' ? 'done'
        : result.status === 'aborted' ? 'canceled'
          : result.status === 'exhausted' ? 'interrupted'
            : 'failed'
      const lastError = result.status === 'error' ? result.reply
        : result.status === 'exhausted' ? '预算耗尽（步数或墙钟）；resume 可续跑' : null
      this.cfg.store.updateTaskStatus(task.id, status, lastError)
      this.notifyStatus(task.id)
      this.emitContextUsage(task.id) // 水位事件(方案 B):UI 仪表用
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

  /** 回合前水位检查:超阈值 → 追加确定性压缩事件并返回最新事件列表;否则 null(沿用原 events) */
  private maybeCompact(task: Task, events: TaskEvent[]): TaskEvent[] | null {
    const window = this.cfg.contextBudget?.window?.() ?? 0
    if (!window) return null
    const ratio = this.cfg.contextBudget?.triggerRatio ?? 0.85
    const wm = estimateWatermark(events, this.systemPrompt(task.project_id).length)
    if (wm.estimatedTotal < window * ratio) return null
    return this.appendCompaction(task, events, wm.estimatedTotal)
  }

  /** 落一条 compaction 事件(切点+清单+用户原话,全部确定性生成、零模型参与) */
  private appendCompaction(task: Task, events: TaskEvent[], estTokensBefore: number): TaskEvent[] | null {
    const plan = planCompaction(events, {
      keepRecentTokens: this.cfg.contextBudget?.keepRecentTokens ?? DEFAULT_COMPACTION.keepRecentTokens,
      userVerbatimTokens: this.cfg.contextBudget?.userVerbatimTokens ?? DEFAULT_COMPACTION.userVerbatimTokens,
    })
    if (!plan) return null
    const payload: CompactionPayload = {
      cutFromSeq: plan.cutFromSeq,
      manifest: this.workspaceManifest(task.project_id, task.id),
      verbatimUsers: plan.verbatimUsers,
      archivedEvents: plan.archivedEvents,
      estTokensBefore,
    }
    const stored = this.cfg.store.appendEvent(task.id, 'compaction', payload, 'main')
    this.notify(task.id, stored)
    return this.cfg.store.listEvents(task.id)
  }

  /** 工作区清单(代码生成):会话目录 + 项目根的文件相对路径,上限 60 行 */
  private workspaceManifest(projectId: string, taskId: string): string {
    const lines: string[] = []
    const scan = (root: string, prefix: string): void => {
      if (lines.length >= 60) return
      try {
        for (const f of readdirSync(root, { withFileTypes: true })) {
          if (lines.length >= 60) return
          if (f.name.startsWith('.')) continue
          if (f.isDirectory()) {
            if (!['cache', 'sessions', 'node_modules'].includes(f.name)) scan(root + '/' + f.name, prefix + f.name + '/')
          } else {
            lines.push('- ' + prefix + f.name)
          }
        }
      } catch { /* 目录不存在,跳过 */ }
    }
    scan(this.cfg.workspacesDir + '/' + projectId + '/sessions/' + taskId, '')
    scan(this.cfg.workspacesDir + '/' + projectId, '')
    return lines.join('\n')
  }

  /** 每回合结束落一条水位事件(真实 promptTokens 锚点 + 估算/窗口/比例) */
  private emitContextUsage(taskId: string): void {
    const window = this.cfg.contextBudget?.window?.()
    if (!window) return
    const wm = estimateWatermark(this.cfg.store.listEvents(taskId))
    const stored = this.cfg.store.appendEvent(taskId, 'context_usage', {
      promptTokens: wm.promptTokens,
      estimatedTotal: wm.estimatedTotal,
      window,
      ratio: Math.min(1, wm.estimatedTotal / window),
    }, 'main')
    this.notify(taskId, stored)
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

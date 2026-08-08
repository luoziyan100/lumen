/**
 * [INPUT]: core（runAgent/Thread/spawn）、storage（TaskStore/session/budget/resume）、workspace（FsWorkspace）;
 *          ask-user-tools 的 AskUserAnswer / AskUserWaiter
 * [OUTPUT]: AgentRuntime —— 把内核、存储、工作区、worker 角色拼成可执行、可订阅、可恢复的任务运行时;
 *           answerUser 解开 ask_user 挂起;
 *           listSkills/installSkill/uninstallSkill/activateSkillOnTask(与 run_skill 同构回灌);
 *           侧栏 task.title 异步生成(≠ goal;见 task-title.ts);renameTaskTitle 人手改 title
 * [POS]: §4 运行环境。一个任务 = 一次 runAgent；durable emit 落 task_events + session jsonl + WS;
 *        text_delta/tool_call_start 仅 notify(不入库);imageBridge DeepSeek 去图插桩;
 *        pendingAsk 按 taskId+toolCallId 挂起(见 doc/ask-user.md);Skills 人机入口见宪法专节
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { Thread, type ForModelOptions } from '../core/thread.ts'
import { runAgent } from '../core/loop.ts'
import { createSpawnFn, spawnTool, type RoleDef } from '../core/spawn.ts'
import type { ModelPort } from '../core/model-port.ts'
import type { AgentEvent, ImageData } from '../core/types.ts'
import type { Tool, ToolContext } from '../core/tool.ts'
import type { Limits } from '../core/limits.ts'
import { EPHEMERAL_EVENT_KINDS, TaskStore, type Task, type TaskEvent } from '../storage/task-store.ts'
import type { ProjectStore } from '../storage/project-store.ts'
import { ensureProjectDirs } from '../storage/project-store.ts'
import { sanitizeWorkspaceId } from '../storage/workspace-id.ts'
import { appendSessionEntry, type SessionEntry } from '../storage/session-file.ts'
import { rebuildThread } from '../storage/resume.ts'
import { DEFAULT_COMPACTION, estimateWatermark, isContextOverflowError, planCompaction, withResultPersist, type CompactionPayload } from '../storage/context-budget.ts'
import { mergeBudget, type TaskBudget } from '../storage/budget.ts'
import { FsWorkspace } from '../workspace/fs-workspace.ts'
import { readdirSync } from 'node:fs'
import { LUMEN_PERSONA } from '../agents/persona.ts'
import { createMemoryTools, readMemoryIndex } from '../tools/env/memory-tools.ts'
import { createSkillTools } from '../tools/env/skill-tools.ts'
import {
  buildDiscoverRoots,
  discoverSkills,
  formatSkillCatalog,
  skillReadRoots,
  activateSkill,
  installSkillFromPath,
  uninstallSkill,
  type InstallScope,
  type SkillPackage,
} from '../skills/index.ts'
import type { ImageStore } from '../tools/env/image-store.ts'
import { withImageSanitize } from '../tools/env/vision-tools.ts'
import type {
  AskUserAnswer,
  AskUserQuestion,
  AskUserWaiter,
} from '../tools/env/ask-user-tools.ts'
import {
  extractTitleSource,
  generateTaskTitle,
  shouldBackfillTitle,
} from './task-title.ts'

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
  /** 一等项目名册;缺省时 list/create_projects 不可用(测试可省) */
  projects?: ProjectStore
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
  /**
   * 识图桥:DeepSeek 等不吃 image_url 时,chat 前去图并插 [[image:img-N]] 桩;
   * look_at_image 工具读同一 ImageStore。enabled 热读当前主模型名。
   */
  imageBridge?: {
    store: ImageStore
    enabled: () => boolean
  }
}

/** 长任务不撑爆上下文的泄压阀：老 tool_result 超 8000 字符折叠，最近 6 条豁免 */
export const DEFAULT_CONTEXT_FOLD: ForModelOptions = { maxToolResultChars: 8000, keepRecentToolResults: 6 }

/** 表示分类:可渲染/可文本读 → papers|docs|images;其余 opaque → uploads */
const UPLOAD_DOCS_EXT = new Set([
  'md', 'markdown', 'txt', 'tex', 'csv', 'tsv', 'json', 'jsonl', 'html', 'htm',
  'xml', 'yaml', 'yml', 'toml', 'css', 'svg', 'log', 'ini', 'conf',
  'py', 'sh', 'bash', 'zsh', 'rb', 'go', 'rs', 'java', 'c', 'h', 'cpp', 'hpp', 'cs',
  'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'php', 'sql', 'r',
])
const UPLOAD_IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif'])

function uploadFolderForExt(ext: string): 'papers' | 'docs' | 'images' | 'uploads' {
  if (ext === 'pdf') return 'papers'
  if (UPLOAD_DOCS_EXT.has(ext)) return 'docs'
  if (UPLOAD_IMAGE_EXT.has(ext)) return 'images'
  return 'uploads'
}

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
  /** shared = 项目共享区;session = 当前会话(默认) */
  scope?: 'shared' | 'session'
}

/** UI / WS 可见的 Skill 摘要(不含 playbook 正文) */
export interface SkillInfo {
  name: string
  description: string
  whenToUse?: string
  layer: 'source' | 'workspace' | 'user'
  baseDir: string
  disableModelInvocation: boolean
}

function toSkillInfo(pkg: SkillPackage): SkillInfo {
  return {
    name: pkg.name,
    description: pkg.description,
    ...(pkg.whenToUse ? { whenToUse: pkg.whenToUse } : {}),
    layer: pkg.layer,
    baseDir: pkg.baseDir,
    disableModelInvocation: pkg.disableModelInvocation,
  }
}

type Listener = (event: TaskEvent) => void

export function defaultSystemPrompt(info: RuntimeContextInfo): string {
  // 人格(剧本)+ 运行时上下文。人格在 agents/persona.ts,改动需经 owner。
  return `${LUMEN_PERSONA}\n\n# 此刻\n今天是 ${info.currentDate}。本地论文库有 ${info.localPaperCount} 篇。`
}

export { sanitizeWorkspaceId } from '../storage/workspace-id.ts'

type PendingAsk = {
  resolve: (answer: AskUserAnswer) => void
  reject: (err: unknown) => void
}

export class AgentRuntime {
  private readonly cfg: AgentRuntimeConfig
  private readonly listeners = new Map<string, Set<Listener>>()
  private readonly running = new Map<string, { controller: AbortController; promise: Promise<void> }>()
  /** ask_user 挂起:key = taskId\\0toolCallId */
  private readonly pendingAsks = new Map<string, PendingAsk>()
  /** 侧栏 title 变更广播(WS task_updated) */
  private readonly taskMetaListeners = new Set<(task: Task) => void>()
  /** 正在生成/已失败跳过的 taskId,防 list 风暴 */
  private readonly titleInflight = new Set<string>()
  private titleBackfillActive = 0
  private readonly titleBackfillQueue: Array<{ taskId: string; model?: ModelPort }> = []

  constructor(config: AgentRuntimeConfig) {
    this.cfg = config
  }

  private askKey(taskId: string, toolCallId: string): string {
    return `${taskId}\0${toolCallId}`
  }

  /** UI 经 answer_user 解开挂起的 ask_user;无 pending 返回 false */
  answerUser(taskId: string, toolCallId: string, answer: AskUserAnswer): boolean {
    const key = this.askKey(taskId, toolCallId)
    const entry = this.pendingAsks.get(key)
    if (!entry) return false
    this.pendingAsks.delete(key)
    entry.resolve(answer)
    return true
  }

  private rejectPendingAsks(taskId: string, err: unknown): void {
    const prefix = `${taskId}\0`
    for (const [key, entry] of this.pendingAsks) {
      if (!key.startsWith(prefix)) continue
      this.pendingAsks.delete(key)
      entry.reject(err)
    }
  }

  private makeAskUserWaiter(taskId: string): AskUserWaiter {
    return (toolCallId: string, _questions: AskUserQuestion[], signal?: AbortSignal) => {
      return new Promise<AskUserAnswer>((resolve, reject) => {
        const key = this.askKey(taskId, toolCallId)
        const prev = this.pendingAsks.get(key)
        if (prev) {
          prev.reject(new Error('ask_user replaced by a newer request with the same toolCallId'))
        }
        const onAbort = (): void => {
          if (!this.pendingAsks.has(key)) return
          this.pendingAsks.delete(key)
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        }
        if (signal?.aborted) {
          onAbort()
          return
        }
        this.pendingAsks.set(key, { resolve, reject })
        signal?.addEventListener('abort', onAbort, { once: true })
      })
    }
  }

  /** 发一条 user 事件(进 DB + 实时 notify 已订阅的客户端)。submit/continue 共用,
   *  保证多轮记忆与刷新重建看到的是同一条事件流。图片持久化在 payload 里,重建/恢复不丢图。 */
  private emitUser(taskId: string, content: string, images?: ImageData[]): void {
    const stored = this.cfg.store.appendEvent(taskId, 'user', { content, ...(images?.length ? { images } : {}) }, 'main')
    this.notify(taskId, stored)
  }

  submit(input: SubmitInput, model?: ModelPort): string {
    const task = this.cfg.store.createTask(input.projectId, input.userText)
    this.emitUser(task.id, input.userText, input.images) // 首句进事件流,多轮重建 + 刷新恢复用
    this.startSession(task, input.userText)
    const controller = new AbortController()
    const promise = this.execute(task, this.buildInitialThread(task, input.userText, input.images), controller.signal, model)
    this.running.set(task.id, { controller, promise })
    return task.id
  }

  /** 草稿会话:只建档(status=queued)不开跑。新对话先上传文件用;首条消息由 continueTask 续上。 */
  createDraft(projectId: string, goal: string): string {
    return this.cfg.store.createTask(projectId, goal).id
  }

  async resume(taskId: string, model?: ModelPort): Promise<boolean> {
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
    const promise = this.execute(task, thread, controller.signal, model)
    this.running.set(taskId, { controller, promise })
    return true
  }

  /** 在已有对话(task)上追加一轮:存 user 事件 → 重建累积线程 → 续跑。多轮记忆的实现。 */
  continueTask(taskId: string, userText: string, images?: ImageData[], model?: ModelPort): boolean {
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
    const promise = this.execute(task, thread, controller.signal, model)
    this.running.set(taskId, { controller, promise })
    return true
  }

  /** 列出项目可见 Skills(三层合并后) */
  listSkills(projectId: string): SkillInfo[] {
    return this.skillsForProject(projectId).map(toSkillInfo)
  }

  installSkill(
    projectId: string,
    scope: InstallScope,
    localPath: string,
  ): SkillInfo[] {
    installSkillFromPath({
      scope,
      path: localPath,
      workspacesDir: this.cfg.workspacesDir,
      projectId: sanitizeWorkspaceId(projectId),
    })
    return this.listSkills(projectId)
  }

  uninstallSkill(projectId: string, scope: InstallScope, name: string): SkillInfo[] {
    if (scope !== 'user' && scope !== 'project') throw new Error('只能卸载 user/project 层')
    uninstallSkill({
      scope,
      name,
      workspacesDir: this.cfg.workspacesDir,
      projectId: sanitizeWorkspaceId(projectId),
    })
    return this.listSkills(projectId)
  }

  /**
   * 显式激活 skill(斜杠 / Manage):与 run_skill 同构回灌 playbook,再续跑模型。
   * 无 taskId 时建草稿。任务在跑则失败。
   */
  activateSkillOnTask(
    projectId: string,
    skillName: string,
    opts?: { taskId?: string; args?: string; model?: ModelPort },
  ): { ok: true; taskId: string; created: boolean } | { ok: false; error: string } {
    const skills = this.skillsForProject(projectId)
    const activated = activateSkill(skills, skillName, opts?.args)
    if (!activated.ok) return { ok: false, error: activated.llmContent }

    let created = false
    let taskId = opts?.taskId
    if (!taskId) {
      taskId = this.createDraft(projectId, `skill:${activated.pkg.name}`)
      created = true
    }
    const task = this.cfg.store.getTask(taskId)
    if (!task) return { ok: false, error: 'task 不存在' }
    if (task.project_id !== sanitizeWorkspaceId(projectId) && task.project_id !== projectId) {
      return { ok: false, error: 'forbidden' }
    }
    if (this.running.has(taskId)) return { ok: false, error: '任务正在运行,请稍后再激活 skill' }

    const callId = `skill-${globalThis.crypto.randomUUID()}`
    const userText = `/${activated.pkg.name}`
    this.emitUser(taskId, userText)
    appendSessionEntry(this.cfg.sessionDir, {
      type: 'user', task_id: taskId, timestamp: new Date().toISOString(), content: userText,
    })

    const emit = this.makeEmit(taskId)
    emit({
      kind: 'model_step',
      agentRole: 'main',
      payload: {
        content: '',
        toolCalls: [{ id: callId, name: 'run_skill', arguments: { name: activated.pkg.name, ...(opts?.args ? { args: opts.args } : {}) } }],
      },
    })
    emit({
      kind: 'tool_call',
      agentRole: 'main',
      payload: { id: callId, name: 'run_skill', args: { name: activated.pkg.name, ...(opts?.args ? { args: opts.args } : {}) } },
    })
    emit({
      kind: 'tool_result',
      agentRole: 'main',
      payload: { id: callId, name: 'run_skill', llmContent: activated.llmContent },
    })

    const events = this.cfg.store.listEvents(taskId)
    const compacted = this.maybeCompact(task, events)
    const thread = rebuildThread(compacted ?? events, {
      systemPrompt: this.systemPrompt(task.project_id),
      userText: task.goal,
    })
    const controller = new AbortController()
    const promise = this.execute(task, thread, controller.signal, opts?.model)
    this.running.set(taskId, { controller, promise })
    return { ok: true, taskId, created }
  }

  cancel(taskId: string): void {
    this.rejectPendingAsks(taskId, new DOMException('The operation was aborted.', 'AbortError'))
    this.running.get(taskId)?.controller.abort()
  }

  /** 软归档:若在跑先 cancel,再写 archived_at;列表不再返回 */
  archiveTask(taskId: string): boolean {
    if (!this.cfg.store.getTask(taskId)) return false
    if (this.running.has(taskId)) this.cancel(taskId)
    return this.cfg.store.archiveTask(taskId)
  }

  /** 人手改侧栏标题(写 title,不动 goal);成功则广播 task_updated */
  renameTaskTitle(taskId: string, title: string): Task | null {
    const task = this.cfg.store.getTask(taskId)
    if (!task) return null
    const next = title.trim().replace(/\s+/g, ' ')
    if (!next) throw new Error('标题不能为空')
    if (next.length > 40) throw new Error('标题最多 40 字')
    if (!this.cfg.store.updateTaskTitle(taskId, next)) return null
    const updated = this.cfg.store.getTask(taskId)
    if (updated) this.emitTaskUpdated(updated)
    return updated
  }

  /** 置顶/取消(写 pinned_at);成功广播 task_updated */
  setTaskPinned(taskId: string, pinned: boolean): Task | null {
    if (!this.cfg.store.getTask(taskId)) return null
    if (!this.cfg.store.setTaskPinned(taskId, pinned)) return null
    const updated = this.cfg.store.getTask(taskId)
    if (updated) this.emitTaskUpdated(updated)
    return updated
  }

  isRunning(taskId: string): boolean {
    return this.running.has(taskId)
  }

  /** 任务归属的 project(访客隔离归属校验用);任务不存在返回 null */
  taskProject(taskId: string): string | null {
    return this.cfg.store.getTask(taskId)?.project_id ?? null
  }

  listTasks(projectId?: string): Task[] {
    return this.cfg.store.listTasks(projectId)
  }

  /** 订阅侧栏元数据变更(title);返回 unsubscribe */
  onTaskUpdated(listener: (task: Task) => void): () => void {
    this.taskMetaListeners.add(listener)
    return () => { this.taskMetaListeners.delete(listener) }
  }

  /** list 后懒补长 goal 且无 title 的会话 */
  enqueueTitleBackfill(tasks: Task[], model?: ModelPort): void {
    for (const t of tasks) {
      if (!shouldBackfillTitle(t)) continue
      if (this.titleInflight.has(t.id)) continue
      this.titleBackfillQueue.push({ taskId: t.id, model })
    }
    void this.pumpTitleBackfill()
  }

  /** 有非空助手正文时尝试生成 title(异步,不挡主循环) */
  scheduleTitleIfNeeded(taskId: string, model?: ModelPort): Promise<void> {
    const task = this.cfg.store.getTask(taskId)
    if (!task) return Promise.resolve()
    if (task.title != null && String(task.title).trim() !== '') return Promise.resolve()
    if (this.titleInflight.has(taskId)) return Promise.resolve()
    const source = extractTitleSource(this.cfg.store.listEvents(taskId))
    if (!source) return Promise.resolve()
    this.titleInflight.add(taskId)
    const port = model ?? this.cfg.model
    return generateTaskTitle(port, source, task.goal)
      .then((title) => {
        if (!title) return
        const latest = this.cfg.store.getTask(taskId)
        if (!latest) return
        if (latest.title != null && String(latest.title).trim() !== '') return
        if (!this.cfg.store.updateTaskTitle(taskId, title)) return
        const updated = this.cfg.store.getTask(taskId)
        if (updated) this.emitTaskUpdated(updated)
      })
      .finally(() => {
        this.titleInflight.delete(taskId)
      })
  }

  private emitTaskUpdated(task: Task): void {
    for (const listener of this.taskMetaListeners) listener(task)
  }

  private async pumpTitleBackfill(): Promise<void> {
    if (this.titleBackfillActive >= 1) return
    const job = this.titleBackfillQueue.shift()
    if (!job) return
    this.titleBackfillActive++
    try {
      await this.scheduleTitleIfNeeded(job.taskId, job.model)
    } finally {
      this.titleBackfillActive--
      void this.pumpTitleBackfill()
    }
  }

  listProjects(): import('../storage/project-store.ts').Project[] {
    if (!this.cfg.projects) return [{ id: 'default', name: '默认', created_at: '', updated_at: '' }]
    return this.cfg.projects.listProjects()
  }

  createProject(name: string, sourcePath?: string): import('../storage/project-store.ts').Project {
    if (!this.cfg.projects) throw new Error('projects 不可用')
    return this.cfg.projects.createProject({ name, sourcePath })
  }

  renameProject(id: string, name: string): import('../storage/project-store.ts').Project | null {
    if (!this.cfg.projects) throw new Error('projects 不可用')
    return this.cfg.projects.renameProject(id, name)
  }

  /** 软归档项目;禁 default */
  archiveProject(id: string): boolean {
    if (!this.cfg.projects) return false
    return this.cfg.projects.archiveProject(id)
  }

  listEvents(taskId: string, afterSeq?: number): TaskEvent[] {
    return this.cfg.store.listEvents(taskId, afterSeq)
  }

  /** 列资产:有 taskId = shared/ + 该会话目录;无 taskId(新对话) = 仅 shared/,本会话为空 */
  async listAssets(projectId: string, taskId?: string): Promise<WorkspaceAsset[]> {
    const classify = (paths: string[], scope: 'shared' | 'session'): WorkspaceAsset[] => {
      const base = (p: string): string => p.split('/').pop() ?? p
      const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif']
      const inDocs = (p: string): boolean => p.startsWith('docs/') || p.includes('/docs/')
      const assets: WorkspaceAsset[] = []
      for (const p of paths) {
        const ext = (p.match(/\.([A-Za-z0-9]+)$/)?.[1] ?? '').toLowerCase()
        if (ext === 'pdf') assets.push({ path: p, kind: 'pdf', name: base(p), scope })
        else if (ext === 'md') {
          // search-*.md 是检索中间物,不进侧栏
          if (!/(^|\/)search-/.test(p)) assets.push({ path: p, kind: 'doc', name: base(p), scope })
        }
        else if (ext === 'html' || ext === 'htm') assets.push({ path: p, kind: 'html', name: base(p), scope })
        else if (inDocs(p)) assets.push({ path: p, kind: 'doc', name: base(p), scope })
        else if (IMAGE_EXT.includes(ext)) assets.push({ path: p, kind: 'image', name: base(p), scope })
        else if (p.includes('uploads/')) assets.push({ path: p, kind: 'file', name: base(p), scope })
      }
      return assets
    }

    const sharedWs = this.makeProjectRootWorkspace(projectId)
    const sharedRaw = (await sharedWs.glob('shared/**/*').catch(() => [] as string[]))
    const shared = classify(sharedRaw, 'shared')

    if (!taskId) {
      // 新对话/草稿:本会话尚无目录,绝不能把项目根遗留 papers/docs 冒充成 session
      return shared
    }

    const sessionWs = this.makeWorkspace(projectId, taskId)
    const sessionRaw = (await sessionWs.glob('**/*').catch(() => [] as string[]))
      .filter((p) => !p.startsWith('cache/') && !p.startsWith('shared/'))
    return [...shared, ...classify(sessionRaw, 'session')]
  }

  /** 读一个文本资产(.md)。PDF 二进制走 HTTP /pdf,不经这里。shared/ 路径走项目根 */
  async readAsset(projectId: string, path: string, taskId?: string): Promise<string | null> {
    try {
      return await this.workspaceForAssetPath(projectId, path, taskId).readFile(path)
    } catch {
      return null
    }
  }

  /** 取资产二进制(PDF 原件),供 HTTP /pdf 给前端 pdf.js 渲染。路径经沙箱校验 */
  async readAssetBytes(projectId: string, path: string, taskId?: string): Promise<Uint8Array | null> {
    try {
      return await this.workspaceForAssetPath(projectId, path, taskId).readBytes(path)
    } catch {
      return null
    }
  }

  /**
   * 用户上传:宽准入、按表示分类落盘(学 OpenSquilla — admission ≠ representation)。
   * papers/ 图文可渲染族;docs/ 文本与源码;images/ 图;其余 → uploads/ opaque(工具可读,不假定 inline)。
   * scope=shared → 写入项目 shared/{kind}/;默认 → 会话目录(有 taskId)或项目根。
   */
  async saveUpload(
    projectId: string,
    name: string,
    bytes: Uint8Array,
    taskId?: string,
    scope: 'shared' | 'session' = 'session',
  ): Promise<string> {
    ensureProjectDirs(this.cfg.workspacesDir, projectId)
    const safe = (name.split(/[/\\]/).pop() || 'upload').replace(/[^\w.\-一-鿿]/g, '_')
    const ext = (safe.match(/\.([A-Za-z0-9]+)$/)?.[1] ?? '').toLowerCase()
    const kind = uploadFolderForExt(ext)
    if (scope === 'shared') {
      const file = `shared/${kind}/${safe}`
      await this.makeProjectRootWorkspace(projectId).writeBytes(file, bytes)
      return file
    }
    const file = `${kind}/${safe}`
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
    let base = (this.cfg.buildSystemPrompt ?? defaultSystemPrompt)(info)
    // 跨会话记忆(CC 范式):索引常驻开局,正文按需 read_memory —— 与 Skills 分家
    const memory = projectId ? readMemoryIndex(this.memoryDir(projectId)) : ''
    if (memory) {
      base += '\n\n# 跨会话记忆(索引)\n' +
        '以下是你此前为本项目记下的长期记忆,一行一条。需要正文用 read_memory(文件名);' +
        '遇到值得长期记住的事实(用户偏好/纠正/项目约定,而非对话内容本身)用 write_memory 记录并同步更新 MEMORY.md。' +
        '记忆对用户完全可见。\n' + memory
    }
    // 可运行 Skills:catalog 常驻,正文按需 run_skill —— 不是记忆
    if (projectId) {
      const catalog = formatSkillCatalog(this.skillsForProject(projectId))
      if (catalog) base += '\n\n' + catalog
    }
    return base
  }

  /** 项目级记忆目录(跨会话):workspaces/<project>/memory */
  private memoryDir(projectId: string): string {
    return this.cfg.workspacesDir + '/' + sanitizeWorkspaceId(projectId) + '/memory'
  }

  private skillsForProject(projectId: string) {
    const pid = sanitizeWorkspaceId(projectId)
    const source = this.cfg.projects?.getProject(pid)?.source_path
    const roots = buildDiscoverRoots({
      workspacesDir: this.cfg.workspacesDir,
      projectId: pid,
      sourcePath: source,
    })
    return discoverSkills(roots)
  }

  private skillReadRootsForProject(projectId: string): string[] {
    const pid = sanitizeWorkspaceId(projectId)
    const source = this.cfg.projects?.getProject(pid)?.source_path
    return skillReadRoots(buildDiscoverRoots({
      workspacesDir: this.cfg.workspacesDir,
      projectId: pid,
      sourcePath: source,
    }))
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
  private makeProjectRootWorkspace(projectId: string): FsWorkspace {
    const pid = sanitizeWorkspaceId(projectId)
    ensureProjectDirs(this.cfg.workspacesDir, pid)
    return new FsWorkspace({
      root: `${this.cfg.workspacesDir}/${pid}`,
      libraryRoot: this.cfg.libraryRoot,
    })
  }

  private makeWorkspace(projectId: string, taskId?: string): FsWorkspace {
    const pid = sanitizeWorkspaceId(projectId)
    const tid = taskId ? sanitizeWorkspaceId(taskId) : undefined
    if (!tid) return this.makeProjectRootWorkspace(pid)
    ensureProjectDirs(this.cfg.workspacesDir, pid)
    const sharedRoot = `${this.cfg.workspacesDir}/${pid}/shared`
    // 项目绑定的本机源文件夹优先于全局 libraryRoot(只读 library/)
    const source = this.cfg.projects?.getProject(pid)?.source_path
    const libraryRoot = (source && source.trim()) || this.cfg.libraryRoot
    return new FsWorkspace({
      root: `${this.cfg.workspacesDir}/${pid}/sessions/${tid}`,
      libraryRoot,
      sharedRoot, // 会话内只读挂载 shared/
    })
  }

  /** shared/* 走项目根;其余走会话(或项目根)工作区 */
  private workspaceForAssetPath(projectId: string, assetPath: string, taskId?: string): FsWorkspace {
    if (assetPath.startsWith('shared/')) return this.makeProjectRootWorkspace(projectId)
    return this.makeWorkspace(projectId, taskId)
  }

  private makeEmit(taskId: string, modelForTitle?: ModelPort): (event: AgentEvent) => void {
    return (event: AgentEvent) => {
      // 流式增量:只推订阅者,不占 seq / 不写库——重放靠 model_step 定稿即可复原 UI
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
      const stored = this.cfg.store.appendEvent(taskId, event.kind, event.payload, event.agentRole)
      for (const entry of toSessionEntries(taskId, event)) appendSessionEntry(this.cfg.sessionDir, entry)
      this.notify(taskId, stored)
      // 首条非空 reply → 异步起侧栏短标题
      if (event.kind === 'reply') {
        const reply = typeof (event.payload as { reply?: unknown } | undefined)?.reply === 'string'
          ? (event.payload as { reply: string }).reply.trim()
          : ''
        if (reply) void this.scheduleTitleIfNeeded(taskId, modelForTitle)
      }
    }
  }

  private notify(taskId: string, event: TaskEvent): void {
    for (const listener of this.listeners.get(taskId) ?? []) listener(event)
  }

  private async execute(task: Task, thread: Thread, signal: AbortSignal, modelOverride?: ModelPort): Promise<void> {
    const rawModel = modelOverride ?? this.cfg.model // demo:连接携带的 key 构建的 model;本地:全局 model
    // DeepSeek 路径:每次 chat 去 image_url,侧车保留像素供 look_at_image
    const model = this.cfg.imageBridge?.enabled()
      ? withImageSanitize(rawModel, this.cfg.imageBridge.store, task.id)
      : rawModel
    const startedAt = Date.now()
    const emit = this.makeEmit(task.id, modelOverride ?? rawModel)
    const budget = mergeBudget(this.cfg.budget)
    const limits: Limits = { maxSteps: budget.maxSteps, maxDepth: this.cfg.maxDepth ?? 3, maxSeconds: budget.maxSeconds }
    const workspace = this.makeWorkspace(task.project_id, task.id)
    const spawn = createSpawnFn({
      model,
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
      skillReadRoots: this.skillReadRootsForProject(task.project_id),
      deps: {
        model,
        imageStore: this.cfg.imageBridge?.store,
        askUser: this.makeAskUserWaiter(task.id),
      },
    }
    const memoryTools = createMemoryTools(this.memoryDir(task.project_id)) // 跨会话记忆:仅主 agent,worker 不带
    const skillTools = createSkillTools(this.skillsForProject(task.project_id))
    const mains = [...this.cfg.mainTools, ...memoryTools, ...skillTools]
    const baseTools = this.cfg.roles && Object.keys(this.cfg.roles).length ? [...mains, spawnTool] : mains
    // 大结果落盘(方案 B):启用预算时,超限工具输出全文进会话 cache/tool-results/,上下文只留预览+路径
    const tools = this.cfg.contextBudget?.window
      ? baseTools.map((t) => withResultPersist(t, workspace, this.cfg.contextBudget?.persistToolResultChars))
      : baseTools

    try {
      this.cfg.store.updateTaskStatus(task.id, 'running')
      this.notifyStatus(task.id)
      let result = await runAgent({
        thread, model, tools, limits, ctx, signal,
        forModelOptions: this.cfg.contextFold ?? DEFAULT_CONTEXT_FOLD,
      })
      // 软着陆(方案 B):超窗错误 → 确定性压缩后原地重试一次。已完成的 tool_result 都在事件流里,进度不丢
      if (result.status === 'error' && this.cfg.contextBudget?.window && isContextOverflowError(result.reply)) {
        const events = this.cfg.store.listEvents(task.id)
        const compacted = this.appendCompaction(task, events, estimateWatermark(events).estimatedTotal)
        if (compacted) {
          const rebuilt = rebuildThread(compacted, { systemPrompt: this.systemPrompt(task.project_id), userText: task.goal })
          result = await runAgent({
            thread: rebuilt, model, tools, limits, ctx, signal,
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
      // done/interrupted 兜底:空 reply 先结束时此处再试一次
      if (status === 'done' || status === 'interrupted') {
        void this.scheduleTitleIfNeeded(task.id, modelOverride)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.cfg.store.updateTaskStatus(task.id, 'failed', message)
      this.notifyStatus(task.id)
      appendSessionEntry(this.cfg.sessionDir, { type: 'error', task_id: task.id, timestamp: new Date().toISOString(), error: message })
      this.endSession(task.id, 'failed', Date.now() - startedAt)
    } finally {
      this.rejectPendingAsks(task.id, new DOMException('The operation was aborted.', 'AbortError'))
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

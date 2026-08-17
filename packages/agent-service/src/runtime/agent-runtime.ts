/**
 * [INPUT]: core（runAgent/Thread/spawn）、storage、workspace;tools/registry.buildTaskTools;
 *          event-hub / ask-hub / title-hub / uploads / assets / compaction / workspace-factory
 * [OUTPUT]: AgentRuntime —— 生命周期编排(submit/continue/cancel/resume/sweep);
 *           再导出 SkillInfo / UploadReceipt / WorkspaceAsset / sanitizeWorkspaceId / defaultSystemPrompt
 * [POS]: §4 运行环境编排层。一个任务 = 一次 runAgent;事件/ask/标题/上传/资产/压缩交给卫星。
 *        durable emit 落 task_events + session jsonl + WS;ephemeral 仅 notify(seq=-1)。
 *        自建 Coordinator 注入 parent_budget(mergeBudget),spawn 准入与父账同源。
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { Thread, type ForModelOptions } from '../core/thread.ts'
import { runAgent } from '../core/loop.ts'
import { createSpawnFn, spawnTool, type RoleDef } from '../core/spawn.ts'
import type { ModelPort } from '../core/model-port.ts'
import type { ImageData } from '../core/types.ts'
import type { Tool, ToolContext } from '../core/tool.ts'
import type { Limits } from '../core/limits.ts'
import type { Task, TaskEvent, TaskStore } from '../storage/task-store.ts'
import type { ProjectStore } from '../storage/project-store.ts'
import { ensureProjectDirs } from '../storage/project-store.ts'
import { sanitizeWorkspaceId } from '../storage/workspace-id.ts'
import { appendSessionEntry } from '../storage/session-file.ts'
import { rebuildThread } from '../storage/resume.ts'
import { estimateWatermark, isContextOverflowError, withResultPersist } from '../storage/context-budget.ts'
import { mergeBudget, type TaskBudget } from '../storage/budget.ts'
import { FsWorkspace } from '../workspace/fs-workspace.ts'
import { sanitizeActivePath, userContentForModel, type UploadRef } from './upload-awareness.ts'
import { LUMEN_PERSONA } from '../agents/persona.ts'
import { readMemoryIndex } from '../tools/env/memory.ts'
import { buildTaskTools, mergeToolUniverse } from '../tools/registry.ts'
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
import type { ImageStore } from '../tools/env/vision/index.ts'
import { withImageSanitize } from '../tools/env/vision/index.ts'
import type { AskUserAnswer } from '../tools/env/ask-user.ts'
import { MermaidRepairGate, runMermaidRepair } from './mermaid-repair.ts'
import { SubagentCoordinator } from '../subagent/coordinator.ts'
import { SubagentStore } from '../subagent/store.ts'
import { ChildRunner } from '../subagent/runner.ts'
import { resumeAllowed, type SubagentRecord } from '../subagent/types.ts'
import type { SubagentInfo } from '../protocol/messages.ts'
import {
  buildAgentDiscoverRoots,
  defaultTogglesPath,
  listAllAgents,
  listCallableAgents,
  loadToggles,
  mergeAgentRegistry,
  setAgentToggle,
  type DiscoveredAgent,
} from '../subagent/index.ts'
import { openDatabase, type DB } from '../storage/db.ts'
import { mkdirSync } from 'node:fs'
import * as nodePath from 'node:path'
import { EventHub, type EventListener } from './event-hub.ts'
import { AskHub } from './ask-hub.ts'
import { TitleHub } from './title-hub.ts'
import { CompactionHub } from './compaction.ts'
import { saveUploadedFile, type UploadReceipt } from './uploads.ts'
import {
  listWorkspaceAssets,
  readWorkspaceAsset,
  readWorkspaceAssetBytes,
  type WorkspaceAsset,
} from './assets.ts'
import {
  makeProjectRootWorkspace,
  makeSessionWorkspace,
  workspaceForAssetPath,
  type WorkspaceFactoryDeps,
} from './workspace-factory.ts'

export type { UploadRef, UploadReceipt, WorkspaceAsset, EventListener }

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
  /** demo 剔除 run_code(云上无 Seatbelt=RCE);任务域工厂读此旗 */
  demo?: boolean
  /** 覆盖用户级 Skills 根(测试隔离;默认 ~/.lumen/skills) */
  userSkillsDir?: string
  roles?: Record<string, RoleDef>
  budget?: Partial<TaskBudget>
  maxDepth?: number
  buildSystemPrompt?: (info: RuntimeContextInfo) => string
  contextInfo?: () => RuntimeContextInfo
  /** 子 Agent 协调器(T0);不传则 runtime 用 db 自建 */
  subagentCoordinator?: SubagentCoordinator
  /** 供自建 SubagentStore(当未注入 coordinator) */
  db?: DB
  /** 上下文折叠；不传用 DEFAULT_CONTEXT_FOLD。显式传 {} 可关闭（测试用） */
  contextFold?: ForModelOptions
  /** 上下文预算(方案 B):不传或无 window = 整套水位/压缩/落盘不启用 */
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

export interface SubmitInput {
  projectId: string
  userText: string
  images?: ImageData[]
  uploads?: UploadRef[]
  activePath?: string
}

export function defaultSystemPrompt(info: RuntimeContextInfo): string {
  return `${LUMEN_PERSONA}\n\n# 此刻\n今天是 ${info.currentDate}。本地论文库有 ${info.localPaperCount} 篇。`
}

export { sanitizeWorkspaceId } from '../storage/workspace-id.ts'

export class AgentRuntime {
  private readonly cfg: AgentRuntimeConfig
  private readonly events: EventHub
  private readonly asks: AskHub
  private readonly titles: TitleHub
  private readonly compaction: CompactionHub
  private readonly running = new Map<string, { controller: AbortController; promise: Promise<void> }>()
  readonly subagents: SubagentCoordinator
  private readonly mermaidRepairGate = new MermaidRepairGate()

  constructor(config: AgentRuntimeConfig) {
    this.cfg = config
    this.events = new EventHub(config.store, config.sessionDir)
    this.asks = new AskHub()
    this.titles = new TitleHub(config.store, () => this.cfg.model, (t) => this.events.emitTaskUpdated(t))
    this.compaction = new CompactionHub(
      config.store,
      config.workspacesDir,
      config.contextBudget,
      (projectId) => this.systemPrompt(projectId),
      (taskId, event) => this.events.notify(taskId, event),
      (taskId) => this.subagents.rehydrateReminders(taskId),
    )
    if (config.subagentCoordinator) {
      this.subagents = config.subagentCoordinator
    } else if (config.db) {
      this.subagents = new SubagentCoordinator(new SubagentStore(config.db), config.store, {
        parent_budget: mergeBudget(config.budget),
      })
    } else {
      this.subagents = new SubagentCoordinator(new SubagentStore(openDatabase(':memory:')), config.store, {
        parent_budget: mergeBudget(config.budget),
      })
    }
  }

  private wsDeps(): WorkspaceFactoryDeps {
    return {
      workspacesDir: this.cfg.workspacesDir,
      libraryRoot: this.cfg.libraryRoot,
      sourcePath: (projectId) => this.cfg.projects?.getProject(projectId)?.source_path ?? undefined,
    }
  }

  /** UI 经 answer_user 解开挂起的 ask_user;无 pending 返回 false */
  answerUser(taskId: string, toolCallId: string, answer: AskUserAnswer): boolean {
    return this.asks.answerUser(taskId, toolCallId, answer)
  }

  submit(input: SubmitInput, model?: ModelPort): string {
    const safePath = sanitizeActivePath(input.activePath ?? null)
    const task = this.cfg.store.createTask(input.projectId, input.userText)
    this.events.emitUser(task.id, input.userText, input.images, input.uploads, safePath)
    this.startSession(task, input.userText)
    const controller = new AbortController()
    const promise = this.execute(
      task,
      this.buildInitialThread(task, input.userText, input.images, input.uploads, safePath),
      controller.signal,
      model,
    )
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
    const compacted = this.compaction.maybeCompact(task, events)
    const thread = rebuildThread(compacted ?? events, {
      systemPrompt: this.systemPrompt(task.project_id),
      userText: task.goal,
    })
    const controller = new AbortController()
    const promise = this.execute(task, thread, controller.signal, model)
    this.running.set(taskId, { controller, promise })
    return true
  }

  /** 在已有对话(task)上追加一轮:存 user 事件 → 重建累积线程 → 续跑。 */
  continueTask(
    taskId: string,
    userText: string,
    images?: ImageData[],
    model?: ModelPort,
    uploads?: UploadRef[],
    activePath?: string | null,
  ): boolean {
    const task = this.cfg.store.getTask(taskId)
    if (!task) return false
    if (this.running.has(taskId)) return false
    const safePath = sanitizeActivePath(activePath ?? null)
    this.events.emitUser(taskId, userText, images, uploads, safePath)
    appendSessionEntry(this.cfg.sessionDir, {
      type: 'user', task_id: taskId, timestamp: new Date().toISOString(), content: userText,
    })
    const events = this.cfg.store.listEvents(taskId)
    const compacted = this.compaction.maybeCompact(task, events)
    const thread = rebuildThread(compacted ?? events, { systemPrompt: this.systemPrompt(task.project_id), userText: task.goal })
    const controller = new AbortController()
    const promise = this.execute(task, thread, controller.signal, model)
    this.running.set(taskId, { controller, promise })
    return true
  }

  listSkills(projectId: string): SkillInfo[] {
    return this.skillsForProject(projectId).map(toSkillInfo)
  }

  installSkill(projectId: string, scope: InstallScope, localPath: string): SkillInfo[] {
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
    this.events.emitUser(taskId, userText)
    appendSessionEntry(this.cfg.sessionDir, {
      type: 'user', task_id: taskId, timestamp: new Date().toISOString(), content: userText,
    })

    const emit = this.events.makeEmit(taskId)
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
    const compacted = this.compaction.maybeCompact(task, events)
    const thread = rebuildThread(compacted ?? events, {
      systemPrompt: this.systemPrompt(task.project_id),
      userText: task.goal,
    })
    const controller = new AbortController()
    const promise = this.execute(task, thread, controller.signal, opts?.model)
    this.running.set(taskId, { controller, promise })
    return { ok: true, taskId, created }
  }

  /** 整 task 取消:abort 主 loop + 全部子 + block 新 spawn */
  cancel(taskId: string): void {
    this.asks.rejectPendingAsks(taskId, new DOMException('The operation was aborted.', 'AbortError'))
    this.running.get(taskId)?.controller.abort()
    this.subagents.cancelByParentTask(taskId)
  }

  /** 只停当前 turn:abort 主 loop + 杀 parent_turn 匹配的子 */
  cancelTurn(taskId: string): void {
    const turnId = this.cfg.store.getActiveTurnId(taskId)
    this.asks.rejectPendingAsks(taskId, new DOMException('The operation was aborted.', 'AbortError'))
    this.running.get(taskId)?.controller.abort()
    if (turnId) this.subagents.cancelByParentTurn(taskId, turnId)
  }

  listSubagents(taskId: string): SubagentInfo[] {
    return this.subagents.listByParentTask(taskId).map(toSubagentInfo)
  }

  killSubagent(taskId: string, subagentId: string): boolean {
    const rec = this.subagents.get(subagentId)
    if (!rec || rec.parent_task_id !== taskId) return false
    this.subagents.kill(subagentId, 'ui_kill')
    return true
  }

  listAgentTypes(projectId: string): DiscoveredAgent[] {
    return listAllAgents(this.agentRegistryForProject(projectId))
  }

  listCallableAgentNames(projectId: string): string[] {
    return listCallableAgents(this.agentRegistryForProject(projectId)).map((a) => a.name)
  }

  setAgentTypeDisabled(name: string, disabled: boolean): DiscoveredAgent[] {
    setAgentToggle(defaultTogglesPath(), name, disabled)
    return this.listAgentTypes('default')
  }

  private agentRegistryForProject(projectId: string): Map<string, DiscoveredAgent> {
    const source = this.cfg.projects?.getProject(projectId)?.source_path
    const roots = buildAgentDiscoverRoots({
      workspacesDir: this.cfg.workspacesDir,
      projectId,
      sourcePath: source,
    })
    return mergeAgentRegistry(roots, loadToggles(defaultTogglesPath()))
  }

  /** Phase B sidecar:单次无工具修图,不落库 */
  repairMermaidSource(taskId: string, source: string, error: string, model?: ModelPort) {
    return runMermaidRepair({
      gate: this.mermaidRepairGate,
      taskId,
      taskExists: Boolean(this.cfg.store.getTask(taskId)),
      source,
      error,
      model: model ?? this.cfg.model,
    })
  }

  archiveTask(taskId: string): boolean {
    if (!this.cfg.store.getTask(taskId)) return false
    if (this.running.has(taskId)) this.cancel(taskId)
    return this.cfg.store.archiveTask(taskId)
  }

  renameTaskTitle(taskId: string, title: string): Task | null {
    const task = this.cfg.store.getTask(taskId)
    if (!task) return null
    const next = title.trim().replace(/\s+/g, ' ')
    if (!next) throw new Error('标题不能为空')
    if (next.length > 40) throw new Error('标题最多 40 字')
    if (!this.cfg.store.updateTaskTitle(taskId, next)) return null
    const updated = this.cfg.store.getTask(taskId)
    if (updated) this.events.emitTaskUpdated(updated)
    return updated
  }

  setTaskPinned(taskId: string, pinned: boolean): Task | null {
    if (!this.cfg.store.getTask(taskId)) return null
    if (!this.cfg.store.setTaskPinned(taskId, pinned)) return null
    const updated = this.cfg.store.getTask(taskId)
    if (updated) this.events.emitTaskUpdated(updated)
    return updated
  }

  isRunning(taskId: string): boolean {
    return this.running.has(taskId)
  }

  taskProject(taskId: string): string | null {
    return this.cfg.store.getTask(taskId)?.project_id ?? null
  }

  listTasks(projectId?: string): Task[] {
    return this.cfg.store.listTasks(projectId)
  }

  onTaskUpdated(listener: (task: Task) => void): () => void {
    return this.events.onTaskUpdated(listener)
  }

  enqueueTitleBackfill(tasks: Task[], model?: ModelPort): void {
    this.titles.enqueueTitleBackfill(tasks, model)
  }

  scheduleTitleIfNeeded(taskId: string, model?: ModelPort): Promise<void> {
    return this.titles.scheduleTitleIfNeeded(taskId, model)
  }

  listProjects(): import('../storage/project-store.ts').Project[] {
    if (!this.cfg.projects) return [{ id: 'default', name: '默认', source_path: null, created_at: '', updated_at: '' }]
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

  archiveProject(id: string): boolean {
    if (!this.cfg.projects) return false
    return this.cfg.projects.archiveProject(id)
  }

  listEvents(taskId: string, afterSeq?: number): TaskEvent[] {
    return this.cfg.store.listEvents(taskId, afterSeq)
  }

  async listAssets(projectId: string, taskId?: string): Promise<WorkspaceAsset[]> {
    return listWorkspaceAssets({
      taskId,
      projectRoot: makeProjectRootWorkspace(this.wsDeps(), projectId),
      session: taskId ? makeSessionWorkspace(this.wsDeps(), projectId, taskId) : undefined,
    })
  }

  async readAsset(projectId: string, path: string, taskId?: string): Promise<string | null> {
    return readWorkspaceAsset(workspaceForAssetPath(this.wsDeps(), projectId, path, taskId), path)
  }

  async readAssetBytes(projectId: string, path: string, taskId?: string): Promise<Uint8Array | null> {
    return readWorkspaceAssetBytes(workspaceForAssetPath(this.wsDeps(), projectId, path, taskId), path)
  }

  async saveUpload(
    projectId: string,
    name: string,
    bytes: Uint8Array,
    taskId?: string,
    scope: 'shared' | 'session' = 'session',
  ): Promise<UploadReceipt> {
    return saveUploadedFile({
      workspacesDir: this.cfg.workspacesDir,
      projectId,
      name,
      bytes,
      taskId,
      scope,
      projectRoot: (pid) => makeProjectRootWorkspace(this.wsDeps(), pid),
      session: (pid, tid) => makeSessionWorkspace(this.wsDeps(), pid, tid),
    })
  }

  subscribe(taskId: string, listener: EventListener): () => void {
    return this.events.subscribe(taskId, listener)
  }

  async waitFor(taskId: string): Promise<void> {
    await this.running.get(taskId)?.promise
  }

  async drain(): Promise<void> {
    await Promise.all([...this.running.values()].map((r) => r.promise))
  }

  /**
   * 服务启动时:上个进程死亡时仍 running 的任务标 interrupted(可 resume)。
   * 先关残留 active_turn_id,再 sweep 子 Agent。不自动续跑。
   */
  sweepInterrupted(): number {
    let swept = 0
    for (const task of this.cfg.store.findInterrupted()) {
      if (task.status === 'running' && !this.running.has(task.id)) {
        if (task.active_turn_id) {
          this.cfg.store.endTurn(task.id, 'interrupted', { reason: 'service_restart' })
        }
        this.cfg.store.updateTaskStatus(task.id, 'interrupted', '服务中断时任务未完成；resume 可续跑')
        swept += 1
      }
    }
    if (this.subagents) swept += this.subagents.sweepInterrupted()
    return swept
  }

  private systemPrompt(projectId?: string): string {
    const info = this.cfg.contextInfo?.() ?? { currentDate: new Date().toISOString().slice(0, 10), localPaperCount: 0 }
    let base = (this.cfg.buildSystemPrompt ?? defaultSystemPrompt)(info)
    const memory = projectId ? readMemoryIndex(this.memoryDir(projectId)) : ''
    if (memory) {
      base += '\n\n# 跨会话记忆(索引)\n' +
        '以下是你此前为本项目记下的长期记忆,一行一条。需要正文用 read_memory(文件名);' +
        '遇到值得长期记住的事实(用户偏好/纠正/项目约定,而非对话内容本身)用 write_memory 记录并同步更新 MEMORY.md。' +
        '记忆对用户完全可见。\n' + memory
    }
    if (projectId) {
      const catalog = formatSkillCatalog(this.skillsForProject(projectId))
      if (catalog) base += '\n\n' + catalog
    }
    return base
  }

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
      userSkillsDir: this.cfg.userSkillsDir,
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
      userSkillsDir: this.cfg.userSkillsDir,
    }))
  }

  private buildInitialThread(
    task: Task,
    userText: string,
    images?: ImageData[],
    uploads?: UploadRef[],
    activePath?: string | null,
  ): Thread {
    const safePath = sanitizeActivePath(activePath ?? null)
    return new Thread([
      { role: 'system', content: this.systemPrompt(task.project_id) },
      {
        role: 'user',
        content: userContentForModel(userText, { uploads, activePath: safePath }),
        ...(images?.length ? { images } : {}),
      },
    ])
  }

  private startSession(task: Task, userText: string): void {
    const ts = new Date().toISOString()
    appendSessionEntry(this.cfg.sessionDir, {
      type: 'session_start', task_id: task.id, timestamp: ts, user_text: userText, project_id: task.project_id,
    })
    appendSessionEntry(this.cfg.sessionDir, { type: 'user', task_id: task.id, timestamp: ts, content: userText })
  }

  private async execute(task: Task, thread: Thread, signal: AbortSignal, modelOverride?: ModelPort): Promise<void> {
    const rawModel = modelOverride ?? this.cfg.model
    const model = this.cfg.imageBridge?.enabled()
      ? withImageSanitize(rawModel, this.cfg.imageBridge.store, task.id)
      : rawModel
    const startedAt = Date.now()
    const emit = this.events.makeEmit(task.id)
    const budget = mergeBudget(this.cfg.budget)
    const limits: Limits = { maxSteps: budget.maxSteps, maxDepth: this.cfg.maxDepth ?? 3, maxSeconds: budget.maxSeconds }
    const workspace = makeSessionWorkspace(this.wsDeps(), task.project_id, task.id)
    const spawn = createSpawnFn({
      model,
      roles: this.cfg.roles ?? {},
      maxDepth: limits.maxDepth,
    })
    const turnId = this.cfg.store.beginTurn(task.id)
    this.subagents.openSpawnAdmission(task.id)
    const childRunner = new ChildRunner({
      coordinator: this.subagents,
      model,
      allTools: this.cfg.mainTools,
      roles: this.cfg.roles ?? {},
      maxDepth: limits.maxDepth,
      worktreeRoot: this.subagents.config.worktree_root,
      agentRegistry: this.agentRegistryForProject(task.project_id),
      resolveGitRoot: (parentTaskId) => {
        const t = this.cfg.store.getTask(parentTaskId)
        const projectId = t?.project_id ?? task.project_id
        const source = this.cfg.projects?.getProject(projectId)?.source_path
        if (source && source.trim()) return source.trim()
        return null
      },
      makeWorkspace: (parentTaskId, cwdRoot) => {
        const t = this.cfg.store.getTask(parentTaskId)
        const projectId = t?.project_id ?? task.project_id
        if (!cwdRoot) return makeSessionWorkspace(this.wsDeps(), projectId, parentTaskId)
        const pid = sanitizeWorkspaceId(projectId)
        const tid = sanitizeWorkspaceId(parentTaskId)
        ensureProjectDirs(this.cfg.workspacesDir, pid)
        const sessionRoot = nodePath.join(this.cfg.workspacesDir, pid, 'sessions', tid)
        const stripe = nodePath.join(sessionRoot, cwdRoot)
        mkdirSync(stripe, { recursive: true })
        const sharedRoot = nodePath.join(this.cfg.workspacesDir, pid, 'shared')
        const source = this.cfg.projects?.getProject(pid)?.source_path
        const libraryRoot = (source && source.trim()) || this.cfg.libraryRoot
        return new FsWorkspace({ root: stripe, libraryRoot, sharedRoot })
      },
      emit: (parentTaskId, event) => {
        this.events.makeEmit(parentTaskId)(event)
      },
      listEvents: (parentTaskId) => this.cfg.store.listEvents(parentTaskId),
    })
    const ctx: ToolContext = {
      taskId: task.id,
      sessionId: task.id,
      turnId,
      agentRole: 'main',
      depth: 0,
      spawn,
      emit,
      workspace,
    }
    const taskTools = buildTaskTools({
      memoryDir: this.memoryDir(task.project_id),
      skills: this.skillsForProject(task.project_id),
      skillReadRoots: this.skillReadRootsForProject(task.project_id),
      askUser: this.asks.makeAskUserWaiter(task.id),
      subagents: this.subagents,
      childRunner,
      demo: this.cfg.demo === true,
    })
    const mains = mergeToolUniverse(this.cfg.mainTools, taskTools)
    const baseTools = this.cfg.roles && Object.keys(this.cfg.roles).length ? [...mains, spawnTool] : mains
    const tools = this.cfg.contextBudget?.window
      ? baseTools.map((t) => withResultPersist(t, workspace, this.cfg.contextBudget?.persistToolResultChars))
      : baseTools

    try {
      this.cfg.store.updateTaskStatus(task.id, 'running')
      this.events.notifyStatus(task.id)
      let result = await runAgent({
        thread, model, tools, limits, ctx, signal,
        forModelOptions: this.cfg.contextFold ?? DEFAULT_CONTEXT_FOLD,
      })
      if (result.status === 'error' && this.cfg.contextBudget?.window && isContextOverflowError(result.reply)) {
        const events = this.cfg.store.listEvents(task.id)
        const compacted = this.compaction.appendCompaction(task, events, estimateWatermark(events).estimatedTotal)
        if (compacted) {
          this.subagents?.rehydrateReminders(task.id)
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
      const status = result.status === 'done' ? 'done'
        : result.status === 'aborted' ? 'canceled'
          : result.status === 'exhausted' ? 'interrupted'
            : 'failed'
      const lastError = result.status === 'error' ? result.reply
        : result.status === 'exhausted' ? '预算耗尽（步数或墙钟）；resume 可续跑' : null
      const turnEndStatus = result.status === 'aborted' ? 'canceled'
        : result.status === 'exhausted' ? 'interrupted'
          : result.status === 'done' ? 'done' : 'failed'
      this.cfg.store.endTurn(task.id, turnEndStatus)
      this.cfg.store.updateTaskStatus(task.id, status, lastError)
      this.events.notifyStatus(task.id)
      this.compaction.emitContextUsage(task.id)
      this.endSession(task.id, status, Date.now() - startedAt)
      if (status === 'done' || status === 'interrupted') {
        await this.titles.scheduleTitleIfNeeded(task.id, modelOverride)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.cfg.store.endTurn(task.id, 'failed', { error: message })
      this.cfg.store.updateTaskStatus(task.id, 'failed', message)
      this.events.notifyStatus(task.id)
      appendSessionEntry(this.cfg.sessionDir, { type: 'error', task_id: task.id, timestamp: new Date().toISOString(), error: message })
      this.endSession(task.id, 'failed', Date.now() - startedAt)
    } finally {
      if (this.cfg.store.getActiveTurnId(task.id)) {
        this.cfg.store.endTurn(task.id, 'interrupted', { reason: 'execute_finally' })
      }
      this.asks.rejectPendingAsks(task.id, new DOMException('The operation was aborted.', 'AbortError'))
      this.running.delete(task.id)
    }
  }

  private endSession(taskId: string, status: string, durationMs: number): void {
    appendSessionEntry(this.cfg.sessionDir, {
      type: 'session_end', task_id: taskId, timestamp: new Date().toISOString(), status, duration_ms: durationMs,
    })
  }
}

function toSubagentInfo(r: SubagentRecord): SubagentInfo {
  return {
    id: r.id,
    parent_task_id: r.parent_task_id,
    parent_turn_id: r.parent_turn_id,
    subagent_type: r.subagent_type,
    description: r.description,
    status: r.status,
    isolation: r.isolation,
    cwd_root: r.cwd_root,
    worktree_path: r.worktree_path,
    completion_summary: r.completion_summary,
    resume_allowed: resumeAllowed(r.status),
    created_at: r.created_at,
    finished_at: r.finished_at,
  }
}

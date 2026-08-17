/**
 * [INPUT]: protocol/messages 线上形、全局 WebSocket（Node 22+ 与浏览器都内置）
 * [OUTPUT]: LumenClient —— 连接 agent-service 的类型化 WS 客户端(含 renameTask/Skills list/install/uninstall/activate)
 * [POS]: §4 agent↔UI 协议的 Node 客户端。回调与 list 返回值用 dto 线上形,不回灌 storage 实现形;
 *        本文件供无头测试。断线重连后对已知任务 subscribe(afterSeq) 拉齐。
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type {
  ClientMessage,
  Project,
  ServerMessage,
  SkillInfo,
  SkillInstallScope,
  Task,
  TaskEvent,
  WorkspaceAsset,
} from '../protocol/messages.ts'

type EventHandler = (event: TaskEvent) => void

export class LumenClient {
  private ws: WebSocket | null = null
  private readonly url: string
  private readonly handlers = new Set<EventHandler>()
  private readonly lastSeq = new Map<string, number>()
  private pendingCreated: ((taskId: string) => void) | null = null
  private pendingTasks: ((tasks: Task[]) => void) | null = null
  private pendingProjects: ((projects: Project[]) => void) | null = null
  private pendingProjectCreated: ((project: Project) => void) | null = null
  private pendingProjectUpdated: ((project: Project) => void) | null = null
  private pendingAssets: ((assets: WorkspaceAsset[]) => void) | null = null
  private pendingAsset: ((content: string) => void) | null = null
  private pendingSkills: ((skills: SkillInfo[]) => void) | null = null
  private pendingActivate: ((taskId: string) => void) | null = null
  private pendingOk: (() => void) | null = null
  private pendingError: ((err: Error) => void) | null = null

  constructor(url: string, options: { token?: string } = {}) {
    if (options.token) {
      const u = new URL(url)
      u.searchParams.set('token', options.token)
      this.url = u.toString()
    } else {
      this.url = url
    }
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url)
      this.ws = ws
      ws.addEventListener('open', () => resolve(), { once: true })
      ws.addEventListener('error', (e) => reject(e as unknown as Error), { once: true })
      ws.addEventListener('message', (ev) => this.onMessage(JSON.parse(String((ev as MessageEvent).data)) as ServerMessage))
    })
  }

  /** 断线后重连，并对所有已知任务用 afterSeq 拉齐 */
  async reconnect(): Promise<void> {
    await this.connect()
    for (const [taskId, seq] of this.lastSeq) this.send({ type: 'subscribe', taskId, afterSeq: seq })
  }

  onEvent(handler: EventHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  submit(projectId: string, userText: string): Promise<string> {
    return new Promise((resolve) => {
      this.pendingCreated = resolve
      this.send({ type: 'submit', projectId, userText })
    })
  }

  continueTask(taskId: string, userText: string): void {
    this.send({ type: 'continue', taskId, userText })
  }

  /** Phase B sidecar:等 ok.source / error */
  repairMermaid(taskId: string, source: string, error: string, projectId?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const onMsg = (ev: MessageEvent) => {
        try {
          const m = JSON.parse(String(ev.data)) as ServerMessage
          if (m.type === 'ok' && typeof m.source === 'string') {
            this.ws?.removeEventListener('message', onMsg)
            resolve(m.source)
          } else if (m.type === 'error') {
            this.ws?.removeEventListener('message', onMsg)
            reject(new Error(m.message))
          }
        } catch { /* ignore */ }
      }
      this.ws?.addEventListener('message', onMsg)
      try {
        this.send({ type: 'repair_mermaid', taskId, source, error, ...(projectId ? { projectId } : {}) })
      } catch (e) {
        this.ws?.removeEventListener('message', onMsg)
        reject(e)
      }
    })
  }

  subscribe(taskId: string): void {
    this.send({ type: 'subscribe', taskId, afterSeq: this.lastSeq.get(taskId) })
  }

  /** 整 task 取消 */
  cancel(taskId: string): void {
    this.send({ type: 'cancel', taskId })
  }

  /** 只停当前 turn（UI Stop 默认） */
  cancelTurn(taskId: string): void {
    this.send({ type: 'cancel_turn', taskId })
  }

  listSubagents(taskId: string): Promise<import('../protocol/messages.ts').SubagentInfo[]> {
    return new Promise((resolve, reject) => {
      const onMsg = (ev: MessageEvent) => {
        try {
          const m = JSON.parse(String(ev.data)) as import('../protocol/messages.ts').ServerMessage
          if (m.type === 'subagents' && m.taskId === taskId) {
            this.ws?.removeEventListener('message', onMsg)
            resolve(m.subagents)
          }
          if (m.type === 'error') {
            this.ws?.removeEventListener('message', onMsg)
            reject(new Error(m.message))
          }
        } catch { /* ignore */ }
      }
      this.ws?.addEventListener('message', onMsg)
      try {
        this.send({ type: 'list_subagents', taskId })
      } catch (e) {
        this.ws?.removeEventListener('message', onMsg)
        reject(e)
      }
    })
  }

  killSubagent(taskId: string, subagentId: string): void {
    this.send({ type: 'kill_subagent', taskId, subagentId })
  }

  archiveTask(taskId: string): void {
    this.send({ type: 'archive_task', taskId })
  }

  /** 人手改侧栏标题(写 title,不动 goal) */
  renameTask(taskId: string, title: string): void {
    this.send({ type: 'rename_task', taskId, title })
  }

  pinTask(taskId: string): void {
    this.send({ type: 'pin_task', taskId })
  }

  unpinTask(taskId: string): void {
    this.send({ type: 'unpin_task', taskId })
  }

  /** 解开挂起的 ask_user */
  answerUser(
    taskId: string,
    toolCallId: string,
    answers: Record<string, { selected: string[]; note?: string }>,
    opts?: { skipped?: boolean },
  ): void {
    this.send({
      type: 'answer_user',
      taskId,
      toolCallId,
      answers,
      ...(opts?.skipped ? { skipped: true } : {}),
    })
  }

  resume(taskId: string): void {
    this.send({ type: 'resume', taskId })
  }

  list(projectId?: string): Promise<Task[]> {
    return new Promise((resolve) => {
      this.pendingTasks = resolve
      this.send({ type: 'list', projectId })
    })
  }

  listProjects(): Promise<Project[]> {
    return new Promise((resolve) => {
      this.pendingProjects = resolve
      this.send({ type: 'list_projects' })
    })
  }

  createProject(name: string, sourcePath?: string): Promise<Project> {
    return new Promise((resolve) => {
      this.pendingProjectCreated = resolve
      this.send({ type: 'create_project', name, ...(sourcePath ? { sourcePath } : {}) })
    })
  }

  renameProject(projectId: string, name: string): Promise<Project> {
    return new Promise((resolve) => {
      this.pendingProjectUpdated = resolve
      this.send({ type: 'rename_project', projectId, name })
    })
  }

  archiveProject(projectId: string): void {
    this.send({ type: 'archive_project', projectId })
  }

  listAssets(projectId: string, taskId?: string): Promise<WorkspaceAsset[]> {
    return new Promise((resolve) => {
      this.pendingAssets = resolve
      this.send({ type: 'list_assets', projectId, taskId })
    })
  }

  readAsset(projectId: string, path: string, taskId?: string): Promise<string> {
    return new Promise((resolve) => {
      this.pendingAsset = resolve
      this.send({ type: 'read_asset', projectId, path, taskId })
    })
  }

  listSkills(projectId: string): Promise<SkillInfo[]> {
    return new Promise((resolve, reject) => {
      this.pendingSkills = resolve
      this.pendingError = reject
      this.send({ type: 'list_skills', projectId })
    })
  }

  installSkill(projectId: string, scope: SkillInstallScope, path: string): Promise<SkillInfo[]> {
    return new Promise((resolve, reject) => {
      this.pendingSkills = resolve
      this.pendingError = reject
      this.send({ type: 'install_skill', projectId, scope, path })
    })
  }

  uninstallSkill(projectId: string, scope: SkillInstallScope, name: string): Promise<SkillInfo[]> {
    return new Promise((resolve, reject) => {
      this.pendingSkills = resolve
      this.pendingError = reject
      this.send({ type: 'uninstall_skill', projectId, scope, name })
    })
  }

  /** 显式激活 skill;返回 taskId(可能新建草稿) */
  activateSkill(projectId: string, name: string, taskId?: string, args?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.pendingActivate = resolve
      this.pendingError = reject
      this.send({
        type: 'activate_skill',
        projectId,
        name,
        ...(taskId ? { taskId } : {}),
        ...(args ? { args } : {}),
      })
    })
  }

  close(): void {
    this.ws?.close()
    this.ws = null
  }

  private send(message: ClientMessage): void {
    if (this.ws && this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(message))
  }

  private onMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'task_created':
        // activate_skill 也可能回 task_created;优先 pendingActivate
        if (this.pendingActivate) {
          this.pendingActivate(message.taskId)
          this.pendingActivate = null
          this.pendingError = null
        } else {
          this.pendingCreated?.(message.taskId)
          this.pendingCreated = null
        }
        break
      case 'tasks':
        this.pendingTasks?.(message.tasks)
        this.pendingTasks = null
        break
      case 'projects':
        this.pendingProjects?.(message.projects)
        this.pendingProjects = null
        break
      case 'project_created':
        this.pendingProjectCreated?.(message.project)
        this.pendingProjectCreated = null
        break
      case 'project_updated':
        this.pendingProjectUpdated?.(message.project)
        this.pendingProjectUpdated = null
        break
      case 'assets':
        this.pendingAssets?.(message.assets)
        this.pendingAssets = null
        break
      case 'asset':
        this.pendingAsset?.(message.content)
        this.pendingAsset = null
        break
      case 'skills':
        this.pendingSkills?.(message.skills)
        this.pendingSkills = null
        this.pendingError = null
        break
      case 'ok':
        if (this.pendingActivate && message.taskId) {
          this.pendingActivate(message.taskId)
          this.pendingActivate = null
          this.pendingError = null
        } else {
          this.pendingOk?.()
          this.pendingOk = null
        }
        break
      case 'error':
        if (this.pendingError) {
          const rej = this.pendingError
          this.pendingError = null
          this.pendingSkills = null
          this.pendingActivate = null
          rej(new Error(message.message))
        }
        break
      case 'event':
        this.lastSeq.set(message.event.task_id, message.event.seq)
        for (const handler of this.handlers) handler(message.event)
        break
      default:
        break
    }
  }
}

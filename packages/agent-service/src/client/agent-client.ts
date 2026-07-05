/**
 * [INPUT]: 协议消息类型、全局 WebSocket（Node 22+ 与浏览器都内置）
 * [OUTPUT]: LumenClient —— 连接 agent-service 的类型化 WS 客户端
 * [POS]: §4 agent↔UI 协议的客户端侧。ui-client 复用它；也可在 Node 中无头测试
 *
 * 断线重连：reconnect() 后对已知任务用 subscribe(afterSeq) 拉齐，事件不丢不重。
 */
import type { Task, TaskEvent } from '../storage/task-store.ts'
import type { ClientMessage, ServerMessage } from '../protocol/messages.ts'
import type { WorkspaceAsset } from '../runtime/agent-runtime.ts'

type EventHandler = (event: TaskEvent) => void

export class LumenClient {
  private ws: WebSocket | null = null
  private readonly url: string
  private readonly handlers = new Set<EventHandler>()
  private readonly lastSeq = new Map<string, number>()
  private pendingCreated: ((taskId: string) => void) | null = null
  private pendingTasks: ((tasks: Task[]) => void) | null = null
  private pendingAssets: ((assets: WorkspaceAsset[]) => void) | null = null
  private pendingAsset: ((content: string) => void) | null = null

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

  subscribe(taskId: string): void {
    this.send({ type: 'subscribe', taskId, afterSeq: this.lastSeq.get(taskId) })
  }

  cancel(taskId: string): void {
    this.send({ type: 'cancel', taskId })
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
        this.pendingCreated?.(message.taskId)
        this.pendingCreated = null
        break
      case 'tasks':
        this.pendingTasks?.(message.tasks)
        this.pendingTasks = null
        break
      case 'assets':
        this.pendingAssets?.(message.assets)
        this.pendingAssets = null
        break
      case 'asset':
        this.pendingAsset?.(message.content)
        this.pendingAsset = null
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

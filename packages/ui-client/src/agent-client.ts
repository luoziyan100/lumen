/**
 * 浏览器侧 agent-service WS 客户端 + 协议类型。
 * 真实形态应从 @lumen/shared 导入协议类型；此处内联以便 ui-client 独立 scaffold。
 */
export interface TaskEvent {
  id: string
  task_id: string
  seq: number
  kind: string
  payload_json: string
  created_at: string
}
export interface Task {
  id: string
  project_id: string
  goal: string
  status: string
}

type ServerMessage =
  | { type: 'task_created'; taskId: string }
  | { type: 'event'; event: TaskEvent }
  | { type: 'tasks'; tasks: Task[] }
  | { type: 'ok'; taskId?: string }
  | { type: 'error'; message: string }

export class AgentClient {
  private ws: WebSocket | null = null
  private readonly handlers = new Set<(e: TaskEvent) => void>()
  private pendingCreated: ((id: string) => void) | null = null
  private readonly url: string

  constructor(url: string, token?: string) {
    if (token) {
      const u = new URL(url)
      u.searchParams.set('token', token)
      this.url = u.toString()
    } else {
      this.url = url
    }
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url)
      this.ws = ws
      ws.onopen = () => resolve()
      ws.onerror = (e) => reject(e)
      ws.onmessage = (ev) => this.onMessage(JSON.parse(ev.data) as ServerMessage)
    })
  }

  onEvent(handler: (e: TaskEvent) => void): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  submit(projectId: string, userText: string): Promise<string> {
    return new Promise((resolve) => {
      this.pendingCreated = resolve
      this.send({ type: 'submit', projectId, userText })
    })
  }

  cancel(taskId: string): void {
    this.send({ type: 'cancel', taskId })
  }

  close(): void {
    this.ws?.close()
    this.ws = null
  }

  private send(message: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message))
  }

  private onMessage(message: ServerMessage): void {
    if (message.type === 'task_created') {
      this.pendingCreated?.(message.taskId)
      this.pendingCreated = null
    } else if (message.type === 'event') {
      for (const handler of this.handlers) handler(message.event)
    }
  }
}

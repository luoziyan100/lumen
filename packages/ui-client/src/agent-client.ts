/**
 * 浏览器侧 agent-service 客户端:WS(对话/资产)+ HTTP(PDF 取件/上传)。
 * 协议类型内联(将来从 @lumen/shared 导入)。
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
export interface Asset {
  path: string
  kind: 'pdf' | 'doc' | 'html' | 'image' | 'file'
  name: string
}

/** 聊天粘贴的图片,随消息进模型(多模态) */
export interface ImageData {
  mediaType: string
  base64: string
}

/** 设置(服务端只回掩码,不回明文 key) */
export interface PublicModelProfile {
  id: string
  name: string
  provider: 'anthropic' | 'openai'
  baseUrl: string
  model: string
  hasApiKey: boolean
  apiKeyMasked: string
}
export interface PublicSettings {
  profiles: PublicModelProfile[]
  activeProfileId: string | null
  userInstructions: string
}
export interface SettingsPatch {
  userInstructions?: string
  upsertProfile?: {
    id?: string // 缺省=新建
    name?: string
    provider?: 'anthropic' | 'openai'
    baseUrl?: string
    apiKey?: string // 非空才替换
    model?: string
  }
  deleteProfileId?: string
  activeProfileId?: string
}

type ServerMessage =
  | { type: 'task_created'; taskId: string }
  | { type: 'event'; event: TaskEvent }
  | { type: 'tasks'; tasks: Task[] }
  | { type: 'assets'; assets: Asset[] }
  | { type: 'asset'; path: string; content: string }
  | { type: 'settings'; settings: PublicSettings }
  | { type: 'ok'; taskId?: string }
  | { type: 'error'; message: string }

export class AgentClient {
  private ws: WebSocket | null = null
  private readonly handlers = new Set<(e: TaskEvent) => void>()
  private readonly closeHandlers = new Set<(code: number, reason: string) => void>()
  private pendingCreated: ((id: string) => void) | null = null
  private pendingTasks: ((tasks: Task[]) => void) | null = null
  private pendingAssets: ((assets: Asset[]) => void) | null = null
  private pendingAsset: ((content: string) => void) | null = null
  private pendingSettings: ((settings: PublicSettings) => void) | null = null
  private readonly url: string
  private readonly httpBase: string
  private readonly token?: string

  constructor(url: string, token?: string) {
    this.token = token
    const u = new URL(url)
    this.httpBase = `${u.protocol === 'wss:' ? 'https:' : 'http:'}//${u.host}`
    if (token) u.searchParams.set('token', token)
    this.url = u.toString()
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url)
      this.ws = ws
      let opened = false
      ws.onopen = () => { opened = true; resolve() }
      ws.onerror = (e) => { if (!opened) reject(e) }
      // 握手成功后被服务端 4401 踢掉时 onopen 已 resolve,只有 onclose 能告诉我们"被拒"
      ws.onclose = (ev) => { for (const h of this.closeHandlers) h(ev.code, ev.reason) }
      ws.onmessage = (ev) => this.onMessage(JSON.parse(ev.data) as ServerMessage)
    })
  }

  onClose(handler: (code: number, reason: string) => void): () => void {
    this.closeHandlers.add(handler)
    return () => this.closeHandlers.delete(handler)
  }

  onEvent(handler: (e: TaskEvent) => void): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  submit(projectId: string, userText: string, images?: ImageData[]): Promise<string> {
    return new Promise((resolve) => {
      this.pendingCreated = resolve
      this.send({ type: 'submit', projectId, userText, ...(images?.length ? { images } : {}) })
    })
  }

  continueTask(taskId: string, userText: string, images?: ImageData[]): void {
    this.send({ type: 'continue', taskId, userText, ...(images?.length ? { images } : {}) })
  }

  /** attach 已有 task:服务端回放历史事件 + 订阅新事件(刷新恢复用) */
  subscribe(taskId: string): void {
    this.send({ type: 'subscribe', taskId })
  }

  cancel(taskId: string): void {
    this.send({ type: 'cancel', taskId })
  }

  /** 会话历史 = 本项目的 task 列表(服务端按创建时间倒序) */
  list(projectId: string): Promise<Task[]> {
    return new Promise((resolve) => {
      this.pendingTasks = resolve
      this.send({ type: 'list', projectId })
    })
  }

  // ---- 设置(WS) ----
  getSettings(): Promise<PublicSettings> {
    return new Promise((resolve) => {
      this.pendingSettings = resolve
      this.send({ type: 'get_settings' })
    })
  }

  updateSettings(patch: SettingsPatch): Promise<PublicSettings> {
    return new Promise((resolve) => {
      this.pendingSettings = resolve
      this.send({ type: 'update_settings', settings: patch })
    })
  }

  // ---- 工作区资产(WS) ----
  listAssets(projectId: string, taskId?: string): Promise<Asset[]> {
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

  // ---- PDF(HTTP) ----
  /** PDF 原件 URL,给 pdf.js 直接 fetch(带 token) */
  pdfUrl(projectId: string, path: string, taskId?: string): string {
    const u = new URL('/pdf', this.httpBase)
    u.searchParams.set('project', projectId)
    u.searchParams.set('path', path)
    if (taskId) u.searchParams.set('task', taskId)
    if (this.token) u.searchParams.set('token', this.token)
    return u.toString()
  }

  /** 上传任意文件(PDF/文档/图片…),服务端按类型归位工作区,返回相对路径 */
  async uploadFile(projectId: string, file: File, taskId?: string): Promise<string> {
    const u = new URL('/upload', this.httpBase)
    u.searchParams.set('project', projectId)
    u.searchParams.set('name', file.name)
    if (taskId) u.searchParams.set('task', taskId)
    if (this.token) u.searchParams.set('token', this.token)
    const res = await fetch(u.toString(), { method: 'POST', body: file })
    return ((await res.json()) as { path: string }).path
  }

  close(): void {
    this.ws?.close()
    this.ws = null
  }

  private send(message: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message))
  }

  private onMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'task_created':
        this.pendingCreated?.(message.taskId)
        this.pendingCreated = null
        break
      case 'event':
        for (const handler of this.handlers) handler(message.event)
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
      case 'settings':
        this.pendingSettings?.(message.settings)
        this.pendingSettings = null
        break
      default:
        break
    }
  }
}

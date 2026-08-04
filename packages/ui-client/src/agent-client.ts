/**
 * [INPUT]: agent-service WS/HTTP 协议(messages 真源的浏览器侧内联副本);
 *          运行时读 window.__LUMEN_WS__/__LUMEN_TOKEN__(Tauri 注入,可晚于首屏)
 * [OUTPUT]: AgentClient —— connect/submit/continue/archiveTask/answerUser/listProjects/createProject/设置与资产
 * [POS]: UI 唯一出站口;connect 每次解析端点并把 localhost→127.0.0.1(防 IPv6 假死);
 *        send 在 WS 非 OPEN 时必须失败,continue/archive/answer_user 等 ok/error 回执
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md;改消息格式须三处同步
 */

/** ask_user 作答(与 service AnswerUserPayload 同构) */
export interface AnswerUserPayload {
  answers: Record<string, { selected: string[]; note?: string }>
  skipped?: boolean
}
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
  created_at?: string
}
export interface Asset {
  path: string
  kind: 'pdf' | 'doc' | 'html' | 'image' | 'file'
  name: string
  /** shared=项目共享区;session=当前会话目录 */
  scope?: 'shared' | 'session'
}

/** 一等项目(与 service ProjectStore 对齐) */
export interface Project {
  id: string
  name: string
  /** 可选本机源文件夹;agent 只读挂载为 library/ */
  source_path?: string | null
  created_at: string
  updated_at: string
}

/** demo 模式:浏览器随连接带入的模型配置(含用户自己的 key),后端只在连接内存持有、不落盘 */
export interface ConnModelConfig {
  provider: 'anthropic' | 'openai'
  model: string
  apiKey: string
  baseUrl?: string
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
  | { type: 'hello'; demo: boolean }
  | { type: 'task_created'; taskId: string }
  | { type: 'event'; event: TaskEvent }
  | { type: 'tasks'; tasks: Task[] }
  | { type: 'projects'; projects: Project[] }
  | { type: 'project_created'; project: Project }
  | { type: 'assets'; assets: Asset[] }
  | { type: 'asset'; path: string; content: string }
  | { type: 'settings'; settings: PublicSettings }
  | { type: 'ok'; taskId?: string }
  | { type: 'error'; message: string }

/** 解析当前应连的端点。Tauri 注入可晚于模块求值,故每次 connect 重读 window。 */
function resolveServiceEndpoint(fallbackUrl: string, fallbackToken?: string): { wsUrl: string; httpBase: string } {
  const w = window as { __LUMEN_WS__?: string; __LUMEN_TOKEN__?: string }
  const raw = (w.__LUMEN_WS__ || fallbackUrl).trim() || 'ws://127.0.0.1:8787'
  const token = (w.__LUMEN_TOKEN__ || fallbackToken || '').trim() || undefined
  const u = new URL(raw)
  // service 默认只听 127.0.0.1;localhost→::1 会连不上
  if (u.hostname === 'localhost' || u.hostname === '[::1]' || u.hostname === '::1') {
    u.hostname = '127.0.0.1'
  }
  const httpBase = `${u.protocol === 'wss:' ? 'https:' : 'http:'}//${u.host}`
  if (token) u.searchParams.set('token', token)
  return { wsUrl: u.toString(), httpBase }
}

export class AgentClient {
  private ws: WebSocket | null = null
  private readonly handlers = new Set<(e: TaskEvent) => void>()
  private readonly closeHandlers = new Set<(code: number, reason: string) => void>()
  private pendingCreated: ((id: string) => void) | null = null
  private pendingTasks: ((tasks: Task[]) => void) | null = null
  private pendingProjects: { resolve: (p: Project[]) => void; reject: (e: Error) => void } | null = null
  private pendingProjectCreated: { resolve: (p: Project) => void; reject: (e: Error) => void } | null = null
  private pendingAssets: ((assets: Asset[]) => void) | null = null
  private pendingAsset: ((content: string) => void) | null = null
  private pendingSettings: ((settings: PublicSettings) => void) | null = null
  /** continue/cancel 等等待服务端 ok|error 的回执(禁 fire-and-forget) */
  private pendingAck: { resolve: () => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null
  private url: string
  private httpBase: string
  private readonly fallbackUrl: string
  private readonly fallbackToken?: string
  /** 服务端是否 demo 模式(公网多访客,key 走浏览器);连接后由 hello 事件置位 */
  demo = false
  private readonly helloHandlers = new Set<(demo: boolean) => void>()

  constructor(url: string, token?: string) {
    this.fallbackUrl = url
    this.fallbackToken = token
    const ep = resolveServiceEndpoint(url, token)
    this.url = ep.wsUrl
    this.httpBase = ep.httpBase
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  private currentToken(): string | undefined {
    const w = window as { __LUMEN_TOKEN__?: string }
    return (w.__LUMEN_TOKEN__ || this.fallbackToken || '').trim() || undefined
  }

  connect(): Promise<void> {
    // 每次重解析:壳可能在首屏后才注入 __LUMEN_WS__
    const ep = resolveServiceEndpoint(this.fallbackUrl, this.fallbackToken)
    this.url = ep.wsUrl
    this.httpBase = ep.httpBase
    // 已打开则复用,避免重连时叠多条 socket
    if (this.ws?.readyState === WebSocket.OPEN) return Promise.resolve()
    if (this.ws?.readyState === WebSocket.CONNECTING) {
      return new Promise((resolve, reject) => {
        const ws = this.ws!
        const onOpen = () => { cleanup(); resolve() }
        const onErr = (e: Event) => { cleanup(); reject(e) }
        const cleanup = () => {
          ws.removeEventListener('open', onOpen)
          ws.removeEventListener('error', onErr)
        }
        ws.addEventListener('open', onOpen)
        ws.addEventListener('error', onErr)
      })
    }
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url)
      this.ws = ws
      let opened = false
      ws.onopen = () => { opened = true; resolve() }
      ws.onerror = (e) => { if (!opened) reject(e) }
      // 握手成功后被服务端 4401 踢掉时 onopen 已 resolve,只有 onclose 能告诉我们"被拒"
      ws.onclose = (ev) => {
        this.rejectPendingAck(new Error('连接已断开'))
        for (const h of this.closeHandlers) h(ev.code, ev.reason)
      }
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
    return new Promise((resolve, reject) => {
      try {
        this.pendingCreated = resolve
        this.send({ type: 'submit', projectId, userText, ...(images?.length ? { images } : {}) })
      } catch (e) {
        this.pendingCreated = null
        reject(e)
      }
    })
  }

  /** 草稿会话:只建档不开跑。新对话先上传文件 → 文件立刻归入会话工作区 */
  createTask(projectId: string, goal?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        this.pendingCreated = resolve
        this.send({ type: 'create_task', projectId, ...(goal ? { goal } : {}) })
      } catch (e) {
        this.pendingCreated = null
        reject(e)
      }
    })
  }

  /** 续聊:等服务端 ok/error。失败时(未连上/任务在跑/forbidden)必须 reject,UI 才能收回「思考中」 */
  continueTask(taskId: string, userText: string, images?: ImageData[], projectId?: string): Promise<void> {
    const ack = this.expectAck()
    try {
      this.send({ type: 'continue', taskId, userText, ...(images?.length ? { images } : {}), ...(projectId ? { projectId } : {}) })
    } catch (e) {
      this.rejectPendingAck(e instanceof Error ? e : new Error(String(e)))
    }
    return ack
  }

  /** attach 已有 task:服务端回放历史事件 + 订阅新事件(刷新恢复用) */
  subscribe(taskId: string, projectId?: string): void {
    this.send({ type: 'subscribe', taskId, ...(projectId ? { projectId } : {}) })
  }

  cancel(taskId: string, projectId?: string): void {
    this.send({ type: 'cancel', taskId, ...(projectId ? { projectId } : {}) })
  }

  /** 软归档:列表隐藏;等 ok/error */
  archiveTask(taskId: string, projectId?: string): Promise<void> {
    const ack = this.expectAck()
    try {
      this.send({ type: 'archive_task', taskId, ...(projectId ? { projectId } : {}) })
    } catch (e) {
      this.rejectPendingAck(e instanceof Error ? e : new Error(String(e)))
    }
    return ack
  }

  /** 解开挂起的 ask_user;等 ok/error */
  answerUser(
    taskId: string,
    toolCallId: string,
    payload: AnswerUserPayload,
    projectId?: string,
  ): Promise<void> {
    const ack = this.expectAck()
    try {
      this.send({
        type: 'answer_user',
        taskId,
        toolCallId,
        answers: payload.answers ?? {},
        ...(payload.skipped ? { skipped: true } : {}),
        ...(projectId ? { projectId } : {}),
      })
    } catch (e) {
      this.rejectPendingAck(e instanceof Error ? e : new Error(String(e)))
    }
    return ack
  }

  /** 会话历史 = 本项目的 task 列表(服务端按创建时间倒序) */
  list(projectId: string): Promise<Task[]> {
    return new Promise((resolve) => {
      this.pendingTasks = resolve
      this.send({ type: 'list', projectId })
    })
  }

  listProjects(): Promise<Project[]> {
    return new Promise((resolve, reject) => {
      try {
        this.pendingProjects = { resolve, reject }
        this.send({ type: 'list_projects' })
      } catch (e) {
        this.pendingProjects = null
        reject(e)
      }
    })
  }

  createProject(name: string, sourcePath?: string): Promise<Project> {
    return new Promise((resolve, reject) => {
      try {
        this.pendingProjectCreated = { resolve, reject }
        this.send({ type: 'create_project', name, ...(sourcePath ? { sourcePath } : {}) })
      } catch (e) {
        this.pendingProjectCreated = null
        reject(e)
      }
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
    if (this.currentToken()) u.searchParams.set('token', this.currentToken()!)
    return u.toString()
  }

  /** 上传任意文件;scope=shared 写入项目共享区,否则进会话目录 */
  async uploadFile(
    projectId: string,
    file: File,
    taskId?: string,
    scope: 'shared' | 'session' = 'session',
  ): Promise<string> {
    const u = new URL('/upload', this.httpBase)
    u.searchParams.set('project', projectId)
    u.searchParams.set('name', file.name)
    if (taskId) u.searchParams.set('task', taskId)
    if (scope === 'shared') u.searchParams.set('scope', 'shared')
    if (this.currentToken()) u.searchParams.set('token', this.currentToken()!)
    const res = await fetch(u.toString(), { method: 'POST', body: file })
    return ((await res.json()) as { path: string }).path
  }

  /** demo:把本连接的模型配置(含用户自己的 key)发给后端,只在连接内存生效、不落盘 */
  setModel(config: ConnModelConfig): void {
    this.send({ type: 'set_model', config })
  }

  onHello(handler: (demo: boolean) => void): () => void {
    this.helloHandlers.add(handler)
    return () => this.helloHandlers.delete(handler)
  }

  close(): void {
    this.rejectPendingAck(new Error('连接已关闭'))
    this.ws?.close()
    this.ws = null
  }

  /** WS 非 OPEN 一律抛错——静默丢包会让 UI 假「思考中」且用户气泡永不出现 */
  private send(message: unknown): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      throw new Error('未连接到 agent-service(连接已断开)。请稍候重连后重试,或刷新窗口。')
    }
    this.ws.send(JSON.stringify(message))
  }

  private expectAck(ms = 15_000): Promise<void> {
    if (this.pendingAck) this.rejectPendingAck(new Error('上一次请求尚未完成'))
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingAck) {
          this.pendingAck = null
          reject(new Error('等待服务端确认超时'))
        }
      }, ms)
      this.pendingAck = { resolve, reject, timer }
    })
  }

  private resolvePendingAck(): void {
    const p = this.pendingAck
    if (!p) return
    this.pendingAck = null
    clearTimeout(p.timer)
    p.resolve()
  }

  private rejectPendingAck(err: Error): void {
    const p = this.pendingAck
    if (!p) return
    this.pendingAck = null
    clearTimeout(p.timer)
    p.reject(err)
  }

  private onMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'hello':
        this.demo = message.demo
        // demo:连接/重连建立后,若浏览器存过自己的 key,自动注入本连接(后端不落盘)
        if (message.demo) {
          try {
            const raw = sessionStorage.getItem('lumen:demoModel') // 本次会话内持有,关标签页即清
            if (raw) this.setModel(JSON.parse(raw) as ConnModelConfig)
          } catch { /* localStorage 不可用或损坏,忽略 */ }
        }
        for (const h of this.helloHandlers) h(message.demo)
        break
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
      case 'projects':
        this.pendingProjects?.resolve(message.projects)
        this.pendingProjects = null
        break
      case 'project_created':
        this.pendingProjectCreated?.resolve(message.project)
        this.pendingProjectCreated = null
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
      case 'ok':
        this.resolvePendingAck()
        break
      case 'error': {
        const err = new Error(message.message || '请求失败')
        if (this.pendingAck) this.rejectPendingAck(err)
        if (this.pendingProjectCreated) {
          const p = this.pendingProjectCreated
          this.pendingProjectCreated = null
          p.reject(err)
        }
        if (this.pendingProjects) {
          const p = this.pendingProjects
          this.pendingProjects = null
          p.reject(err)
        }
        break
      }
      default:
        break
    }
  }
}

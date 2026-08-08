/**
 * [INPUT]: ws、AgentRuntime、协议消息类型
 * [OUTPUT]: startServer —— 把 AgentRuntime 暴露为 localhost WebSocket 服务
 * [POS]: §4 服务边界。一条连接可 submit/subscribe/cancel/resume/archive_task/rename_task/pin_task/unpin_task/answer_user/list，service 推 event 流
 *
 * 断线重连用 subscribe.afterSeq 拉齐遗漏事件（事件 seq 单调，不丢不重）。
 * 鉴权：浏览器对 ws://127.0.0.1 没有跨源限制，任意网页都能发起连接——
 * 所以凡传入 token 必须校验（?token= 查询参数；浏览器 WS 设不了自定义 header）。
 */
import { WebSocketServer, type WebSocket } from 'ws'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AgentRuntime } from '../runtime/agent-runtime.ts'
import type { ClientMessage, ServerMessage, ConnModelConfig } from './messages.ts'
import type { PublicSettings, SettingsPatch } from '../storage/settings.ts'
import type { ModelPort } from '../core/model-port.ts'

export interface ServerHandle {
  port: number
  close: () => Promise<void>
}

/** 设置读写口(由 service 注入;get 只返回掩码视图,明文 key 不出服务) */
export interface SettingsApi {
  get: () => PublicSettings
  update: (patch: SettingsPatch) => PublicSettings
}

export function startServer(
  runtime: AgentRuntime,
  options: { port?: number; host?: string; token?: string; settings?: SettingsApi; maxUploadBytes?: number; demo?: boolean; buildModel?: (cfg: ConnModelConfig) => ModelPort } = {},
): Promise<ServerHandle> {
  return new Promise((resolve) => {
    // http server 同时承载:WS(对话/事件) + HTTP(/pdf 取 PDF 二进制、/upload 上传 PDF)
    const httpServer = createServer((req, res) => {
      handleHttp(runtime, options.token, req, res, maxUpload).catch(() => {
        if (!res.headersSent) res.writeHead(500)
        res.end('error')
      })
    })
    const maxUpload = options.maxUploadBytes ?? 25 * 1024 * 1024
    const wss = new WebSocketServer({ server: httpServer, maxPayload: 32 * 1024 * 1024 }) // 单帧上限,防超大 WS 消息打爆内存
    wss.on('connection', (ws, req) => {
      if (options.token && !isAuthorized(req, options.token)) {
        ws.close(4401, 'unauthorized')
        return
      }
      handleConnection(runtime, ws, options.settings, options.demo ?? false, options.buildModel)
    })
    httpServer.listen(options.port ?? 0, options.host ?? '127.0.0.1', () => {
      const address = httpServer.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({
        port,
        close: () => new Promise<void>((done) => { wss.close(); httpServer.close(() => done()) }),
      })
    })
  })
}

function isAuthorized(req: IncomingMessage, token: string): boolean {
  const url = new URL(req.url ?? '/', 'ws://127.0.0.1')
  return url.searchParams.get('token') === token
}

function setCors(res: ServerResponse): void {
  res.setHeader('access-control-allow-origin', '*') // 本地 dev:浏览器从 5180 跨端口取;有 token 兜底
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
  res.setHeader('access-control-allow-headers', 'content-type')
}

async function handleHttp(
  runtime: AgentRuntime,
  token: string | undefined,
  req: IncomingMessage,
  res: ServerResponse,
  maxUploadBytes = 25 * 1024 * 1024,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  setCors(res)
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
  if (token && url.searchParams.get('token') !== token) { res.writeHead(401); res.end('unauthorized'); return }
  const project = url.searchParams.get('project') ?? 'default'

  // 取 PDF 原件(给前端 pdf.js 渲染);路径经工作区沙箱校验
  if (req.method === 'GET' && url.pathname === '/pdf') {
    const bytes = await runtime.readAssetBytes(project, url.searchParams.get('path') ?? '', url.searchParams.get('task') ?? undefined)
    if (!bytes) { res.writeHead(404); res.end('not found'); return }
    res.writeHead(200, { 'content-type': 'application/pdf' })
    res.end(Buffer.from(bytes))
    return
  }

  // 用户上传 PDF → 存进工作区 papers/ 原件
  if (req.method === 'POST' && url.pathname === '/upload') {
    const chunks: Buffer[] = []
    let total = 0
    for await (const chunk of req) {
      total += (chunk as Buffer).length
      if (total > maxUploadBytes) { res.writeHead(413); res.end('upload too large'); req.destroy(); return } // 公网防塞爆磁盘/内存
      chunks.push(chunk as Buffer)
    }
    const scope = url.searchParams.get('scope') === 'shared' ? 'shared' as const : 'session' as const
    const saved = await runtime.saveUpload(
      project,
      url.searchParams.get('name') ?? 'upload.pdf',
      new Uint8Array(Buffer.concat(chunks)),
      url.searchParams.get('task') ?? undefined,
      scope,
    )
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ path: saved }))
    return
  }

  res.writeHead(404)
  res.end('not found')
}

function handleConnection(runtime: AgentRuntime, ws: WebSocket, settingsApi?: SettingsApi, demo = false, buildModel?: (cfg: ConnModelConfig) => ModelPort): void {
  const unsubs = new Map<string, () => void>()
  const send = (message: ServerMessage): void => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message))
  }
  // demo:该连接自带的 model(浏览器随 set_model 送来的 key 构建),只在连接内存、断开即弃、绝不落盘
  let connModel: ModelPort | undefined
  // 访客隔离:demo 模式下 taskId 操作必须归属于消息带的 projectId(防访客 A 用 B 的 taskId 越权);本地不校验
  const ownsTask = (taskId: string, projectId?: string): boolean => {
    if (!demo) return true
    const owner = runtime.taskProject(taskId)
    return owner == null || owner === projectId // 不存在的 task 交下游返错;存在则必须归属匹配
  }
  send({ type: 'hello', demo })

  const offTaskMeta = runtime.onTaskUpdated((task) => {
    send({ type: 'task_updated', task })
  })

  // 回放与订阅解耦:UI 每次点进会话都清屏、靠回放重建,回放不能因"已订阅"跳过
  // (曾致看过的会话再点回去一片空白);监听器仍按连接去重,新事件不会推两遍。
  const subscribe = (taskId: string, afterSeq?: number, replay = true): void => {
    if (replay) for (const event of runtime.listEvents(taskId, afterSeq)) send({ type: 'event', event })
    if (!unsubs.has(taskId)) unsubs.set(taskId, runtime.subscribe(taskId, (event) => send({ type: 'event', event })))
  }

  ws.on('close', () => {
    offTaskMeta()
    for (const off of unsubs.values()) off()
    unsubs.clear()
  })

  ws.on('message', (raw: unknown) => {
    let message: ClientMessage
    try {
      message = JSON.parse(String(raw)) as ClientMessage
    } catch {
      send({ type: 'error', message: 'invalid json' })
      return
    }
    switch (message.type) {
      case 'set_model':
        if (demo && buildModel) { connModel = buildModel(message.config); send({ type: 'ok' }) }
        else send({ type: 'error', message: 'set_model 仅 demo 模式可用' })
        break
      case 'submit': {
        const taskId = runtime.submit({ projectId: message.projectId, userText: message.userText, images: message.images }, connModel)
        send({ type: 'task_created', taskId })
        subscribe(taskId)
        break
      }
      case 'create_task': {
        // 草稿会话:只建档不开跑。新对话先上传文件 → 文件立刻归入会话工作区;首条消息走 continue
        const taskId = runtime.createDraft(message.projectId, message.goal || '新对话')
        send({ type: 'task_created', taskId })
        subscribe(taskId)
        break
      }
      case 'continue': {
        if (!ownsTask(message.taskId, message.projectId)) { send({ type: 'error', message: 'forbidden' }); break }
        const ok = runtime.continueTask(message.taskId, message.userText, message.images, connModel)
        if (ok) subscribe(message.taskId, undefined, false) // 续聊不回放:客户端没清屏,回放会把记录翻倍
        send({ type: ok ? 'ok' : 'error', ...(ok ? { taskId: message.taskId } : { message: 'continue failed: task 不存在或正在运行' }) } as ServerMessage)
        break
      }
      case 'subscribe':
        if (!ownsTask(message.taskId, message.projectId)) { send({ type: 'error', message: 'forbidden' }); break }
        subscribe(message.taskId, message.afterSeq)
        break
      case 'cancel':
        if (!ownsTask(message.taskId, message.projectId)) { send({ type: 'error', message: 'forbidden' }); break }
        runtime.cancel(message.taskId)
        send({ type: 'ok', taskId: message.taskId })
        break
      case 'archive_task': {
        if (!ownsTask(message.taskId, message.projectId)) { send({ type: 'error', message: 'forbidden' }); break }
        const archived = runtime.archiveTask(message.taskId)
        send(archived
          ? { type: 'ok', taskId: message.taskId }
          : { type: 'error', message: 'archive failed: task 不存在' })
        break
      }
      case 'rename_task': {
        if (!ownsTask(message.taskId, message.projectId)) { send({ type: 'error', message: 'forbidden' }); break }
        try {
          const updated = runtime.renameTaskTitle(message.taskId, message.title)
          if (!updated) send({ type: 'error', message: 'rename failed: task 不存在' })
          else send({ type: 'ok', taskId: message.taskId })
        } catch (e) {
          send({ type: 'error', message: e instanceof Error ? e.message : 'rename_task 失败' })
        }
        break
      }
      case 'pin_task': {
        if (!ownsTask(message.taskId, message.projectId)) { send({ type: 'error', message: 'forbidden' }); break }
        {
          const updated = runtime.setTaskPinned(message.taskId, true)
          send(updated
            ? { type: 'ok', taskId: message.taskId }
            : { type: 'error', message: 'pin failed: task 不存在' })
        }
        break
      }
      case 'unpin_task': {
        if (!ownsTask(message.taskId, message.projectId)) { send({ type: 'error', message: 'forbidden' }); break }
        {
          const updated = runtime.setTaskPinned(message.taskId, false)
          send(updated
            ? { type: 'ok', taskId: message.taskId }
            : { type: 'error', message: 'unpin failed: task 不存在' })
        }
        break
      }
      case 'answer_user': {
        if (!ownsTask(message.taskId, message.projectId)) { send({ type: 'error', message: 'forbidden' }); break }
        const answered = runtime.answerUser(message.taskId, message.toolCallId, {
          answers: message.answers ?? {},
          ...(message.skipped ? { skipped: true } : {}),
        })
        send(answered
          ? { type: 'ok', taskId: message.taskId }
          : { type: 'error', message: 'answer_user failed: 无匹配的挂起提问' })
        break
      }
      case 'resume':
        if (!ownsTask(message.taskId, message.projectId)) { send({ type: 'error', message: 'forbidden' }); break }
        void runtime.resume(message.taskId, connModel).then((ok) => {
          if (ok) subscribe(message.taskId)
          send({ type: 'ok', taskId: message.taskId })
        })
        break
      case 'list': {
        // demo:必须带 projectId,否则空列表(防漏列全库会话)
        if (demo && !message.projectId) { send({ type: 'tasks', tasks: [] }); break }
        const tasks = runtime.listTasks(message.projectId)
        send({ type: 'tasks', tasks })
        runtime.enqueueTitleBackfill(tasks, connModel)
        break
      }      case 'list_projects':
        // demo:不暴露全库项目名册;访客 UI 用本地 visitor id 合成单项目
        if (demo) { send({ type: 'projects', projects: [] }); break }
        send({ type: 'projects', projects: runtime.listProjects() })
        break
      case 'create_project':
        if (demo) { send({ type: 'error', message: 'demo 模式不支持创建项目' }); break }
        try {
          send({
            type: 'project_created',
            project: runtime.createProject(message.name, message.sourcePath),
          })
        } catch (e) {
          send({ type: 'error', message: e instanceof Error ? e.message : 'create_project 失败' })
        }
        break
      case 'rename_project':
        if (demo) { send({ type: 'error', message: 'demo 模式不支持重命名项目' }); break }
        try {
          const updated = runtime.renameProject(message.projectId, message.name)
          if (!updated) send({ type: 'error', message: 'rename failed: 项目不存在或不可改' })
          else send({ type: 'project_updated', project: updated })
        } catch (e) {
          send({ type: 'error', message: e instanceof Error ? e.message : 'rename_project 失败' })
        }
        break
      case 'archive_project':
        if (demo) { send({ type: 'error', message: 'demo 模式不支持归档项目' }); break }
        {
          const archived = runtime.archiveProject(message.projectId)
          send(archived
            ? { type: 'ok' }
            : { type: 'error', message: 'archive failed: 项目不存在或不可归档' })
        }
        break
      case 'list_assets':
        void runtime.listAssets(message.projectId, message.taskId).then((assets) => send({ type: 'assets', assets }))
        break
      case 'read_asset':
        void runtime
          .readAsset(message.projectId, message.path, message.taskId)
          .then((content) => send({ type: 'asset', path: message.path, content: content ?? '' }))
        break
      case 'list_skills':
        send({ type: 'skills', skills: runtime.listSkills(message.projectId) })
        break
      case 'install_skill':
        if (demo) { send({ type: 'error', message: 'demo 模式不支持安装 skill' }); break }
        try {
          send({
            type: 'skills',
            skills: runtime.installSkill(message.projectId, message.scope, message.path),
          })
        } catch (e) {
          send({ type: 'error', message: e instanceof Error ? e.message : 'install_skill 失败' })
        }
        break
      case 'uninstall_skill':
        if (demo) { send({ type: 'error', message: 'demo 模式不支持卸载 skill' }); break }
        try {
          send({
            type: 'skills',
            skills: runtime.uninstallSkill(message.projectId, message.scope, message.name),
          })
        } catch (e) {
          send({ type: 'error', message: e instanceof Error ? e.message : 'uninstall_skill 失败' })
        }
        break
      case 'activate_skill': {
        const r = runtime.activateSkillOnTask(message.projectId, message.name, {
          taskId: message.taskId,
          args: message.args,
          model: connModel,
        })
        if (!r.ok) {
          send({ type: 'error', message: r.error })
          break
        }
        if (r.created) send({ type: 'task_created', taskId: r.taskId })
        subscribe(r.taskId, undefined, !r.created) // 新建回放;已有会话不回放防翻倍
        send({ type: 'ok', taskId: r.taskId })
        break
      }
      case 'get_settings':
        if (settingsApi) send({ type: 'settings', settings: settingsApi.get() })
        else send({ type: 'error', message: 'settings 不可用' })
        break
      case 'update_settings':
        if (settingsApi) send({ type: 'settings', settings: settingsApi.update(message.settings) })
        else send({ type: 'error', message: 'settings 不可用' })
        break
      default:
        send({ type: 'error', message: 'unknown message type' })
    }
  })
}

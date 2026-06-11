/**
 * [INPUT]: ws、AgentRuntime、协议消息类型
 * [OUTPUT]: startServer —— 把 AgentRuntime 暴露为 localhost WebSocket 服务
 * [POS]: §4 服务边界。一条连接可 submit/subscribe/cancel/resume/list，service 推 event 流
 *
 * 断线重连用 subscribe.afterSeq 拉齐遗漏事件（事件 seq 单调，不丢不重）。
 * 鉴权：浏览器对 ws://127.0.0.1 没有跨源限制，任意网页都能发起连接——
 * 所以凡传入 token 必须校验（?token= 查询参数；浏览器 WS 设不了自定义 header）。
 */
import { WebSocketServer, type WebSocket } from 'ws'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AgentRuntime } from '../runtime/agent-runtime.ts'
import type { ClientMessage, ServerMessage } from './messages.ts'

export interface ServerHandle {
  port: number
  close: () => Promise<void>
}

export function startServer(
  runtime: AgentRuntime,
  options: { port?: number; host?: string; token?: string } = {},
): Promise<ServerHandle> {
  return new Promise((resolve) => {
    // http server 同时承载:WS(对话/事件) + HTTP(/pdf 取 PDF 二进制、/upload 上传 PDF)
    const httpServer = createServer((req, res) => {
      handleHttp(runtime, options.token, req, res).catch(() => {
        if (!res.headersSent) res.writeHead(500)
        res.end('error')
      })
    })
    const wss = new WebSocketServer({ server: httpServer })
    wss.on('connection', (ws, req) => {
      if (options.token && !isAuthorized(req, options.token)) {
        ws.close(4401, 'unauthorized')
        return
      }
      handleConnection(runtime, ws)
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
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  setCors(res)
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
  if (token && url.searchParams.get('token') !== token) { res.writeHead(401); res.end('unauthorized'); return }
  const project = url.searchParams.get('project') ?? 'default'

  // 取 PDF 原件(给前端 pdf.js 渲染);路径经工作区沙箱校验
  if (req.method === 'GET' && url.pathname === '/pdf') {
    const bytes = await runtime.readAssetBytes(project, url.searchParams.get('path') ?? '')
    if (!bytes) { res.writeHead(404); res.end('not found'); return }
    res.writeHead(200, { 'content-type': 'application/pdf' })
    res.end(Buffer.from(bytes))
    return
  }

  // 用户上传 PDF → 存进工作区 papers/ 原件
  if (req.method === 'POST' && url.pathname === '/upload') {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const saved = await runtime.saveUpload(project, url.searchParams.get('name') ?? 'upload.pdf', new Uint8Array(Buffer.concat(chunks)))
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ path: saved }))
    return
  }

  res.writeHead(404)
  res.end('not found')
}

function handleConnection(runtime: AgentRuntime, ws: WebSocket): void {
  const unsubs = new Map<string, () => void>()
  const send = (message: ServerMessage): void => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message))
  }

  const subscribe = (taskId: string, afterSeq?: number): void => {
    if (unsubs.has(taskId)) return
    for (const event of runtime.listEvents(taskId, afterSeq)) send({ type: 'event', event })
    unsubs.set(taskId, runtime.subscribe(taskId, (event) => send({ type: 'event', event })))
  }

  ws.on('message', (raw: unknown) => {
    let message: ClientMessage
    try {
      message = JSON.parse(String(raw)) as ClientMessage
    } catch {
      send({ type: 'error', message: 'invalid json' })
      return
    }
    switch (message.type) {
      case 'submit': {
        const taskId = runtime.submit({ projectId: message.projectId, userText: message.userText })
        send({ type: 'task_created', taskId })
        subscribe(taskId)
        break
      }
      case 'continue': {
        const ok = runtime.continueTask(message.taskId, message.userText)
        if (ok) subscribe(message.taskId)
        send({ type: ok ? 'ok' : 'error', ...(ok ? { taskId: message.taskId } : { message: 'continue failed: task 不存在或正在运行' }) } as ServerMessage)
        break
      }
      case 'subscribe':
        subscribe(message.taskId, message.afterSeq)
        break
      case 'cancel':
        runtime.cancel(message.taskId)
        send({ type: 'ok', taskId: message.taskId })
        break
      case 'resume':
        void runtime.resume(message.taskId).then((ok) => {
          if (ok) subscribe(message.taskId)
          send({ type: 'ok', taskId: message.taskId })
        })
        break
      case 'list':
        send({ type: 'tasks', tasks: runtime.listTasks(message.projectId) })
        break
      case 'list_assets':
        void runtime.listAssets(message.projectId).then((assets) => send({ type: 'assets', assets }))
        break
      case 'read_asset':
        void runtime
          .readAsset(message.projectId, message.path)
          .then((content) => send({ type: 'asset', path: message.path, content: content ?? '' }))
        break
      default:
        send({ type: 'error', message: 'unknown message type' })
    }
  })

  ws.on('close', () => {
    for (const unsub of unsubs.values()) unsub()
    unsubs.clear()
  })
}

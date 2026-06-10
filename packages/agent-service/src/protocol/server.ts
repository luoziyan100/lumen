/**
 * [INPUT]: ws、AgentRuntime、协议消息类型
 * [OUTPUT]: startServer —— 把 AgentRuntime 暴露为 localhost WebSocket 服务
 * [POS]: §4 服务边界。一条连接可 submit/subscribe/cancel/resume/list，service 推 event 流
 *
 * 断线重连用 subscribe.afterSeq 拉齐遗漏事件（事件 seq 单调，不丢不重）。
 */
import { WebSocketServer, type WebSocket } from 'ws'
import type { AgentRuntime } from '../runtime/agent-runtime.ts'
import type { ClientMessage, ServerMessage } from './messages.ts'

export interface ServerHandle {
  port: number
  close: () => Promise<void>
}

export function startServer(runtime: AgentRuntime, options: { port?: number; host?: string } = {}): Promise<ServerHandle> {
  return new Promise((resolve) => {
    const wss = new WebSocketServer({ port: options.port ?? 0, host: options.host ?? '127.0.0.1' }, () => {
      const address = wss.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({
        port,
        close: () => new Promise<void>((done) => wss.close(() => done())),
      })
    })
    wss.on('connection', (ws) => handleConnection(runtime, ws))
  })
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
      default:
        send({ type: 'error', message: 'unknown message type' })
    }
  })

  ws.on('close', () => {
    for (const unsub of unsubs.values()) unsub()
    unsubs.clear()
  })
}

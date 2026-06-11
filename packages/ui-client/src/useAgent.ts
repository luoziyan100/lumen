/**
 * useAgent —— 连 agent-service 的 React hook。把事件流投影成 LUI 消息。
 */
import { useEffect, useRef, useState } from 'react'
import { AgentClient, type TaskEvent } from './agent-client'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'error' | 'status'
  content: string
}

export function useAgent(url: string, projectId: string, token?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [running, setRunning] = useState(false)
  const clientRef = useRef<AgentClient | null>(null)
  const taskIdRef = useRef<string | null>(null) // 当前对话 ID:首句后记下,后续轮续接它

  useEffect(() => {
    let active = true
    const client = new AgentClient(url, token)
    clientRef.current = client
    client.onEvent((event: TaskEvent) => {
      const payload = safeParse(event.payload_json)
      if (event.kind === 'model_step' && payload.content) {
        push({ id: event.id, role: 'assistant', content: String(payload.content) })
      } else if (event.kind === 'reply') {
        setRunning(false)
      } else if (event.kind === 'error') {
        push({ id: event.id, role: 'error', content: String(payload.error ?? '出错了') })
        setRunning(false)
      } else if (event.kind === 'tool_call') {
        push({ id: event.id, role: 'status', content: `· 调用 ${String(payload.name)}` })
      }
    })
    client.onClose((code, reason) => {
      if (!active) return // StrictMode/卸载主动关闭不报错
      if (code === 4401) {
        push({ id: `close-${Date.now()}`, role: 'error', content: '连接被拒:未授权(token 缺失或不对)。刷新页面重试;若仍不行,确认 agent-service 在运行。' })
      } else if (code !== 1000) {
        push({ id: `close-${Date.now()}`, role: 'error', content: `连接断开（code ${code}）${reason ? '：' + reason : ''}` })
      }
      setRunning(false)
    })
    client.connect().catch(() => {
      // 被 StrictMode/卸载主动关闭的连接不报错（dev 双挂载假象）
      if (active) push({ id: `conn-err-${Date.now()}`, role: 'error', content: '无法连接 agent-service（确认服务已在 8787 运行）' })
    })
    return () => {
      active = false
      client.close()
    }
  }, [url, token])

  function push(message: ChatMessage): void {
    setMessages((prev) => [...prev, message])
  }
  function safeParse(s: string): Record<string, unknown> {
    try {
      return JSON.parse(s) as Record<string, unknown>
    } catch {
      return {}
    }
  }

  async function send(text: string): Promise<void> {
    push({ id: `u-${Date.now()}`, role: 'user', content: text })
    setRunning(true)
    const client = clientRef.current
    if (!client) return
    if (taskIdRef.current) {
      client.continueTask(taskIdRef.current, text) // 续接同一对话(带全部历史)
    } else {
      taskIdRef.current = await client.submit(projectId, text) // 首句:开新对话
    }
  }

  return { messages, running, send }
}

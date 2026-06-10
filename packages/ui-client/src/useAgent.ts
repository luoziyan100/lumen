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
    await clientRef.current?.submit(projectId, text)
  }

  return { messages, running, send }
}

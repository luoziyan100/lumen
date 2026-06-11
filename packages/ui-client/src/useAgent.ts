/**
 * useAgent —— 对话状态。client 由 App 建并 connect,这里只订阅事件 + 发消息。
 */
import { useEffect, useRef, useState } from 'react'
import type { AgentClient, TaskEvent } from './agent-client'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'error' | 'status'
  content: string
}

function safeParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>
  } catch {
    return {}
  }
}

export function useAgent(client: AgentClient, projectId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [running, setRunning] = useState(false)
  const taskIdRef = useRef<string | null>(null)

  useEffect(() => {
    const push = (m: ChatMessage): void => setMessages((prev) => [...prev, m])
    const offEvent = client.onEvent((event: TaskEvent) => {
      const p = safeParse(event.payload_json)
      if (event.kind === 'model_step' && p.content) push({ id: event.id, role: 'assistant', content: String(p.content) })
      else if (event.kind === 'reply') setRunning(false)
      else if (event.kind === 'error') { push({ id: event.id, role: 'error', content: String(p.error ?? '出错了') }); setRunning(false) }
      else if (event.kind === 'tool_call') push({ id: event.id, role: 'status', content: `· 调用 ${String(p.name)}` })
    })
    const offClose = client.onClose((code) => {
      if (code === 4401) push({ id: `c-${Date.now()}`, role: 'error', content: '连接被拒:未授权(刷新页面重试)。' })
      else if (code !== 1000) setRunning(false)
    })
    return () => { offEvent(); offClose() }
  }, [client])

  async function send(text: string): Promise<void> {
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', content: text }])
    setRunning(true)
    if (taskIdRef.current) client.continueTask(taskIdRef.current, text)
    else taskIdRef.current = await client.submit(projectId, text)
  }

  function newConversation(): void {
    taskIdRef.current = null
    setMessages([])
  }

  return { messages, running, send, newConversation }
}

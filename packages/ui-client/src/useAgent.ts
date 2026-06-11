/**
 * useAgent —— 对话状态。client 由 App 建并 connect,这里只订阅事件 + 发消息。
 * 事件流被归约成 ChatItem[]:assistant/user/error 是消息气泡;
 * 一轮里的 tool_call/tool_result(按 id 配对)聚合成一个可折叠「过程块」(§9)。
 */
import { useEffect, useRef, useState } from 'react'
import type { AgentClient, TaskEvent } from './agent-client'

export interface ChatMsg { kind: 'msg'; id: string; role: 'user' | 'assistant' | 'error'; content: string }
export interface ProcStep { id: string; name: string; done: boolean; label: string }
export interface ProcessItem { kind: 'process'; id: string; steps: ProcStep[]; running: boolean }
export type ChatItem = ChatMsg | ProcessItem

const VERB: Record<string, string> = {
  search_papers: '检索文献', openalex_search: '检索文献', web_search: '网页搜索',
  extract_pdf: '读取 PDF', fetch_url: '抓取网页', read_url: '抓取网页',
  write_file: '写入文件', read_file: '读取文件', list_files: '浏览工作区', grep: '检索内文',
}
const verb = (name: string): string => VERB[name] ?? name

function safeParse(s: string): Record<string, unknown> {
  try { return JSON.parse(s) as Record<string, unknown> } catch { return {} }
}

export function useAgent(client: AgentClient, projectId: string) {
  const [items, setItems] = useState<ChatItem[]>([])
  const [running, setRunning] = useState(false)
  const taskIdRef = useRef<string | null>(null)

  useEffect(() => {
    const offEvent = client.onEvent((event: TaskEvent) => {
      setItems((prev) => reduce(prev, event, safeParse(event.payload_json)))
      if (event.kind === 'reply' || event.kind === 'error') setRunning(false)
    })
    const offClose = client.onClose((code) => {
      if (code === 4401) setItems((prev) => [...prev, { kind: 'msg', id: `c-${Date.now()}`, role: 'error', content: '连接被拒:未授权(刷新页面重试)。' }])
      if (code !== 1000) setRunning(false)
    })
    return () => { offEvent(); offClose() }
  }, [client])

  async function send(text: string): Promise<void> {
    setItems((prev) => [...prev, { kind: 'msg', id: `u-${Date.now()}`, role: 'user', content: text }])
    setRunning(true)
    if (taskIdRef.current) client.continueTask(taskIdRef.current, text)
    else taskIdRef.current = await client.submit(projectId, text)
  }

  function newConversation(): void {
    taskIdRef.current = null
    setItems([])
  }

  return { items, running, send, newConversation }
}

/** 纯函数归约:同一个 event 进来,prev → next。便于推理与测试。 */
function reduce(prev: ChatItem[], event: TaskEvent, p: Record<string, unknown>): ChatItem[] {
  switch (event.kind) {
    case 'model_step': {
      const content = typeof p.content === 'string' ? p.content.trim() : ''
      return content ? [...prev, { kind: 'msg', id: event.id, role: 'assistant', content }] : prev
    }
    case 'tool_call': {
      const name = String(p.name ?? 'tool')
      const id = String(p.id ?? event.id)
      const step: ProcStep = { id, name, done: false, label: `${verb(name)}…` }
      const last = prev[prev.length - 1]
      if (last && last.kind === 'process' && last.running) {
        return [...prev.slice(0, -1), { ...last, steps: [...last.steps, step] }]
      }
      return [...prev, { kind: 'process', id: `proc-${id}`, steps: [step], running: true }]
    }
    case 'tool_result': {
      const id = String(p.id ?? '')
      const label = summarize(String(p.name ?? ''), typeof p.llmContent === 'string' ? p.llmContent : '')
      return prev.map((it) => it.kind === 'process'
        ? { ...it, steps: it.steps.map((s) => (s.id === id ? { ...s, done: true, label } : s)) }
        : it)
    }
    case 'reply': {
      const last = prev[prev.length - 1]
      return last && last.kind === 'process' && last.running
        ? [...prev.slice(0, -1), { ...last, running: false }]
        : prev
    }
    case 'error':
      return [...prev, { kind: 'msg', id: event.id, role: 'error', content: String(p.error ?? '出错了') }]
    default:
      return prev
  }
}

/** 完成态摘要:能可靠数出条目就显示「命中 N」,否则降级为「完成」。 */
function summarize(name: string, llmContent: string): string {
  const v = verb(name)
  if (name === 'extract_pdf') {
    const n = llmContent.length
    return `读取 PDF · ${n >= 1000 ? `${Math.round(n / 1000)}k 字` : `${n} 字`}`
  }
  const hits = countHits(llmContent)
  if (/search|papers/.test(name)) return hits ? `${v} · 命中 ${hits}` : `${v} · 完成`
  return `${v} · 完成`
}

function countHits(s: string): number {
  const t = s.trim()
  try {
    const j = JSON.parse(t) as unknown
    if (Array.isArray(j)) return j.length
    if (j && typeof j === 'object' && Array.isArray((j as { results?: unknown[] }).results)) {
      return (j as { results: unknown[] }).results.length
    }
  } catch { /* 非 JSON,放弃计数 */ }
  return 0
}

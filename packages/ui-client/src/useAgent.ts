/**
 * useAgent —— 对话状态。client 由 App 建并 connect,这里订阅事件 + 发消息。
 * 事件流归约成 ChatItem[]:user/assistant/error 是消息气泡;一轮的 tool_call/tool_result
 * (按 id 配对)聚合成可折叠过程块(§9)。
 *
 * user 也走事件流(submit 后服务端回放 / continue 时 notify),不在前端乐观插入——
 * 这样刷新后能从历史事件完整重建对话。taskId 存 localStorage,重连即 attach 回放。
 */
import { useEffect, useRef, useState } from 'react'
import type { AgentClient, ImageData, TaskEvent } from './agent-client'

export interface ChatMsg { kind: 'msg'; id: string; role: 'user' | 'assistant' | 'error'; content: string; images?: ImageData[] }
export interface ProcStep { id: string; name: string; done: boolean; label: string }
export interface ProcessItem { kind: 'process'; id: string; steps: ProcStep[]; running: boolean }
export type ChatItem = ChatMsg | ProcessItem

const VERB: Record<string, string> = {
  search_papers: '检索文献', openalex_search: '检索文献', web_search: '网页搜索',
  extract_pdf: '读取 PDF', fetch_url: '抓取网页', read_url: '抓取网页',
  write_file: '写入文件', read_file: '读取文件', list_files: '浏览工作区', grep: '检索内文',
  run_code: '运行代码',
}
const verb = (name: string): string => VERB[name] ?? name

function safeParse(s: string): Record<string, unknown> {
  try { return JSON.parse(s) as Record<string, unknown> } catch { return {} }
}

export function useAgent(client: AgentClient, projectId: string, connected: boolean) {
  const [items, setItems] = useState<ChatItem[]>([])
  const [running, setRunning] = useState(false)
  const [taskId, setTaskId] = useState<string | null>(null) // 给 UI 高亮当前会话
  const taskIdRef = useRef<string | null>(null)
  const taskKey = `lumen:taskId:${projectId}`

  function switchTo(id: string | null): void {
    taskIdRef.current = id
    setTaskId(id)
    if (id) localStorage.setItem(taskKey, id)
    else localStorage.removeItem(taskKey)
  }

  useEffect(() => {
    const offEvent = client.onEvent((event: TaskEvent) => {
      // 只归约当前会话的事件——旧任务后台还在流式时不许串台
      if (event.task_id !== taskIdRef.current) return
      setItems((prev) => reduce(prev, event, safeParse(event.payload_json)))
      if (event.kind === 'reply' || event.kind === 'error') setRunning(false)
    })
    const offClose = client.onClose((code) => {
      if (code === 4401) setItems((prev) => [...prev, { kind: 'msg', id: `c-${Date.now()}`, role: 'error', content: '连接被拒:未授权(刷新页面重试)。' }])
      if (code !== 1000) setRunning(false)
    })
    return () => { offEvent(); offClose() }
  }, [client])

  // 进入即欢迎页(owner 拍板 2026-07-05):启动/刷新不再无条件恢复上次会话。
  // localStorage 仍记录最近 taskId,但只由 App 在「该任务仍在运行」时调 selectConversation 接回。

  async function send(text: string, images?: ImageData[]): Promise<void> {
    setRunning(true)
    if (taskIdRef.current) {
      client.continueTask(taskIdRef.current, text, images)
    } else {
      const id = await client.submit(projectId, text, images)
      switchTo(id)
    }
  }

  function newConversation(): void {
    switchTo(null)
    setItems([])
    setRunning(false)
  }

  /** 切到历史会话:清屏 → attach(服务端回放事件重建对话)。isRunning 来自任务列表的 status */
  function selectConversation(id: string, isRunning = false): void {
    if (id === taskIdRef.current) return
    switchTo(id)
    setItems([])
    setRunning(isRunning)
    client.subscribe(id)
  }

  /** 停止当前在跑的任务(发送按钮的暂停态) */
  function stop(): void {
    if (taskIdRef.current) client.cancel(taskIdRef.current)
    setRunning(false)
  }

  return { items, running, send, stop, newConversation, selectConversation, taskId }
}

/** 纯函数归约:同一个 event 进来,prev → next。 */
function reduce(prev: ChatItem[], event: TaskEvent, p: Record<string, unknown>): ChatItem[] {
  switch (event.kind) {
    case 'user': {
      const images = Array.isArray(p.images) ? (p.images as ImageData[]) : undefined
      return [...prev, { kind: 'msg', id: event.id, role: 'user', content: String(p.content ?? ''), ...(images?.length ? { images } : {}) }]
    }
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
    case 'status_change': {
      // 取消/失败等终态:把还在呼吸的过程块收尾,别留一个永远脉动的点
      const to = String(p.to ?? '')
      if (!['canceled', 'failed', 'done', 'interrupted'].includes(to)) return prev
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

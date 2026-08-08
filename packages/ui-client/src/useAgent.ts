/**
 * [INPUT]: AgentClient 的事件流 / submit·continue·subscribe·answerUser
 * [OUTPUT]: useAgent → items/running/pendingAsk/send/stop/answerAsk/selectConversation;ChatItem 归约;
 *           sealRunningProcesses(正文/终态封口过程块);user 事件 uploads[]→气泡 chip
 * [POS]: UI 对话状态核;跨项目切换时同步 projectIdRef;空 model_step→error;todo_write→TodoChatItem;
 *        text_delta 累积 streaming 泡并封口 running process;model_step 有正文时同封;
 *        tool_call_start 尽早开 process;ask_user→pendingAsk 驱动悬浮 Dialog(见 doc/ask-user.md);
 *        上传知情 chip 见 doc/upload-awareness.md
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 *
 * user 也走事件流,不在前端乐观插入。taskId 按项目键存 localStorage。
 */
import { useEffect, useRef, useState } from 'react'
import type { AgentClient, AnswerUserPayload, ImageData, TaskEvent, UploadRef } from './agent-client'

export interface ChatMsg {
  kind: 'msg'
  id: string
  role: 'user' | 'assistant' | 'error'
  content: string
  images?: ImageData[]
  /** 本回合落盘附件(chip);机读附言只在 service 拼进模型 */
  uploads?: UploadRef[]
  /** 真流式中:text_delta 累积;model_step 定稿后清除 */
  streaming?: boolean
}
export interface ProcStep { id: string; name: string; done: boolean; label: string }
export interface ProcessItem { kind: 'process'; id: string; steps: ProcStep[]; running: boolean }
export interface CompactionMark { kind: 'compaction'; id: string }
export type TodoStatus = 'pending' | 'in_progress' | 'completed'
export interface TodoEntry {
  id: string
  content: string
  status: TodoStatus
  activeForm: string
}
export interface TodoChatItem {
  kind: 'todo'
  id: string
  title?: string
  todos: TodoEntry[]
}
export type ChatItem = ChatMsg | ProcessItem | CompactionMark | TodoChatItem

export interface AskUserOption { label: string; description?: string }
export interface AskUserQuestion {
  id: string
  header?: string
  question: string
  options: AskUserOption[]
}
export interface PendingAsk {
  toolCallId: string
  questions: AskUserQuestion[]
}

const VERB: Record<string, string> = {
  search_papers: '检索文献', openalex_search: '检索文献', web_search: '网页搜索',
  extract_pdf: '读取 PDF', fetch_url: '抓取网页', read_url: '抓取网页',
  write_file: '写入文件', read_file: '读取文件', list_files: '浏览工作区', grep: '检索内文',
  run_code: '运行代码', todo_write: '更新进度', update_plan: '更新进度', ask_user: '询问用户',
}
const verb = (name: string): string => VERB[name] ?? name
const TODO_STATUSES = new Set<TodoStatus>(['pending', 'in_progress', 'completed'])
const isTodoTool = (name: string): boolean => name === 'todo_write' || name === 'update_plan'

function safeParse(s: string): Record<string, unknown> {
  try { return JSON.parse(s) as Record<string, unknown> } catch { return {} }
}

function mapTodoStatus(raw: string): TodoStatus | null {
  if (raw === 'done') return 'completed'
  if (TODO_STATUSES.has(raw as TodoStatus)) return raw as TodoStatus
  return null
}

function coerceTodoList(raw: unknown): { title?: string; todos: TodoEntry[] } | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as { title?: unknown; todos?: unknown; steps?: unknown; todo?: unknown }
  // tool_result data 包一层 { todo: {...} }
  if (o.todo && typeof o.todo === 'object') return coerceTodoList(o.todo)

  const title = String(o.title ?? '').trim() || undefined
  let rows: unknown[] | null = null
  if (Array.isArray(o.todos)) rows = o.todos
  else if (Array.isArray(o.steps)) rows = o.steps
  if (!rows) return null
  if (rows.length === 0) return { title, todos: [] }

  const todos: TodoEntry[] = []
  for (let i = 0; i < rows.length; i++) {
    const s = rows[i]
    if (!s || typeof s !== 'object') continue
    const row = s as {
      id?: unknown
      content?: unknown
      label?: unknown
      status?: unknown
      activeForm?: unknown
    }
    const content = String(row.content ?? row.label ?? '').trim()
    if (!content) continue
    const status = mapTodoStatus(String(row.status ?? 'pending'))
    if (!status) continue
    const activeForm = String(row.activeForm ?? '').trim() || `正在${content}`
    todos.push({ id: String(row.id ?? `t${i + 1}`), content, status, activeForm })
  }
  if (!todos.length && rows.length > 0) return null
  return { title, todos }
}

function todoFromToolArgs(args: unknown): { title?: string; todos: TodoEntry[] } | null {
  if (typeof args === 'string') return coerceTodoList(safeParse(args))
  return coerceTodoList(args)
}

/** tool_result.llmContent 末尾的 JSON Todo */
function todoFromLlmContent(text: string): { title?: string; todos: TodoEntry[] } | null {
  const i = text.lastIndexOf('{')
  if (i < 0) return null
  try {
    return coerceTodoList(JSON.parse(text.slice(i)))
  } catch {
    return null
  }
}

function upsertTodo(
  prev: ChatItem[],
  eventId: string,
  list: { title?: string; todos: TodoEntry[] },
): ChatItem[] {
  // 空表 = Removed 全部 → 从对话流拿掉
  if (list.todos.length === 0) {
    return prev.filter((it) => it.kind !== 'todo')
  }
  const existing = prev.find((it): it is TodoChatItem => it.kind === 'todo')
  const item: TodoChatItem = {
    kind: 'todo',
    id: existing?.id ?? `todo-${eventId}`,
    title: list.title,
    todos: list.todos,
  }
  if (existing) {
    return prev.map((it) => (it.kind === 'todo' ? item : it))
  }
  return [...prev, item]
}

/** 从 tool_call.args 解析 ask_user 题目(UI 侧宽松校验) */
export function parseAskUserQuestions(args: unknown): AskUserQuestion[] | null {
  const raw = typeof args === 'string' ? safeParse(args) : (args && typeof args === 'object' ? args as Record<string, unknown> : null)
  if (!raw || !Array.isArray(raw.questions) || raw.questions.length === 0) return null
  const out: AskUserQuestion[] = []
  for (let i = 0; i < raw.questions.length && i < 3; i++) {
    const q = raw.questions[i]
    if (!q || typeof q !== 'object') continue
    const row = q as { id?: unknown; header?: unknown; question?: unknown; options?: unknown }
    const question = String(row.question ?? '').trim()
    if (!question || !Array.isArray(row.options) || row.options.length < 2) continue
    const options: AskUserOption[] = []
    for (const opt of row.options) {
      if (!opt || typeof opt !== 'object') continue
      const orow = opt as { label?: unknown; description?: unknown }
      const label = String(orow.label ?? '').trim()
      if (!label) continue
      const description = orow.description != null ? String(orow.description).trim() : ''
      options.push(description ? { label, description } : { label })
    }
    if (options.length < 2) continue
    const header = row.header != null ? String(row.header).trim() : ''
    out.push({
      id: String(row.id ?? `q${i + 1}`).trim() || `q${i + 1}`,
      question,
      options,
      ...(header ? { header } : {}),
    })
  }
  return out.length ? out : null
}

export function useAgent(client: AgentClient, projectId: string, connected: boolean) {
  const [items, setItems] = useState<ChatItem[]>([])
  const [running, setRunning] = useState(false)
  const [pendingAsk, setPendingAsk] = useState<PendingAsk | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null) // 给 UI 高亮当前会话
  const [ctxUsage, setCtxUsage] = useState<number | null>(null) // 上下文水位 0-1(context_usage 事件)
  const taskIdRef = useRef<string | null>(null)
  const projectIdRef = useRef(projectId)
  projectIdRef.current = projectId
  const seenEventIds = useRef<Set<string>>(new Set()) // 已归约过的事件 id:回放与实时交错时保证幂等
  const openAskIds = useRef<Set<string>>(new Set()) // 回放时跟踪未配对的 ask_user toolCallId

  function switchTo(id: string | null, forProjectId = projectIdRef.current): void {
    taskIdRef.current = id
    seenEventIds.current = new Set()
    openAskIds.current = new Set()
    setCtxUsage(null)
    setPendingAsk(null)
    setTaskId(id)
    const key = `lumen:taskId:${forProjectId}`
    if (id) localStorage.setItem(key, id)
    else localStorage.removeItem(key)
  }

  useEffect(() => {
    const offEvent = client.onEvent((event: TaskEvent) => {
      // 只归约当前会话的事件——旧任务后台还在流式时不许串台
      if (event.task_id !== taskIdRef.current) return
      if (seenEventIds.current.has(event.id)) return // 重复送达(如运行中再次 attach 的回放)只算一次
      seenEventIds.current.add(event.id)
      const payload = safeParse(event.payload_json)
      setItems((prev) => reduceChatItems(prev, event, payload))
      if (event.kind === 'context_usage') {
        const r = payload.ratio
        if (typeof r === 'number') setCtxUsage(r)
      }
      if (event.kind === 'tool_call' && String(payload.name ?? '') === 'ask_user') {
        const toolCallId = String(payload.id ?? '')
        const questions = parseAskUserQuestions(payload.args)
        if (toolCallId && questions) {
          openAskIds.current.add(toolCallId)
          setPendingAsk({ toolCallId, questions })
        }
      }
      if (event.kind === 'tool_result' && String(payload.name ?? '') === 'ask_user') {
        const toolCallId = String(payload.id ?? '')
        if (toolCallId) openAskIds.current.delete(toolCallId)
        setPendingAsk((cur) => (cur && cur.toolCallId === toolCallId ? null : cur))
        if (!openAskIds.current.size) setPendingAsk(null)
      }
      if (event.kind === 'reply' || event.kind === 'error') {
        setRunning(false)
        openAskIds.current = new Set()
        setPendingAsk(null)
      }
      if (event.kind === 'status_change') {
        const to = String(payload.to ?? '')
        if (['canceled', 'failed', 'done', 'interrupted'].includes(to)) {
          openAskIds.current = new Set()
          setPendingAsk(null)
        }
      }
    })
    const offClose = client.onClose((code) => {
      if (code === 4401) setItems((prev) => [...prev, { kind: 'msg', id: `c-${Date.now()}`, role: 'error', content: '连接被拒:未授权(刷新页面重试)。' }])
      // 断线必须收回思考态——否则会出现永远「思考中」且无用户气泡
      setRunning(false)
      void code
    })
    return () => { offEvent(); offClose() }
  }, [client])

  // 重连后重新 attach 当前会话,补事件流订阅(seenEventIds 幂等)
  useEffect(() => {
    if (!connected || !taskIdRef.current) return
    client.subscribe(taskIdRef.current, projectIdRef.current)
  }, [connected, client, projectId])

  // 进入即欢迎页(owner 拍板 2026-07-05):启动/刷新不再无条件恢复上次会话。
  // localStorage 仍记录最近 taskId,但只由 App 在「该任务仍在运行」时调 selectConversation 接回。

  async function send(text: string, images?: ImageData[], uploads?: UploadRef[]): Promise<void> {
    setRunning(true)
    const pid = projectIdRef.current
    try {
      if (taskIdRef.current) {
        await client.continueTask(taskIdRef.current, text, images, pid, uploads)
      } else {
        const id = await client.submit(pid, text, images, uploads)
        switchTo(id, pid)
      }
    } catch (err) {
      setRunning(false)
      const msg = err instanceof Error ? err.message : String(err)
      const preview = text.trim().slice(0, 80)
      setItems((prev) => [...prev, {
        kind: 'msg',
        id: `send-err-${Date.now()}`,
        role: 'error',
        content: `消息未送达:${msg}${preview ? `（原文: ${preview}${text.trim().length > 80 ? '…' : ''}）` : ''}`,
      }])
    }
  }

  function newConversation(forProjectId?: string): void {
    if (forProjectId) projectIdRef.current = forProjectId
    switchTo(null, projectIdRef.current)
    setItems([])
    setRunning(false)
  }

  /** 切到历史会话:清屏 → attach。forProjectId 在跨项目点击时同步写入,避免闭包仍是旧 projectId */
  function selectConversation(id: string, isRunning = false, forProjectId?: string): void {
    const pid = forProjectId ?? projectIdRef.current
    if (forProjectId) projectIdRef.current = forProjectId
    if (id === taskIdRef.current) return
    switchTo(id, pid)
    setItems([])
    setRunning(isRunning)
    client.subscribe(id, pid)
  }

  /** 停止当前在跑的任务(发送按钮的暂停态) */
  function stop(): void {
    try {
      if (taskIdRef.current) client.cancel(taskIdRef.current, projectIdRef.current)
    } catch { /* 已断线则本地收尾即可 */ }
    setRunning(false)
    setPendingAsk(null)
    openAskIds.current = new Set()
  }

  /** 提交 / 跳过 ask_user 作答 */
  async function answerAsk(payload: AnswerUserPayload): Promise<void> {
    const tid = taskIdRef.current
    const ask = pendingAsk
    if (!tid || !ask) return
    await client.answerUser(tid, ask.toolCallId, payload, projectIdRef.current)
  }

  return {
    items, running, pendingAsk, send, stop, answerAsk,
    newConversation, selectConversation, taskId, ctxUsage,
  }
}

/** 助手开口或轮次终态:把所有还在跑的过程块封口(避免旧块永远 running→虚线圈 breathing) */
export function sealRunningProcesses(items: ChatItem[]): ChatItem[] {
  if (!items.some((it) => it.kind === 'process' && it.running)) return items
  return items.map((it) => (it.kind === 'process' && it.running ? { ...it, running: false } : it))
}

/** 纯函数归约:同一个 event 进来,prev → next。导出供单测。 */
export function reduceChatItems(prev: ChatItem[], event: TaskEvent, p: Record<string, unknown>): ChatItem[] {
  switch (event.kind) {
    case 'user': {
      const images = Array.isArray(p.images) ? (p.images as ImageData[]) : undefined
      const uploads = parseUploadRefs(p.uploads)
      return [...prev, {
        kind: 'msg',
        id: event.id,
        role: 'user',
        content: String(p.content ?? ''),
        ...(images?.length ? { images } : {}),
        ...(uploads.length ? { uploads } : {}),
      }]
    }
    case 'text_delta': {
      const text = String(p.text ?? '')
      if (!text) return prev
      // 正文开始 = 上一截工具叙事结束;封口后才挂 streaming 泡
      const sealed = sealRunningProcesses(prev)
      const last = sealed[sealed.length - 1]
      if (last?.kind === 'msg' && last.role === 'assistant' && last.streaming) {
        return [...sealed.slice(0, -1), { ...last, content: last.content + text }]
      }
      return [...sealed, { kind: 'msg', id: event.id, role: 'assistant', content: text, streaming: true }]
    }
    case 'tool_call_start': {
      const name = String(p.name ?? 'tool')
      if (isTodoTool(name)) return prev // Todo 等完整 tool_call
      const id = String(p.id ?? event.id)
      const step: ProcStep = { id, name, done: false, label: `${verb(name)}…` }
      const last = prev[prev.length - 1]
      if (last?.kind === 'process' && last.running) {
        if (last.steps.some((s) => s.id === id)) return prev
        return [...prev.slice(0, -1), { ...last, steps: [...last.steps, step] }]
      }
      return [...prev, { kind: 'process', id: `proc-${id}`, steps: [step], running: true }]
    }
    case 'model_step': {
      const content = typeof p.content === 'string' ? p.content.trim() : ''
      const tools = Array.isArray(p.toolCalls) ? p.toolCalls : []
      // 有正文才封口过程块;纯工具轮保持 running 以便续挂 steps
      const base = content ? sealRunningProcesses(prev) : prev
      let streamingIdx = -1
      for (let i = base.length - 1; i >= 0; i -= 1) {
        const it = base[i]
        if (it?.kind === 'msg' && it.role === 'assistant' && it.streaming) {
          streamingIdx = i
          break
        }
      }
      if (streamingIdx >= 0) {
        const next = base.slice()
        if (content) {
          next[streamingIdx] = { kind: 'msg', id: event.id, role: 'assistant', content }
        } else if (tools.length === 0) {
          next[streamingIdx] = {
            kind: 'msg',
            id: event.id,
            role: 'error',
            content: '模型返回了空回复（常见于思考模式耗尽输出额度）。请重试，或在设置中换模型。',
          }
        } else {
          next.splice(streamingIdx, 1) // 纯工具轮:丢掉半成品泡
        }
        return next
      }
      if (content) return [...base, { kind: 'msg', id: event.id, role: 'assistant', content }]
      // 空正文且无工具:历史上会被静默丢掉 → 用户只看见自己的气泡(DeepSeek V4 思考烧光额度)
      if (tools.length === 0) {
        return [...base, {
          kind: 'msg',
          id: event.id,
          role: 'error',
          content: '模型返回了空回复（常见于思考模式耗尽输出额度）。请重试，或在设置中换模型。',
        }]
      }
      return base
    }
    case 'tool_call': {
      const name = String(p.name ?? 'tool')
      if (isTodoTool(name)) {
        const list = todoFromToolArgs(p.args)
        return list ? upsertTodo(prev, event.id, list) : prev
      }
      const id = String(p.id ?? event.id)
      const step: ProcStep = { id, name, done: false, label: `${verb(name)}…` }
      const last = prev[prev.length - 1]
      if (last && last.kind === 'process' && last.running) {
        if (last.steps.some((s) => s.id === id)) return prev // tool_call_start 已占位
        return [...prev.slice(0, -1), { ...last, steps: [...last.steps, step] }]
      }
      return [...prev, { kind: 'process', id: `proc-${id}`, steps: [step], running: true }]
    }
    case 'tool_result': {
      const name = String(p.name ?? '')
      if (isTodoTool(name)) {
        const list = todoFromLlmContent(typeof p.llmContent === 'string' ? p.llmContent : '')
        return list ? upsertTodo(prev, event.id, list) : prev
      }
      const id = String(p.id ?? '')
      const label = summarize(name, typeof p.llmContent === 'string' ? p.llmContent : '')
      return prev.map((it) => it.kind === 'process'
        ? { ...it, steps: it.steps.map((s) => (s.id === id ? { ...s, done: true, label } : s)) }
        : it)
    }
    case 'reply':
      return sealRunningProcesses(prev)
    case 'status_change': {
      // 取消/失败等终态:把还在跑的过程块全部收尾
      const to = String(p.to ?? '')
      if (!['canceled', 'failed', 'done', 'interrupted'].includes(to)) return prev
      return sealRunningProcesses(prev)
    }
    case 'compaction':
      // 确定性压缩标记(方案 B):旧细节归档,给一条弱分隔线
      return [...prev, { kind: 'compaction', id: event.id }]
    case 'error':
      return [...prev, { kind: 'msg', id: event.id, role: 'error', content: String(p.error ?? '出错了') }]
    default:
      return prev
  }
}

/** 完成态摘要:能可靠数出条目就显示「命中 N」,否则降级为「完成」。 */
function summarize(name: string, llmContent: string): string {
  const v = verb(name)
  if (name === 'ask_user') {
    if (llmContent.includes('跳过')) return `${v} · 已跳过`
    return `${v} · 已回答`
  }
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

/** 从 user 事件 payload 解析 uploads(与 service parseUploads 同构) */
function parseUploadRefs(raw: unknown): UploadRef[] {
  if (!Array.isArray(raw)) return []
  const out: UploadRef[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const path = typeof o.path === 'string' ? o.path : ''
    if (!path) continue
    const name = typeof o.name === 'string' && o.name ? o.name : (path.split('/').pop() ?? path)
    const extractPath = typeof o.extractPath === 'string' ? o.extractPath : undefined
    out.push({ name, path, ...(extractPath ? { extractPath } : {}) })
  }
  return out
}

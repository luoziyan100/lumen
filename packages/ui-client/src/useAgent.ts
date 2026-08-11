/**
 * [INPUT]: AgentClient 的事件流 / submit·continue·subscribe·answerUser
 * [OUTPUT]: useAgent → items(用户面)/evidenceItems(归因面)/running/modelRetry/…;
 *           reduceUserFacingItems(Claude 档:Thought+最终答案)/reduceChatItems=证据面全量;
 *           sealRunningProcesses;isLiveTaskEvent / viewEpoch
 * [POS]: UI 对话状态核;用户面默认不渲染工具过程;证据面给右轨/排障;
 *        todo_write 仍进用户面;ask_user→pendingAsk;model_retry→Retry n/m;上传知情 chip
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 *
 * user 也走事件流,不在前端乐观插入。taskId 按项目键存 localStorage。
 * 切会话(switchTo)必须 bump viewEpoch:事件入口校验不够,setItems updater 内须二次 isLiveTaskEvent。
 */
import { useEffect, useRef, useState } from 'react'
import type { AgentClient, AnswerUserPayload, ImageData, TaskEvent, UploadRef } from './agent-client'
import { pathFromToolArgs } from './activePath.ts'

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
export interface ProcStep {
  id: string
  name: string
  done: boolean
  label: string
  /** write/edit 路径:来自 tool_call.args 或 tool_result.path */
  path?: string
}
export interface ProcessItem { kind: 'process'; id: string; steps: ProcStep[]; running: boolean }
/** Claude 档：折叠的思考过程（reasoningContent） */
export interface ThoughtItem {
  kind: 'thought'
  id: string
  content: string
  done: boolean
}
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
export type ChatItem = ChatMsg | ProcessItem | ThoughtItem | CompactionMark | TodoChatItem

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

/** 模型连接重试（ephemeral model_retry；对齐 Codex Retry n/m） */
export interface ModelRetryState {
  attempt: number
  maxAttempts: number
  reason?: string
}

const VERB: Record<string, string> = {
  search_papers: '检索文献', openalex_search: '检索文献', web_search: '网页搜索', search_web: '网页搜索',
  extract_pdf: '读取 PDF', fetch_url: '抓取网页', read_url: '抓取网页',
  write_file: '写入文件', read_file: '读取文件', list_files: '浏览工作区', list_dir: '列目录', grep: '检索内文',
  run_code: '运行代码', todo_write: '更新进度', update_plan: '更新进度', ask_user: '询问用户',
  spawn_subagent: '子代理', wait_subagents: '等待子代理', get_subagent_output: '读子代理结果',
  kill_subagent: '中止子代理',
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
  for (let i = 0; i < raw.questions.length && i < 4; i++) {
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

/** 事件是否仍归属当前视图。切会话后在途 setState 必须丢弃,否则空草稿会串出旧「研究过程」。 */
export function isLiveTaskEvent(
  eventTaskId: string,
  activeTaskId: string | null,
  eventEpoch: number,
  activeEpoch: number,
): boolean {
  return eventEpoch === activeEpoch && activeTaskId != null && eventTaskId === activeTaskId
}

export function useAgent(client: AgentClient, projectId: string, connected: boolean) {
  /** 用户面：Thought + 最终答案（无工具过程行） */
  const [items, setItems] = useState<ChatItem[]>([])
  /** 归因面：完整 process / subagent 步骤（右轨 Progress 等） */
  const [evidenceItems, setEvidenceItems] = useState<ChatItem[]>([])
  const [running, setRunning] = useState(false)
  const [pendingAsk, setPendingAsk] = useState<PendingAsk | null>(null)
  /** 模型连接重试中：ThinkingIndicator 显示 Retry n/m */
  const [modelRetry, setModelRetry] = useState<ModelRetryState | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null) // 给 UI 高亮当前会话
  const [ctxUsage, setCtxUsage] = useState<number | null>(null) // 上下文水位 0-1(context_usage 事件)
  const taskIdRef = useRef<string | null>(null)
  const projectIdRef = useRef(projectId)
  projectIdRef.current = projectId
  /** 每次 switchTo 递增;事件入口捕获 epoch,setItems 时再比一次,挡住清屏后迟到的 reduce */
  const viewEpochRef = useRef(0)
  const seenEventIds = useRef<Set<string>>(new Set()) // 已归约过的事件 id:回放与实时交错时保证幂等
  const openAskIds = useRef<Set<string>>(new Set()) // 回放时跟踪未配对的 ask_user toolCallId

  function switchTo(id: string | null, forProjectId = projectIdRef.current): void {
    viewEpochRef.current += 1
    taskIdRef.current = id
    seenEventIds.current = new Set()
    openAskIds.current = new Set()
    setCtxUsage(null)
    setPendingAsk(null)
    setModelRetry(null)
    setTaskId(id)
    const key = `lumen:taskId:${forProjectId}`
    if (id) localStorage.setItem(key, id)
    else localStorage.removeItem(key)
  }

  useEffect(() => {
    const offEvent = client.onEvent((event: TaskEvent) => {
      // 入口快滤:旧任务 live 推送不排队
      if (event.task_id !== taskIdRef.current) return
      if (seenEventIds.current.has(event.id)) return // 重复送达(如运行中再次 attach 的回放)只算一次
      // 捕获本事件所属视图代数——switchTo 之后即便已进 handler 的 setState 也不得写 items
      const epoch = viewEpochRef.current
      seenEventIds.current.add(event.id)
      const payload = safeParse(event.payload_json)
      setItems((prev) => {
        if (!isLiveTaskEvent(event.task_id, taskIdRef.current, epoch, viewEpochRef.current)) return prev
        return reduceUserFacingItems(prev, event, payload)
      })
      setEvidenceItems((prev) => {
        if (!isLiveTaskEvent(event.task_id, taskIdRef.current, epoch, viewEpochRef.current)) return prev
        return reduceChatItems(prev, event, payload)
      })
      if (event.kind === 'context_usage') {
        const r = payload.ratio
        if (typeof r === 'number' && isLiveTaskEvent(event.task_id, taskIdRef.current, epoch, viewEpochRef.current)) {
          setCtxUsage(r)
        }
      }
      // 模型连接重试：ephemeral，连上/出字/终态即清
      if (event.kind === 'model_retry') {
        if (!isLiveTaskEvent(event.task_id, taskIdRef.current, epoch, viewEpochRef.current)) return
        const attempt = Number(payload.attempt)
        const maxAttempts = Number(payload.maxAttempts)
        if (Number.isFinite(attempt) && Number.isFinite(maxAttempts) && maxAttempts > 0) {
          const reason = typeof payload.reason === 'string' && payload.reason.trim()
            ? payload.reason.trim()
            : undefined
          setModelRetry({ attempt, maxAttempts, reason })
        }
      }
      if (
        event.kind === 'text_delta'
        || event.kind === 'tool_call_start'
        || event.kind === 'model_step'
        || event.kind === 'tool_call'
      ) {
        if (isLiveTaskEvent(event.task_id, taskIdRef.current, epoch, viewEpochRef.current)) {
          setModelRetry(null)
        }
      }
      if (event.kind === 'tool_call' && String(payload.name ?? '') === 'ask_user') {
        if (!isLiveTaskEvent(event.task_id, taskIdRef.current, epoch, viewEpochRef.current)) return
        const toolCallId = String(payload.id ?? '')
        const questions = parseAskUserQuestions(payload.args)
        if (toolCallId && questions) {
          openAskIds.current.add(toolCallId)
          setPendingAsk({ toolCallId, questions })
        }
      }
      if (event.kind === 'tool_result' && String(payload.name ?? '') === 'ask_user') {
        if (!isLiveTaskEvent(event.task_id, taskIdRef.current, epoch, viewEpochRef.current)) return
        const toolCallId = String(payload.id ?? '')
        if (toolCallId) openAskIds.current.delete(toolCallId)
        setPendingAsk((cur) => (cur && cur.toolCallId === toolCallId ? null : cur))
        if (!openAskIds.current.size) setPendingAsk(null)
      }
      if (event.kind === 'reply' || event.kind === 'error') {
        if (!isLiveTaskEvent(event.task_id, taskIdRef.current, epoch, viewEpochRef.current)) return
        setRunning(false)
        setModelRetry(null)
        openAskIds.current = new Set()
        setPendingAsk(null)
      }
      if (event.kind === 'status_change') {
        if (!isLiveTaskEvent(event.task_id, taskIdRef.current, epoch, viewEpochRef.current)) return
        const to = String(payload.to ?? '')
        if (['canceled', 'failed', 'done', 'interrupted'].includes(to)) {
          openAskIds.current = new Set()
          setPendingAsk(null)
          setModelRetry(null)
        }
      }
    })
    const offClose = client.onClose((code) => {
      if (code === 4401) setItems((prev) => [...prev, { kind: 'msg', id: `c-${Date.now()}`, role: 'error', content: '连接被拒:未授权(刷新页面重试)。' }])
      // 断线必须收回思考态——否则会出现永远「思考中」且无用户气泡
      setRunning(false)
      setModelRetry(null)
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

  async function send(
    text: string,
    images?: ImageData[],
    uploads?: UploadRef[],
    activePath?: string | null,
  ): Promise<void> {
    setRunning(true)
    setModelRetry(null)
    const pid = projectIdRef.current
    const epoch = viewEpochRef.current
    try {
      if (taskIdRef.current) {
        await client.continueTask(taskIdRef.current, text, images, pid, uploads, activePath)
      } else {
        const id = await client.submit(pid, text, images, uploads, activePath)
        // 发送途中用户已切走:不要把新 task 绑到当前空草稿
        if (viewEpochRef.current !== epoch) return
        switchTo(id, pid)
      }
    } catch (err) {
      if (viewEpochRef.current !== epoch) return
      setRunning(false)
      setModelRetry(null)
      const msg = err instanceof Error ? err.message : String(err)
      const preview = text.trim().slice(0, 80)
      setItems((prev) => {
        if (viewEpochRef.current !== epoch) return prev
        return [...prev, {
          kind: 'msg',
          id: `send-err-${Date.now()}`,
          role: 'error',
          content: `消息未送达:${msg}${preview ? `（原文: ${preview}${text.trim().length > 80 ? '…' : ''}）` : ''}`,
        }]
      })
    }
  }

  function newConversation(forProjectId?: string): void {
    if (forProjectId) projectIdRef.current = forProjectId
    switchTo(null, projectIdRef.current)
    setItems([])
    setEvidenceItems([])
    setRunning(false)
  }

  /** 切到历史会话:清屏 → attach。forProjectId 在跨项目点击时同步写入,避免闭包仍是旧 projectId */
  function selectConversation(id: string, isRunning = false, forProjectId?: string): void {
    const pid = forProjectId ?? projectIdRef.current
    if (forProjectId) projectIdRef.current = forProjectId
    if (id === taskIdRef.current) return
    switchTo(id, pid)
    setItems([])
    setEvidenceItems([])
    setRunning(isRunning)
    client.subscribe(id, pid)
  }

  /**
   * 停止当前 turn（发送按钮暂停态）= cancelTurn：
   * 中止主 loop + 杀本 turn 子 agent；不误杀其他 turn 的后台子。
   * 整 task 强制停走 client.cancel（归档路径等）。
   */
  function stop(): void {
    try {
      if (taskIdRef.current) client.cancelTurn(taskIdRef.current, projectIdRef.current)
    } catch { /* 已断线则本地收尾即可 */ }
    setRunning(false)
    setModelRetry(null)
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
    items, evidenceItems, running, pendingAsk, modelRetry, send, stop, answerAsk,
    newConversation, selectConversation, taskId, ctxUsage,
  }
}

/** 助手开口或轮次终态:把所有还在跑的过程块封口(避免旧块永远 running→虚线圈 breathing) */
export function sealRunningProcesses(items: ChatItem[]): ChatItem[] {
  if (!items.some((it) => it.kind === 'process' && it.running)) return items
  return items.map((it) => (it.kind === 'process' && it.running ? { ...it, running: false } : it))
}

function markThoughtsDone(prev: ChatItem[]): ChatItem[] {
  if (!prev.some((it) => it.kind === 'thought' && !it.done)) return prev
  return prev.map((it) => (it.kind === 'thought' && !it.done ? { ...it, done: true } : it))
}

function upsertThought(prev: ChatItem[], eventId: string, chunk: string, done = false): ChatItem[] {
  const text = chunk.trim()
  if (!text && !done) return prev
  const idx = (() => {
    for (let i = prev.length - 1; i >= 0; i--) {
      if (prev[i]!.kind === 'thought') return i
    }
    return -1
  })()
  if (idx >= 0) {
    const cur = prev[idx] as ThoughtItem
    const nextContent = text
      ? (cur.content ? `${cur.content}\n\n${text}` : text)
      : cur.content
    const next: ThoughtItem = { ...cur, content: nextContent, done: done || cur.done }
    return prev.map((it, i) => (i === idx ? next : it))
  }
  if (!text) return prev
  return [...prev, { kind: 'thought', id: `thought-${eventId}`, content: text, done }]
}

function dropStreamingAssistant(prev: ChatItem[]): ChatItem[] {
  const last = prev[prev.length - 1]
  if (last?.kind === 'msg' && last.role === 'assistant' && last.streaming) {
    return prev.slice(0, -1)
  }
  return prev
}

/** 终局：过程块从用户面消失（非折叠，而是整块卸下） */
function stripProcessItems(prev: ChatItem[]): ChatItem[] {
  if (!prev.some((it) => it.kind === 'process')) return prev
  return prev.filter((it) => it.kind !== 'process')
}

/**
 * 用户面归约（Claude 两阶段）：
 * - **进行中**：展示 tool/subagent 过程（透明度），reasoning → Thought
 * - **终局**（无工具的定稿正文 / reply / 终态）：过程块**卸下消失**，只留 Thought(折叠)+最终答案
 * - 工具轮中间正文不进大气泡；todo 仍展示
 */
export function reduceUserFacingItems(prev: ChatItem[], event: TaskEvent, p: Record<string, unknown>): ChatItem[] {
  switch (event.kind) {
    case 'user': {
      const images = Array.isArray(p.images) ? (p.images as ImageData[]) : undefined
      const uploads = parseUploadRefs(p.uploads)
      // 新 user turn：上一轮 thought 标 done；清残留 process
      const base = markThoughtsDone(stripProcessItems(prev))
      return [...base, {
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
      // 最终回答开始流式时：过程先卸下（「消失再出结果」）
      let next = stripProcessItems(prev)
      const last = next[next.length - 1]
      if (last?.kind === 'msg' && last.role === 'assistant' && last.streaming) {
        return [...next.slice(0, -1), { ...last, content: last.content + text }]
      }
      return [...next, { kind: 'msg', id: event.id, role: 'assistant', content: text, streaming: true }]
    }
    // 进行中：过程可见（复用证据面 process 逻辑）
    case 'tool_call_start':
    case 'subagent_started':
    case 'subagent_completed':
    case 'subagent_interrupted':
    case 'subagent_demoted':
      return reduceChatItems(prev, event, p)
    case 'model_step': {
      const content = typeof p.content === 'string' ? p.content.trim() : ''
      const tools = Array.isArray(p.toolCalls) ? p.toolCalls : []
      const reasoning = typeof p.reasoningContent === 'string' ? p.reasoningContent.trim() : ''
      let next = prev
      if (reasoning) next = upsertThought(next, event.id, reasoning, false)

      if (tools.length > 0) {
        // 工具轮：丢掉半成品流式泡；过程块保持（进行中可见）
        // 不因正文 seal process（避免碎成多条）
        next = dropStreamingAssistant(next)
        // 若尚无 process，不在这里开——等 tool_call_start
        return next
      }

      // —— 终局：无工具定稿 —— 过程消失，只留 Thought + 答案
      next = stripProcessItems(next)

      let streamingIdx = -1
      for (let i = next.length - 1; i >= 0; i -= 1) {
        const it = next[i]
        if (it?.kind === 'msg' && it.role === 'assistant' && it.streaming) {
          streamingIdx = i
          break
        }
      }
      if (streamingIdx >= 0) {
        const out = next.slice()
        if (content) {
          out[streamingIdx] = { kind: 'msg', id: event.id, role: 'assistant', content }
          return markThoughtsDone(out)
        }
        out.splice(streamingIdx, 1)
        if (!content && !reasoning) {
          return [...markThoughtsDone(out), {
            kind: 'msg',
            id: event.id,
            role: 'error',
            content: '模型返回了空回复（常见于思考模式耗尽输出额度）。请重试，或在设置中换模型。',
          }]
        }
        return markThoughtsDone(out)
      }
      if (content) {
        return markThoughtsDone([...next, { kind: 'msg', id: event.id, role: 'assistant', content }])
      }
      if (!reasoning) {
        return [...next, {
          kind: 'msg',
          id: event.id,
          role: 'error',
          content: '模型返回了空回复（常见于思考模式耗尽输出额度）。请重试，或在设置中换模型。',
        }]
      }
      return markThoughtsDone(next)
    }
    case 'tool_call': {
      const name = String(p.name ?? 'tool')
      if (isTodoTool(name)) {
        const list = todoFromToolArgs(p.args)
        return list ? upsertTodo(prev, event.id, list) : prev
      }
      return reduceChatItems(prev, event, p)
    }
    case 'tool_result': {
      const name = String(p.name ?? '')
      if (isTodoTool(name)) {
        const list = todoFromLlmContent(typeof p.llmContent === 'string' ? p.llmContent : '')
        return list ? upsertTodo(prev, event.id, list) : prev
      }
      return reduceChatItems(prev, event, p)
    }
    case 'reply':
      // 终局：卸过程 + 收 Thought
      return markThoughtsDone(stripProcessItems(prev))
    case 'status_change': {
      const to = String(p.to ?? '')
      if (!['canceled', 'failed', 'done', 'interrupted'].includes(to)) return prev
      return markThoughtsDone(stripProcessItems(prev))
    }
    case 'compaction':
      return [...prev, { kind: 'compaction', id: event.id }]
    case 'error':
      return markThoughtsDone(stripProcessItems([
        ...prev,
        { kind: 'msg', id: event.id, role: 'error', content: String(p.error ?? '出错了') },
      ]))
    default:
      return prev
  }
}

/** 证据面归约:同一个 event 进来,prev → next。完整 process/subagent。 */
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
      const path = pathFromToolArgs(p.args) ?? undefined
      const step: ProcStep = {
        id,
        name,
        done: false,
        label: `${verb(name)}…`,
        ...(path ? { path } : {}),
      }
      const last = prev[prev.length - 1]
      if (last && last.kind === 'process' && last.running) {
        if (last.steps.some((s) => s.id === id)) {
          // tool_call_start 已占位:补 path
          return [...prev.slice(0, -1), {
            ...last,
            steps: last.steps.map((s) => (s.id === id ? { ...s, ...step, done: false } : s)),
          }]
        }
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
      const payloadPath = typeof p.path === 'string' && p.path.trim() ? p.path.trim() : null
      let fallbackPath: string | undefined
      for (const it of prev) {
        if (it.kind !== 'process') continue
        const s = it.steps.find((x) => x.id === id)
        if (s?.path) { fallbackPath = s.path; break }
      }
      const path = payloadPath ?? fallbackPath
      const label = summarize(name, typeof p.llmContent === 'string' ? p.llmContent : '', path)
      return prev.map((it) => it.kind === 'process'
        ? {
            ...it,
            steps: it.steps.map((s) => (s.id === id
              ? { ...s, done: true, label, ...(path ? { path } : {}) }
              : s)),
          }
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
    case 'subagent_started': {
      const sid = String(p.subagent_id ?? event.id)
      const stype = String(p.subagent_type ?? 'subagent')
      const desc = String(p.description ?? stype)
      const step: ProcStep = {
        id: `sub-${sid}`,
        name: 'spawn_subagent',
        done: false,
        label: `子代理 ${stype}：${desc}`,
      }
      const last = prev[prev.length - 1]
      if (last?.kind === 'process' && last.running) {
        if (last.steps.some((s) => s.id === step.id)) return prev
        return [...prev.slice(0, -1), { ...last, steps: [...last.steps, step] }]
      }
      return [...prev, { kind: 'process', id: `proc-sub-${sid}`, steps: [step], running: true }]
    }
    case 'subagent_completed':
    case 'subagent_interrupted':
    case 'subagent_demoted': {
      const sid = String(p.subagent_id ?? '')
      const status = String(p.status ?? event.kind.replace('subagent_', ''))
      const summary = typeof p.summary === 'string' ? p.summary
        : typeof p.completion_summary === 'string' ? p.completion_summary
          : status
      const label = event.kind === 'subagent_demoted'
        ? '子代理已转后台继续'
        : `子代理 ${status}${summary && summary !== status ? ` · ${summary.slice(0, 80)}` : ''}`
      return prev.map((it) => {
        if (it.kind !== 'process') return it
        const steps = it.steps.map((s) => (
          s.id === `sub-${sid}`
            ? { ...s, done: event.kind !== 'subagent_demoted', label }
            : s
        ))
        const stillRun = event.kind === 'subagent_demoted'
          ? it.running
          : steps.some((s) => !s.done) ? it.running : false
        return { ...it, steps, running: stillRun && steps.some((s) => !s.done) }
      })
    }
    case 'error':
      return [...prev, { kind: 'msg', id: event.id, role: 'error', content: String(p.error ?? '出错了') }]
    default:
      return prev
  }
}

/** 证据面别名（与 reduceChatItems 相同） */
export function reduceEvidenceItems(prev: ChatItem[], event: TaskEvent, p: Record<string, unknown>): ChatItem[] {
  return reduceChatItems(prev, event, p)
}

/** 完成态摘要:write/edit 优先展示 path;旧事件无 path 时「完成(无 path)」 */
function summarize(name: string, llmContent: string, path?: string): string {
  const v = verb(name)
  if (name === 'ask_user') {
    if (llmContent.includes('跳过')) return `${v} · 已跳过`
    return `${v} · 已回答`
  }
  if (name === 'write_file' || name === 'edit_file') {
    if (path) return `${v} · ${path}`
    // 从 llmContent 兜底:ok: 已写入 notes/a.md
    const m = llmContent.match(/已(?:写入|编辑)\s+(\S+)/)
    if (m?.[1]) return `${v} · ${m[1]}`
    return `${v} · 完成(无 path)`
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

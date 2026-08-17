/**
 * [INPUT]: AgentClient 的事件流 / submit·continue·subscribe·answerUser
 * [OUTPUT]: useAgent → items(用户面)/evidenceItems(归因面)/running/modelRetry/…;
 *           归约纯函数从 chat/reduce.ts 再导出(测试仍可从本文件 import)
 * [POS]: UI 对话状态核的 hook 相;事件→状态投影是纯函数(chat/reduce);
 *        切会话 bump viewEpoch,setItems updater 内二次 isLiveTaskEvent
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 *
 * user 也走事件流,不在前端乐观插入。taskId 按项目键存 localStorage。
 */
import { useEffect, useRef, useState } from 'react'
import type { AgentClient, AnswerUserPayload, ImageData, TaskEvent, UploadRef } from './agent-client'
import type { ChatItem, ModelRetryState, PendingAsk } from './chat/types.ts'
import {
  isLiveTaskEvent,
  parseAskUserQuestions,
  reduceChatItems,
  reduceUserFacingItems,
  safeParse,
} from './chat/reduce.ts'

export type {
  AskUserOption,
  AskUserQuestion,
  ChatItem,
  ChatMsg,
  CompactionMark,
  ModelRetryState,
  PendingAsk,
  ProcessItem,
  ProcStep,
  ThoughtItem,
  TodoChatItem,
  TodoEntry,
  TodoStatus,
} from './chat/types.ts'

export {
  coalesceTurnThoughts,
  isLiveTaskEvent,
  parseAskUserQuestions,
  reduceChatItems,
  reduceEvidenceItems,
  reduceUserFacingItems,
  sealOpenTodos,
  sealRunningProcesses,
} from './chat/reduce.ts'

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

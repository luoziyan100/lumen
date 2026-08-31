/**
 * [INPUT]: agent-client 的 ImageData / UploadRef;sourceCite 的 SourceCite
 * [OUTPUT]: ChatItem 族(msg/process/thought/todo/compaction)与 ask_user / modelRetry 状态形
 * [POS]: 对话状态的数据相;归约在 reduce.ts,hook 在 useAgent.ts;UI 只消费这些形
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { ImageData, UploadRef } from '../agent-client'
import type { SourceCite } from '../sourceCite.ts'

export interface ChatMsg {
  kind: 'msg'
  /** 界面身份:封口 provisional 时继承其 id,不是 model_step 事件 id */
  id: string
  role: 'user' | 'assistant' | 'error'
  content: string
  images?: ImageData[]
  /** 本回合落盘附件(chip);机读附言只在 service 拼进模型 */
  uploads?: UploadRef[]
  /** 真流式中:text_delta 累积;model_step 定稿后清除 */
  streaming?: boolean
  /**
   * 中间轮旁白（尚未确认是终稿）。视觉弱化为工作稿，不进复制钮/终稿轨。
   * tool 出现或 model_step 带 tools 时折叠进 Thought；无工具定稿时清除。
   */
  provisional?: boolean
  /** 本轮检索/抓取过的外链;模型漏写 Sources 时宿主表兜底 */
  sources?: SourceCite[]
}
export interface ProcStep {
  id: string
  name: string
  done: boolean
  label: string
  /** write/edit 路径:来自 tool_call.args 或 tool_result.path */
  path?: string
}
export interface ProcessItem {
  kind: 'process'
  id: string
  steps: ProcStep[]
  running: boolean
  startedAt?: string
  sources?: SourceCite[]
}
/** Claude 档：折叠的思考过程（reasoningContent）;同 turn 至多一块 */
export interface ThoughtItem {
  kind: 'thought'
  id: string
  content: string
  done: boolean
  startedAt?: string
  endedAt?: string
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

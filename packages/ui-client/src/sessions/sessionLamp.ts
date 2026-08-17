/**
 * [INPUT]: Task.status + 本地 unread 集合
 * [OUTPUT]: sessionLampKind / shouldMarkUnreadOnStatus / SESSION_FINISHED
 * [POS]: 侧栏会话灯状态机(idle 空心 / unread 实心 / running 脉动);优先级 running > unread > idle
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

/** 终态:后台完成且非当前会话 → 可标未读 */
export const SESSION_FINISHED = new Set([
  'done',
  'failed',
  'canceled',
  'interrupted',
])

export type SessionLampKind = 'idle' | 'running' | 'unread'

/** running/queued 优先;否则 unread;否则空心 idle */
export function sessionLampKind(opts: {
  status: string
  unread: boolean
}): SessionLampKind {
  if (opts.status === 'running' || opts.status === 'queued') return 'running'
  if (opts.unread) return 'unread'
  return 'idle'
}

/** 非当前会话从非终态进入终态 → 应置未读(避免 pin/title 等 meta 更新误标) */
export function shouldMarkUnreadOnStatus(opts: {
  prevStatus: string | undefined
  status: string
  taskId: string
  activeTaskId: string | null
}): boolean {
  if (opts.taskId === opts.activeTaskId) return false
  if (!SESSION_FINISHED.has(opts.status)) return false
  if (opts.prevStatus == null) return false
  if (SESSION_FINISHED.has(opts.prevStatus)) return false
  return true
}

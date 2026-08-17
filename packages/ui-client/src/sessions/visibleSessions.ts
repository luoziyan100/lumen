/**
 * [INPUT]: 已排序的会话列表;可选 activeId
 * [OUTPUT]: visibleSessions / SESSION_PREVIEW_N / SESSION_RECENT_N —— 前 N + active 保底
 * [POS]: Sidebar 项目树与「最近」共用可见窗;溢出换面会话页,不再原地展开
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

/** 项目树默认可见会话条数 */
export const SESSION_PREVIEW_N = 4
/** 「最近」桶默认可见条数 */
export const SESSION_RECENT_N = 20

export interface VisibleSessionsResult<T extends { id: string }> {
  visible: T[]
  /** 总数超过预览窗,侧栏应出「查看全部」 */
  canToggle: boolean
  /** 当前处于截断态 */
  capped: boolean
}

/**
 * 前 n 条;若 active 不在窗内则追加(允许 n+1)。
 * 总数 ≤ n:全量。顺序保持入参序。无展开态。
 */
export function visibleSessions<T extends { id: string }>(
  tasks: T[],
  opts: {
    activeId: string | null
    n?: number
  },
): VisibleSessionsResult<T> {
  const n = opts.n ?? SESSION_PREVIEW_N
  const canToggle = tasks.length > n
  if (!canToggle) {
    return { visible: tasks, canToggle: false, capped: false }
  }

  const head = tasks.slice(0, n)
  const activeId = opts.activeId
  if (!activeId || head.some((t) => t.id === activeId)) {
    return { visible: head, canToggle: true, capped: true }
  }
  const active = tasks.find((t) => t.id === activeId)
  if (!active) {
    return { visible: head, canToggle: true, capped: true }
  }
  return { visible: [...head, active], canToggle: true, capped: true }
}

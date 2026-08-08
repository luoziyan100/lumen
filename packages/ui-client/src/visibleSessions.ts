/**
 * [INPUT]: 已排序的项目内会话列表(未置顶);可选 activeId
 * [OUTPUT]: visibleSessions / SESSION_PREVIEW_N —— 收起态前 N + active 保底
 * [POS]: Sidebar 项目树 Progressive Disclosure;置顶/最近不经此函数
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

/** 项目树默认可见会话条数(Claude Workspace 类比 ~3–4) */
export const SESSION_PREVIEW_N = 4

export interface VisibleSessionsResult<T extends { id: string }> {
  /** 应收起/展开后实际渲染的会话 */
  visible: T[]
  /** 总数超过预览窗,需展示 toggle */
  canToggle: boolean
  /** 当前处于截断态(未展开且 canToggle) */
  capped: boolean
}

/**
 * 收起:前 n 条;若 active 不在窗内则追加(允许 n+1)。
 * 展开或总数 ≤ n:全量。顺序保持入参序。
 */
export function visibleSessions<T extends { id: string }>(
  tasks: T[],
  opts: {
    expanded: boolean
    activeId: string | null
    n?: number
  },
): VisibleSessionsResult<T> {
  const n = opts.n ?? SESSION_PREVIEW_N
  const canToggle = tasks.length > n
  if (!canToggle || opts.expanded) {
    return { visible: tasks, canToggle, capped: false }
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

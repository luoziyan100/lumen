/**
 * [INPUT]: 全量会话(非「最近」桶);标题/goal;筛选维
 * [OUTPUT]: sessionMatchesQuery / applySessionFilter / querySessions
 * [POS]: sessions/ 纯函数;SearchModal 与 SessionsView 共用匹配,禁止各写一份
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

export type SessionFilter =
  | { type: 'all' }
  | { type: 'running' }
  | { type: 'pinned' }
  | { type: 'project'; projectId: string }

export function sessionMatchesQuery(
  task: { title?: string | null; goal: string },
  query: string,
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const title = (task.title ?? '').toLowerCase()
  return title.includes(q) || task.goal.toLowerCase().includes(q)
}

export function applySessionFilter<T extends {
  project_id: string
  status: string
  pinned_at?: string | null
}>(tasks: readonly T[], filter: SessionFilter): T[] {
  switch (filter.type) {
    case 'all':
      return [...tasks]
    case 'running':
      return tasks.filter((t) => t.status === 'running')
    case 'pinned':
      return tasks.filter((t) => Boolean(t.pinned_at?.trim()))
    case 'project':
      return tasks.filter((t) => t.project_id === filter.projectId)
  }
}

export function querySessions<T extends {
  title?: string | null
  goal: string
  project_id: string
  status: string
  pinned_at?: string | null
}>(tasks: readonly T[], opts: { query: string; filter: SessionFilter }): T[] {
  return applySessionFilter(tasks, opts.filter).filter((t) => sessionMatchesQuery(t, opts.query))
}

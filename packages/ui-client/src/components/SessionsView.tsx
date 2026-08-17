/**
 * [INPUT]: 全量 Task + Project;SESSIONS_COPY;querySessions/paginate/relativeTime;Kumo Button/DropdownMenu
 * [OUTPUT]: SessionsView —— 会话页(主列档案室):搜索 ∩ 筛选 + 分页
 * [POS]: 替换对话主列,侧栏仍在;数据源是全量 list 不是「最近」桶
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import { DropdownMenu } from '@cloudflare/kumo/components/dropdown'
import type { Project, Task } from '../agent-client'
import { SESSIONS_COPY } from '../copy/appCopy'
import { displayTaskTitle } from '../sessions/displayTaskTitle'
import { paginate } from '../sessions/paginate'
import { relativeTimeParts } from '../sessions/relativeTime'
import { querySessions, type SessionFilter } from '../sessions/sessionQuery'
import { isUserProjectId } from '../sessions/sidebarBuckets'
import { SearchIcon, ICON_SM } from './icons'

function formatRel(iso: string | undefined, nowMs: number): string {
  if (!iso) return ''
  const p = relativeTimeParts(iso, nowMs)
  if (p.kind === 'justNow') return SESSIONS_COPY.justNow
  if (p.kind === 'minutes') return SESSIONS_COPY.minutesAgo(p.n)
  if (p.kind === 'hours') return SESSIONS_COPY.hoursAgo(p.n)
  if (p.kind === 'days') return SESSIONS_COPY.daysAgo(p.n)
  return p.ymd
}

function filterLabel(filter: SessionFilter, projects: Project[]): string {
  if (filter.type === 'all') return SESSIONS_COPY.filterAll
  if (filter.type === 'running') return SESSIONS_COPY.filterRunning
  if (filter.type === 'pinned') return SESSIONS_COPY.filterPinned
  return projects.find((p) => p.id === filter.projectId)?.name ?? SESSIONS_COPY.filter
}

export function SessionsView({
  sessions,
  projects,
  initialProjectId,
  onSelect,
  onNewChat,
}: {
  sessions: Task[]
  projects: Project[]
  /** 从项目树「查看全部」进来则预筛该项目;null=全部 */
  initialProjectId: string | null
  onSelect: (task: Task) => void
  onNewChat: () => void
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<SessionFilter>(() =>
    initialProjectId ? { type: 'project', projectId: initialProjectId } : { type: 'all' },
  )
  const [page, setPage] = useState(1)
  const [nowMs] = useState(() => Date.now())

  useEffect(() => { setPage(1) }, [query, filter])

  const userProjects = useMemo(() => projects.filter((p) => isUserProjectId(p.id)), [projects])
  const filtered = useMemo(
    () => querySessions(sessions, { query, filter }),
    [sessions, query, filter],
  )
  const paged = useMemo(() => paginate(filtered, page), [filtered, page])
  const projectName = (pid: string): string | null => {
    if (!isUserProjectId(pid)) return null
    return projects.find((p) => p.id === pid)?.name ?? null
  }

  return (
    <div className="sessions-view">
      <header className="sessions-head">
        <h1 className="sessions-title">{SESSIONS_COPY.title}</h1>
        <div className="sessions-tools">
          <label className="sessions-search">
            <SearchIcon size={ICON_SM} />
            <input
              type="search"
              value={query}
              placeholder={SESSIONS_COPY.searchPlaceholder}
              aria-label={SESSIONS_COPY.searchPlaceholder}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <DropdownMenu>
            <DropdownMenu.Trigger
              render={<button type="button" className="sessions-filter" />}
              aria-label={SESSIONS_COPY.filter}
            >
              {filterLabel(filter, projects)}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end" side="bottom" sideOffset={4} className="glass-card">
              <DropdownMenu.Item onClick={() => setFilter({ type: 'all' })}>
                {SESSIONS_COPY.filterAll}
              </DropdownMenu.Item>
              <DropdownMenu.Item onClick={() => setFilter({ type: 'running' })}>
                {SESSIONS_COPY.filterRunning}
              </DropdownMenu.Item>
              <DropdownMenu.Item onClick={() => setFilter({ type: 'pinned' })}>
                {SESSIONS_COPY.filterPinned}
              </DropdownMenu.Item>
              {userProjects.map((p) => (
                <DropdownMenu.Item key={p.id} onClick={() => setFilter({ type: 'project', projectId: p.id })}>
                  {p.name}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu>
          <Button type="button" variant="primary" onClick={onNewChat}>
            {SESSIONS_COPY.newChat}
          </Button>
        </div>
      </header>

      {paged.slice.length === 0 ? (
        <div className="sessions-empty">
          {sessions.length === 0 || (!query.trim() && filter.type === 'all')
            ? SESSIONS_COPY.empty
            : SESSIONS_COPY.emptySearch}
        </div>
      ) : (
        <ul className="sessions-list">
          {paged.slice.map((task) => {
            const proj = projectName(task.project_id)
            const when = formatRel(task.updated_at ?? task.created_at, nowMs)
            return (
              <li key={task.id}>
                <button type="button" className="sessions-row" onClick={() => onSelect(task)}>
                  <span className="sessions-row-main">
                    <span className="sessions-row-title">{displayTaskTitle(task)}</span>
                    {proj && <span className="sessions-row-proj">{proj}</span>}
                  </span>
                  <span className="sessions-row-meta">
                    {task.status === 'running' && <span className="sb-dot" aria-hidden />}
                    {when}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {paged.pageCount > 1 && (
        <nav className="sessions-pager" aria-label={SESSIONS_COPY.pageStatus(paged.page, paged.pageCount)}>
          <Button
            type="button"
            variant="ghost"
            disabled={paged.page <= 1}
            onClick={() => setPage(paged.page - 1)}
          >
            {SESSIONS_COPY.prevPage}
          </Button>
          <span className="sessions-pager-status">
            {SESSIONS_COPY.pageStatus(paged.page, paged.pageCount)}
          </span>
          <Button
            type="button"
            variant="ghost"
            disabled={paged.page >= paged.pageCount}
            onClick={() => setPage(paged.page + 1)}
          >
            {SESSIONS_COPY.nextPage}
          </Button>
        </nav>
      )}
    </div>
  )
}

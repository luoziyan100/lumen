/**
 * [INPUT]: 完整跨项目目录与显式选择回调
 * [OUTPUT]: SessionsIndex：主列会话档案，按项目/标题/置顶/进行中筛选，每页二十条
 * [POS]: 侧栏预览的完整入口；过滤只影响档案，不改变正在阅读的会话身份
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useState } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import { Input } from '@cloudflare/kumo/components/input'
import { DropdownMenu } from '@cloudflare/kumo/components/dropdown'
import type { Project, SessionInfo } from '../../data/client'

export function SessionsIndex({ projects, sessions, initialProject, onSession }: { projects: Project[]; sessions: SessionInfo[]; initialProject: string | null; onSession: (session: SessionInfo) => void }) {
  const [project, setProject] = useState(initialProject), [search, setSearch] = useState(''), [pinned, setPinned] = useState(false), [page, setPage] = useState(0), [running, setRunning] = useState(false)
  const filtered = sessions.filter(item => (!project || item.projectId === project) && (!pinned || item.pinned) && (!running || item.running || item.waiting) && item.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  const pages = Math.max(1, Math.ceil(filtered.length / 20)), current = Math.min(page, pages - 1)
  return <div className="sessions-view"><header className="sessions-head"><h1 className="sessions-title">会话</h1><div className="sessions-tools">
    <Input autoFocus aria-label="搜索全部会话" placeholder="搜索会话…" value={search} onChange={event => { setSearch(event.target.value); setPage(0) }} />
    <DropdownMenu><DropdownMenu.Trigger render={<Button variant="secondary" />}>{projects.find(item => item.id === project)?.name ?? '全部项目'}</DropdownMenu.Trigger><DropdownMenu.Content>
      {[{ id: null, name: '全部项目' }, ...projects].map(item => <DropdownMenu.Item key={item.id ?? 'all'} onClick={() => { setProject(item.id); setPage(0) }}>{item.name}</DropdownMenu.Item>)}
    </DropdownMenu.Content></DropdownMenu><Button variant={pinned ? 'primary' : 'secondary'} onClick={() => { setPinned(value => !value); setPage(0) }}>仅置顶</Button><Button variant={running ? 'primary' : 'secondary'} onClick={() => { setRunning(value => !value); setPage(0) }}>进行中</Button>
  </div></header><ul className="sessions-list">{filtered.slice(current * 20, (current + 1) * 20).map(item => <li key={`${item.projectId}:${item.taskId}`}><button className="sessions-row" onClick={() => onSession(item)}><span className="sessions-row-main"><span className="sessions-row-title">{item.title || '新对话'}</span><span className="sessions-row-proj">{projects.find(project => project.id === item.projectId)?.name}</span></span><span className="sessions-row-meta">{item.waiting ? '等待处理 · ' : item.running ? '进行中 · ' : ''}{item.pinned && '置顶 · '}{new Date(item.updatedAt).toLocaleDateString()}</span></button></li>)}{!filtered.length && <li className="sessions-empty">没有匹配的会话</li>}</ul>
    <footer className="sessions-pager"><Button variant="ghost" disabled={!current} onClick={() => setPage(current - 1)}>上一页</Button><span className="sessions-pager-status">{current + 1} / {pages} · {filtered.length} 条</span><Button variant="ghost" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>下一页</Button></footer>
  </div>
}

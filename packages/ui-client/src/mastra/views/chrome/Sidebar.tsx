/**
 * [INPUT]: Mastra 目录 DTO 与工作台选择/管理回调、原 CurtainFold、侧栏样式与图标
 * [OUTPUT]: Sidebar：项目树与会话导航，右键菜单包含显式会话诊断目标，状态灯允许已读切换
 * [POS]: 项目和会话树持续挂载播放原卷帘与错峰；只呈现目录，所有写入和会话身份归工作台
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useState, type CSSProperties } from 'react'
import { DropdownMenu } from '@cloudflare/kumo/components/dropdown'
import { AccountIcon, ChatIcon, FolderIcon, GearIcon, NewProjectIcon, SearchIcon, ArchiveIcon, ChevronIcon, SectionChevronIcon, PlusIcon } from '../../../components/icons'
import type { Identity, Project, SessionInfo } from '../../data/client'
import { useResizable } from './useResizable'
import { CurtainFold } from '../../../components/disclosure/CurtainFold'

type Props = {
  projects: Project[]; sessions: SessionInfo[]; projectId: string; identity: Identity | null; busy: boolean
  onIndex: (projectId: string | null) => void; onSearch: () => void
  archivedProjects: boolean; archivedSessions: boolean; toggleProjects: () => void; toggleSessions: () => void
  onProject: (project: Project) => void; onSession: (session: SessionInfo) => void; onNew: (projectId: string) => void; onCreateProject: () => void
  onRenameProject: (project: Project) => void; onArchiveProject: (project: Project) => void;
  onDiagnostics?: (session: SessionInfo) => void
  onRenameSession: (session: SessionInfo) => void; onUpdateSession: (session: SessionInfo, updates: { pinned?: boolean; archived?: boolean }) => void; onCopySession: (session: SessionInfo) => void; onToggleUnread: (session: SessionInfo) => void; onSettings: () => void; onAgents: () => void
}

export function Sidebar(p: Props) {
  const [menu, setMenu] = useState<string | null>(null)
  const [projectsOpen, setProjectsOpen] = useState(() => { try { return localStorage.getItem('lumen:sbProjectsOpen') !== '0' } catch { return true } })
  const [expanded, setExpanded] = useState<string[]>(() => {
    try { const saved = JSON.parse(localStorage.getItem('lumen:sbExpandedProjects') ?? 'null'); return Array.isArray(saved) ? saved.filter(id => typeof id === 'string') : [p.projectId] } catch { return [p.projectId] }
  })
  useEffect(() => { try { localStorage.setItem('lumen:sbProjectsOpen', projectsOpen ? '1' : '0'); localStorage.setItem('lumen:sbExpandedProjects', JSON.stringify(expanded)) } catch { /* 本机存储不可用仍可导航。 */ } }, [projectsOpen, expanded])
  const toggle = (id: string) => { setMenu(null); setExpanded(items => items.includes(id) ? items.filter(item => item !== id) : [...items, id]) }
  const preview = (items: SessionInfo[], size: number) => {
    const head = items.slice(0, size)
    const active = items.find(item => item.projectId === p.identity?.projectId && item.taskId === p.identity.taskId)
    return active && !head.includes(active) ? [...head, active] : head
  }
  const pinned = p.sessions.filter(session => session.pinned), recent = p.sessions.filter(session => !session.pinned)
  const row = (session: SessionInfo, nested = false) => <div className={`sb-item-row${p.identity?.taskId === session.taskId && p.identity.projectId === session.projectId ? ' is-active' : ''}`} key={`${session.projectId}:${session.taskId}`}>
    <button type="button" onClick={() => p.onToggleUnread(session)} aria-pressed={session.unread} className={`sb-lamp is-${session.running || session.waiting ? 'running' : session.unread ? 'unread' : 'idle'}`} title={session.waiting ? '等待处理' : session.running ? '进行中' : session.unread ? '未读' : '已读'} aria-label={session.waiting ? '等待处理' : session.running ? '进行中' : session.unread ? '未读' : '已读'}><span className="sb-lamp-dot" /></button>
    <DropdownMenu open={menu === `session:${nested ? 'tree' : 'global'}:${session.projectId}:${session.taskId}`} onOpenChange={open => { if (!open) setMenu(null) }}>
      <DropdownMenu.Trigger render={<button className={`sb-item${nested ? '' : ' sb-item-flat'}`} aria-current={p.identity?.taskId === session.taskId && p.identity.projectId === session.projectId ? 'page' : undefined} />} onClick={event => { event.preventDefault(); setMenu(null); p.onSession(session) }} onContextMenu={event => { event.preventDefault(); setMenu(`session:${nested ? 'tree' : 'global'}:${session.projectId}:${session.taskId}`) }}><span className="sb-folder-name">{session.title || '新对话'}</span></DropdownMenu.Trigger>
      <DropdownMenu.Content align="start" className="sb-task-menu glass-card"><DropdownMenu.Item onClick={() => p.onUpdateSession(session, { pinned: !session.pinned })}>{session.pinned ? '取消置顶' : '置顶'}</DropdownMenu.Item><DropdownMenu.Item onClick={() => p.onRenameSession(session)}>重命名</DropdownMenu.Item><DropdownMenu.Item onClick={() => p.onCopySession(session)}>复制会话 ID</DropdownMenu.Item><DropdownMenu.Item onClick={() => p.onToggleUnread(session)}>{session.unread ? '标为已读' : '标为未读'}</DropdownMenu.Item>{p.onDiagnostics && <DropdownMenu.Item onClick={() => p.onDiagnostics?.(session)}>会话诊断</DropdownMenu.Item>}<DropdownMenu.Separator /><DropdownMenu.Item onClick={() => p.onUpdateSession(session, { archived: !session.archived })}>{session.archived ? '恢复' : '归档'}</DropdownMenu.Item></DropdownMenu.Content>
    </DropdownMenu>
  </div>
  const { width, handleProps } = useResizable({ edge: 'right', min: 220, max: 420, fallback: 300, storageKey: 'lumen:sbWidth' })
  const selectedProject = p.projects.find(project => project.id === p.projectId)
  return <aside className="sidebar mw-sidebar" style={{ '--sidebar-w': `${width}px` } as CSSProperties}>
    <nav className="sb-nav">
      <button className="sb-navrow" disabled={p.busy || !selectedProject || selectedProject.archived} onClick={() => p.onNew(p.projectId)}><ChatIcon />新对话</button>
      <button className="sb-navrow" onClick={p.onSearch}><SearchIcon size={18} />搜索对话</button>
      <button className="sb-navrow" onClick={p.onCreateProject}><NewProjectIcon />新建项目</button>
    </nav>
    <div className="sb-list">
      <div className="mw-section-label"><button type="button" className={`sb-section-h sb-section-toggle${projectsOpen ? ' is-open' : ''}`} aria-expanded={projectsOpen} aria-controls="sb-projects-body" onClick={() => { setMenu(null); setProjectsOpen(value => !value) }}><span className="sb-section-label">项目</span><span className="sb-section-chev" aria-hidden><SectionChevronIcon open={projectsOpen} /></span></button><DropdownMenu>
        <DropdownMenu.Trigger render={<button className="icon-btn nav-icon-btn" aria-label="项目管理" />}><GearIcon size={16} /></DropdownMenu.Trigger>
        <DropdownMenu.Content><DropdownMenu.Item onClick={p.toggleProjects}>{p.archivedProjects ? '查看当前项目' : '查看归档项目'}</DropdownMenu.Item>
          {selectedProject && <><DropdownMenu.Item onClick={() => p.onRenameProject(selectedProject)}>重命名项目</DropdownMenu.Item>{selectedProject.id !== 'default' && <DropdownMenu.Item onClick={() => p.onArchiveProject(selectedProject)}>{selectedProject.archived ? '恢复项目' : '归档项目'}</DropdownMenu.Item>}<DropdownMenu.Item onClick={p.onAgents}>研究角色</DropdownMenu.Item></>}
        </DropdownMenu.Content>
      </DropdownMenu></div>
      <nav aria-label="项目"><CurtainFold open={projectsOpen} id="sb-projects-body" className="sb-projects-body" stagger>{p.projects.filter(project => project.id !== 'default').map(project => {
        const children = p.sessions.filter(session => session.projectId === project.id && !session.pinned)
        const open = expanded.includes(project.id)
        return <div className={`sb-folder${project.id === p.projectId ? ' is-active-proj' : ''}`} key={project.id}><div className="sb-folder-row">
          <button className="sb-folder-ic" aria-label={`${open ? '收起' : '展开'}${project.name}`} aria-expanded={open} aria-controls={`sb-sessions-${project.id}`} onClick={() => toggle(project.id)}><span className="sb-folder-ic-folder"><FolderIcon open={open} /></span><span className="sb-folder-ic-chev"><ChevronIcon open={open} /></span></button>
          <DropdownMenu open={menu === `project:${project.id}`} onOpenChange={open => { if (!open) setMenu(null) }}><DropdownMenu.Trigger render={<button className="sb-folder-main" aria-pressed={project.id === p.projectId} />} onClick={event => { event.preventDefault(); setMenu(null); p.onProject(project) }} onContextMenu={event => { event.preventDefault(); setMenu(`project:${project.id}`) }}><span className="sb-folder-name">{project.name}</span></DropdownMenu.Trigger><DropdownMenu.Content align="start" className="sb-task-menu glass-card"><DropdownMenu.Item onClick={() => p.onRenameProject(project)}>重命名项目</DropdownMenu.Item><DropdownMenu.Item onClick={() => p.onArchiveProject(project)}>{project.archived ? '恢复项目' : '归档项目'}</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu>
          <button className="sb-folder-plus" aria-label={`在${project.name}新建对话`} disabled={p.busy || project.archived} onClick={() => p.onNew(project.id)}><PlusIcon size={14} /></button>
        </div><CurtainFold open={open} id={`sb-sessions-${project.id}`} className="sb-sess-wrap" stagger><div className="sb-sess">{preview(children, 4).map(session => row(session, true))}{children.length > 4 && <button className="sb-sess-more" onClick={() => p.onIndex(project.id)}>查看全部</button>}</div></CurtainFold></div>
      })}</CurtainFold></nav>
      {pinned.length > 0 && <><h2 className="sb-section-h">置顶</h2><nav aria-label="置顶会话">{pinned.map(session => row(session))}</nav></>}
      <div className="mw-section-label"><h2 className="sb-section-h">{p.archivedSessions ? '已归档对话' : '最近对话'}</h2><button className="icon-btn nav-icon-btn" title={p.archivedSessions ? '查看当前会话' : '查看归档会话'} aria-label={p.archivedSessions ? '查看当前会话' : '查看归档会话'} onClick={p.toggleSessions}><ArchiveIcon /></button></div>
      <nav aria-label="最近会话">{preview(recent, 20).map(session => row(session))}</nav>
      {!p.sessions.length && <p className="sb-empty">暂无会话</p>}
      {recent.length > 20 && <button className="sb-sess-more sb-sess-more-recent" onClick={() => p.onIndex(null)}>查看全部会话</button>}
    </div>
    <div className="sb-foot"><button className="sb-account" onClick={p.onSettings} title="设置"><span className="sb-avatar"><AccountIcon size={18} /></span><span className="sb-account-text"><span className="sb-account-name">本地账户</span><span className="sb-account-hint">设置与偏好</span></span><span className="sb-account-gear"><GearIcon size={16} /></span></button></div>
    <div className="sb-resize" role="separator" aria-orientation="vertical" aria-label="调整侧栏宽度（双击复位）" {...handleProps} />
  </aside>
}

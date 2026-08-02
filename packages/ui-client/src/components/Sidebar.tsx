/**
 * [INPUT]: Project / Task;icons;SIDEBAR_*_COPY;useResizable
 * [OUTPUT]: Sidebar —— 项目树 + 最近;+ 才出临时「新建对话」,空项目不写「还没有会话」
 * [POS]: 左栏;历史≠项目;草稿未发言离开即消
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useEffect, useState, type MouseEvent } from 'react'
import type { Project, Task } from '../agent-client'
import {
  AccountIcon, ChatIcon, ChevronIcon, FolderIcon, GearIcon, NewProjectIcon,
  PlusIcon, SearchIcon, ICON_MD,
} from './icons'
import { SIDEBAR_ACCOUNT_COPY, SIDEBAR_PROJECT_COPY } from '../appCopy'
import { useResizable } from '../useResizable'

interface SidebarProps {
  connected: boolean
  /** 仅用户显式创建的项目(p-*),不含 default/孤儿桶 */
  projects: Project[]
  tasksByProject: Record<string, Task[]>
  /** 非项目桶里的历史会话(平铺「最近」) */
  recentTasks: Task[]
  activeProjectId: string
  activeTaskId: string | null
  /** 点 + 后尚未落库的草稿所在项目;null=无草稿 */
  draftProjectId: string | null
  canCreateProject: boolean
  onOpenCreateProject: () => void
  onNewChat: (projectId: string) => void
  onSearch: () => void
  onSelect: (task: Task) => void
  onSelectProject: (projectId: string) => void
  onSettings: () => void
}

function projectLabel(p: Project): string {
  return p.name
}

export function Sidebar({
  connected,
  projects,
  tasksByProject,
  recentTasks,
  activeProjectId,
  activeTaskId,
  draftProjectId,
  canCreateProject,
  onOpenCreateProject,
  onNewChat,
  onSearch,
  onSelect,
  onSelectProject,
  onSettings,
}: SidebarProps) {
  const { width, handleProps } = useResizable({ edge: 'right', min: 220, max: 420, fallback: 300, storageKey: 'lumen:sbWidth' })
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(
    activeProjectId.startsWith('p-') ? [activeProjectId] : [],
  ))

  useEffect(() => {
    const focus = draftProjectId ?? (activeProjectId.startsWith('p-') ? activeProjectId : null)
    if (!focus) return
    setExpanded((prev) => {
      if (prev.has(focus)) return prev
      const next = new Set(prev)
      next.add(focus)
      return next
    })
  }, [activeProjectId, draftProjectId])

  function toggle(id: string): void {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function onProjectRowClick(p: Project): void {
    onSelectProject(p.id)
    if (!expanded.has(p.id)) toggle(p.id)
  }

  function onToggleIcon(e: MouseEvent, id: string): void {
    e.stopPropagation()
    toggle(id)
  }

  function onPlus(e: MouseEvent, projectId: string): void {
    e.preventDefault()
    e.stopPropagation()
    onNewChat(projectId)
  }

  return (
    <aside className="sidebar" style={{ '--sidebar-w': `${width}px` } as React.CSSProperties}>
      <nav className="sb-nav">
        <button type="button" className="sb-navrow" disabled={!connected} onClick={() => onNewChat(activeProjectId)}>
          <span className="sb-navrow-ic"><ChatIcon size={ICON_MD} /></span>{SIDEBAR_PROJECT_COPY.newChat}
        </button>
        <button type="button" className="sb-navrow" disabled={!connected} onClick={onSearch}>
          <span className="sb-navrow-ic"><SearchIcon size={ICON_MD} /></span>{SIDEBAR_PROJECT_COPY.search}
        </button>
        {canCreateProject && (
          <button type="button" className="sb-navrow" disabled={!connected} onClick={onOpenCreateProject}>
            <span className="sb-navrow-ic"><NewProjectIcon size={ICON_MD} /></span>{SIDEBAR_PROJECT_COPY.newProject}
          </button>
        )}
      </nav>

      <div className="sb-section-h">{SIDEBAR_PROJECT_COPY.section}</div>

      <nav className="sb-list" aria-label="项目与会话">
        {!connected ? (
          <div className="sb-empty sb-offline" role="status">
            <div className="sb-offline-title">{SIDEBAR_PROJECT_COPY.offline}</div>
            <div className="sb-offline-hint">{SIDEBAR_PROJECT_COPY.offlineHint}</div>
          </div>
        ) : (
          <>
            {projects.length === 0 && (
              <div className="sb-empty">{SIDEBAR_PROJECT_COPY.emptyProjects}</div>
            )}
            {projects.map((proj) => {
              const open = expanded.has(proj.id)
              const tasks = tasksByProject[proj.id] ?? []
              const hasDraft = draftProjectId === proj.id
              const draftActive = hasDraft && !activeTaskId
              const active = proj.id === activeProjectId
              const label = projectLabel(proj)
              // 空项目且无草稿:不展开空洞、不写「还没有会话」;仅 + 才出现临时行
              const showSess = open && (hasDraft || tasks.length > 0)
              return (
                <div key={proj.id} className={`sb-folder ${active ? 'is-active-proj' : ''}`}>
                  <div className="sb-folder-row">
                    <button
                      type="button"
                      className="sb-folder-ic"
                      aria-expanded={open}
                      aria-label={open ? '折叠' : '展开'}
                      onClick={(e) => onToggleIcon(e, proj.id)}
                    >
                      <span className="sb-folder-ic-folder" aria-hidden><FolderIcon size={ICON_MD} /></span>
                      <span className="sb-folder-ic-chev" aria-hidden><ChevronIcon open={open} /></span>
                    </button>
                    <button
                      type="button"
                      className="sb-folder-main"
                      title={proj.source_path ? `${label}\n${proj.source_path}` : label}
                      onClick={() => onProjectRowClick(proj)}
                    >
                      <span className="sb-folder-name">{label}</span>
                    </button>
                    <button
                      type="button"
                      className="sb-folder-plus"
                      title={SIDEBAR_PROJECT_COPY.newChatInProject}
                      aria-label={SIDEBAR_PROJECT_COPY.newChatInProject}
                      disabled={!connected}
                      onClick={(e) => onPlus(e, proj.id)}
                    >
                      <PlusIcon size={14} />
                    </button>
                  </div>
                  {showSess && (
                    <div className="sb-sess">
                      {hasDraft && (
                        <button
                          type="button"
                          className={`sb-item sb-item-draft ${draftActive ? 'is-active' : ''}`}
                          onClick={() => onNewChat(proj.id)}
                          title={SIDEBAR_PROJECT_COPY.draftChat}
                        >
                          <span className="sb-item-title">{SIDEBAR_PROJECT_COPY.draftChat}</span>
                        </button>
                      )}
                      {tasks.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          className={`sb-item ${task.id === activeTaskId ? 'is-active' : ''}`}
                          onClick={() => onSelect(task)}
                          title={task.goal}
                        >
                          <span className="sb-item-title">{task.goal}</span>
                          {task.status === 'running' && <span className="sb-dot" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            <div className="sb-section-h sb-section-h-recent">{SIDEBAR_PROJECT_COPY.recent}</div>
            {recentTasks.length === 0 ? (
              <div className="sb-empty">{SIDEBAR_PROJECT_COPY.emptyRecent}</div>
            ) : (
              recentTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className={`sb-item sb-item-flat ${task.id === activeTaskId ? 'is-active' : ''}`}
                  onClick={() => onSelect(task)}
                  title={task.goal}
                >
                  <span className="sb-item-title">{task.goal}</span>
                  {task.status === 'running' && <span className="sb-dot" />}
                </button>
              ))
            )}
          </>
        )}
      </nav>

      <div className="sb-foot">
        <button type="button" className="sb-account" onClick={onSettings} title="设置">
          <span className="sb-avatar"><AccountIcon size={18} /></span>
          <span className="sb-account-text">
            <span className="sb-account-name">{SIDEBAR_ACCOUNT_COPY.name}</span>
            <span className="sb-account-hint">{SIDEBAR_ACCOUNT_COPY.hint}</span>
          </span>
          <span className="sb-account-gear"><GearIcon size={16} /></span>
        </button>
      </div>
      <div
        className="sb-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整侧栏宽度(双击复位)"
        title="拖拽调宽 · 双击复位"
        {...handleProps}
      />
    </aside>
  )
}

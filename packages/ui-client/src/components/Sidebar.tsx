/**
 * [INPUT]: Project / Task;icons;SIDEBAR_*_COPY;useResizable;Kumo DropdownMenu;MarqueeTitle
 * [OUTPUT]: Sidebar —— 项目树 + 最近;次要点击复制/归档;标题溢出悬停跑马灯
 * [POS]: 左栏;Trigger 必须 render=<button>(防首子被提升);会话名 hover marquee
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useEffect, useState, type MouseEvent } from 'react'
import { DropdownMenu } from '@cloudflare/kumo/components/dropdown'
import type { Project, Task } from '../agent-client'
import {
  AccountIcon, ArchiveGlyph, ChatIcon, CheckIcon, ChevronIcon, CopyGlyph, FolderIcon, GearIcon,
  NewProjectIcon, PlusIcon, SearchIcon, ICON_MD, ICON_SM,
} from './icons'
import { MarqueeTitle } from './MarqueeTitle'
import { SIDEBAR_ACCOUNT_COPY, SIDEBAR_PROJECT_COPY } from '../appCopy'
import { useResizable } from '../useResizable'

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
}

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
  onArchive: (task: Task) => void
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
  onArchive,
  onSettings,
}: SidebarProps) {
  const { width, handleProps } = useResizable({ edge: 'right', min: 220, max: 420, fallback: 300, storageKey: 'lumen:sbWidth' })
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(
    activeProjectId.startsWith('p-') ? [activeProjectId] : [],
  ))
  const [copiedId, setCopiedId] = useState<string | null>(null)
  /** 次要点击打开的浮层菜单所挂会话;单击主按钮不打开 */
  const [menuTaskId, setMenuTaskId] = useState<string | null>(null)

  async function onCopySessionId(taskId: string): Promise<void> {
    await copyText(taskId)
    setCopiedId(taskId)
    window.setTimeout(() => setCopiedId((cur) => (cur === taskId ? null : cur)), 1400)
  }

  function renderTaskRow(task: Task, flat?: boolean) {
    const copied = copiedId === task.id
    const menuOpen = menuTaskId === task.id
    return (
      <div
        key={task.id}
        className={`sb-item-row${flat ? ' sb-item-flat' : ''}${task.id === activeTaskId ? ' is-active' : ''}${menuOpen ? ' is-menu-open' : ''}`}
        data-task-row={task.id}
      >
        <DropdownMenu
          open={menuOpen}
          onOpenChange={(open) => {
            // 主按钮单击会请求 open——拒绝;只允许 contextmenu(双指点按/右键)打开
            if (!open) setMenuTaskId(null)
          }}
        >
          {/* Kumo Trigger:唯一子节点会被提升为 render——闲置会话无 sb-dot 时必须显式 button,否则槽宽/跑马灯链断裂 */}
          <DropdownMenu.Trigger
            render={<button type="button" className="sb-item" />}
            onClick={(e) => {
              e.preventDefault()
              if (menuTaskId && menuTaskId !== task.id) setMenuTaskId(null)
              onSelect(task)
            }}
            onContextMenu={(e) => {
              // 双指点按 / 右键:挡系统菜单,开我们的复制/归档
              e.preventDefault()
              e.stopPropagation()
              window.getSelection()?.removeAllRanges()
              setMenuTaskId(task.id)
            }}
          >
            <MarqueeTitle text={task.goal} className="sb-item-title" />
            {task.status === 'running' && <span className="sb-dot" />}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="start" side="bottom" sideOffset={4} className="sb-task-menu">
            <DropdownMenu.Item
              icon={copied ? undefined : CopyGlyph}
              onClick={() => { void onCopySessionId(task.id) }}
            >
              {copied ? (
                <span className="sb-task-menu-copied"><CheckIcon size={ICON_SM} /> {SIDEBAR_PROJECT_COPY.copiedSessionId}</span>
              ) : (
                SIDEBAR_PROJECT_COPY.copySessionId
              )}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              icon={ArchiveGlyph}
              variant="danger"
              onClick={() => {
                setMenuTaskId(null)
                onArchive(task)
              }}
            >
              {SIDEBAR_PROJECT_COPY.archiveChat}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu>
      </div>
    )
  }

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
    setMenuTaskId(null)
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
    setMenuTaskId(null)
    onNewChat(projectId)
  }

  return (
    <aside className="sidebar" style={{ '--sidebar-w': `${width}px` } as React.CSSProperties}>
      <nav className="sb-nav">
        <button type="button" className="sb-navrow" disabled={!connected} onClick={() => { setMenuTaskId(null); onNewChat(activeProjectId) }}>
          <span className="sb-navrow-ic"><ChatIcon size={ICON_MD} /></span>{SIDEBAR_PROJECT_COPY.newChat}
        </button>
        <button type="button" className="sb-navrow" disabled={!connected} onClick={() => { setMenuTaskId(null); onSearch() }}>
          <span className="sb-navrow-ic"><SearchIcon size={ICON_MD} /></span>{SIDEBAR_PROJECT_COPY.search}
        </button>
        {canCreateProject && (
          <button type="button" className="sb-navrow" disabled={!connected} onClick={() => { setMenuTaskId(null); onOpenCreateProject() }}>
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
                          onClick={() => { setMenuTaskId(null); onNewChat(proj.id) }}
                          title={SIDEBAR_PROJECT_COPY.draftChat}
                        >
                          <span className="sb-item-title">{SIDEBAR_PROJECT_COPY.draftChat}</span>
                        </button>
                      )}
                      {tasks.map((task) => renderTaskRow(task))}
                    </div>
                  )}
                </div>
              )
            })}

            <div className="sb-section-h sb-section-h-recent">{SIDEBAR_PROJECT_COPY.recent}</div>
            {recentTasks.length === 0 ? (
              <div className="sb-empty">{SIDEBAR_PROJECT_COPY.emptyRecent}</div>
            ) : (
              recentTasks.map((task) => renderTaskRow(task, true))
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

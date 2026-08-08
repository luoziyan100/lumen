/**
 * [INPUT]: Project / Task;icons;SIDEBAR_*_COPY;useResizable;Kumo DropdownMenu;MarqueeTitle;visibleSessions;sessionLamp
 * [OUTPUT]: Sidebar —— 可折「项目」整区 + 全局置顶 + 最近;双指点按置顶/重命名/复制/归档;标题溢出悬停跑马灯
 * [POS]: 左栏;「项目」标题右侧 chevron 收整区(localStorage lumen:sbProjectsOpen);项目行左侧 chevron 仍管单树;
 *        项目树会话 >N 条 Progressive Disclosure(内存展开,active 保底);会话行左侧 status 灯(idle/unread/running);
 *        置顶在项目区下、最近上;Trigger 须 render=<button>;开编延后+忽略菜单 blur
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { DropdownMenu } from '@cloudflare/kumo/components/dropdown'
import type { Project, Task } from '../agent-client'
import { displayTaskTitle } from '../displayTaskTitle'
import {
  AccountIcon, ArchiveGlyph, ChatIcon, CheckIcon, ChevronIcon, CopyGlyph, FolderIcon, GearIcon,
  NewProjectIcon, PinGlyph, PlusIcon, RenameGlyph, SearchIcon, SectionChevronIcon, UnpinGlyph, ICON_MD, ICON_SM,
} from './icons'
import { MarqueeTitle } from './MarqueeTitle'
import { SIDEBAR_ACCOUNT_COPY, SIDEBAR_PROJECT_COPY } from '../appCopy'
import { sessionLampKind } from '../sessionLamp'
import { useResizable } from '../useResizable'
import { visibleSessions } from '../visibleSessions'

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

type RenameTarget =
  | { kind: 'project'; id: string }
  | { kind: 'task'; id: string }

interface SidebarProps {
  connected: boolean
  /** 仅用户显式创建的项目(p-*),不含 default/孤儿桶 */
  projects: Project[]
  /** 全局置顶(跨项目);已从 tasksByProject/recent 剔除 */
  pinnedTasks: Task[]
  tasksByProject: Record<string, Task[]>
  /** 非项目桶里的历史会话(平铺「最近」;不含置顶) */
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
  onRenameTask: (task: Task, title: string) => Promise<void> | void
  onPinTask: (task: Task, pinned: boolean) => Promise<void> | void
  onRenameProject: (project: Project, name: string) => Promise<void> | void
  onArchiveProject: (project: Project) => void
  onSettings: () => void
  /** 未读会话 id(客户端持久化);灯态见 sessionLamp */
  unreadIds: ReadonlySet<string>
  onToggleUnread: (taskId: string) => void
}

function projectLabel(p: Project): string {
  return p.name
}

export function Sidebar({
  connected,
  projects,
  pinnedTasks,
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
  onRenameTask,
  onPinTask,
  onRenameProject,
  onArchiveProject,
  onSettings,
  unreadIds,
  onToggleUnread,
}: SidebarProps) {
  const { width, handleProps } = useResizable({ edge: 'right', min: 220, max: 420, fallback: 300, storageKey: 'lumen:sbWidth' })
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(
    activeProjectId.startsWith('p-') ? [activeProjectId] : [],
  ))
  /** 项目树会话 show-more 展开态(按 projectId;不持久化) */
  const [sessMoreOpen, setSessMoreOpen] = useState<Set<string>>(() => new Set())
  /** 「项目」整区折起;默认开;记 localStorage */
  const [projectsOpen, setProjectsOpen] = useState(() => {
    try {
      return localStorage.getItem('lumen:sbProjectsOpen') !== '0'
    } catch {
      return true
    }
  })
  const [copiedId, setCopiedId] = useState<string | null>(null)
  /** 次要点击打开的浮层菜单所挂会话;单击主按钮不打开 */
  const [menuTaskId, setMenuTaskId] = useState<string | null>(null)
  /** 项目行双指菜单 */
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null)
  /** 行内重命名中的项目或会话 */
  const [renaming, setRenaming] = useState<RenameTarget | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const renameRef = useRef<HTMLInputElement>(null)
  /** 菜单关闭的 pointer 收尾会 blur 刚 mount 的 input——忽略开编后极短窗口内的 blur */
  const renameIgnoreBlurRef = useRef(false)

  useEffect(() => {
    if (!renaming) return
    const el = renameRef.current
    if (!el) return
    renameIgnoreBlurRef.current = true
    el.focus()
    el.select()
    const t = window.setTimeout(() => { renameIgnoreBlurRef.current = false }, 120)
    return () => window.clearTimeout(t)
  }, [renaming])

  async function onCopySessionId(taskId: string): Promise<void> {
    await copyText(taskId)
    setCopiedId(taskId)
    window.setTimeout(() => setCopiedId((cur) => (cur === taskId ? null : cur)), 1400)
  }

  function closeMenus(): void {
    setMenuTaskId(null)
    setMenuProjectId(null)
  }

  /** 等 Dropdown 关掉再进编辑,否则 Item 点击收尾 blur 掉 input → 看起来「点了没反应」 */
  function beginRenameProject(proj: Project): void {
    closeMenus()
    const name = proj.name
    window.setTimeout(() => {
      setRenaming({ kind: 'project', id: proj.id })
      setRenameDraft(name)
    }, 0)
  }

  function beginRenameTask(task: Task): void {
    closeMenus()
    const title = displayTaskTitle(task)
    window.setTimeout(() => {
      setRenaming({ kind: 'task', id: task.id })
      setRenameDraft(title)
    }, 0)
  }

  async function commitRenameProject(proj: Project): Promise<void> {
    if (renameIgnoreBlurRef.current) return
    const next = renameDraft.trim()
    setRenaming(null)
    if (!next || next === proj.name) return
    await onRenameProject(proj, next)
  }

  async function commitRenameTask(task: Task): Promise<void> {
    if (renameIgnoreBlurRef.current) return
    const next = renameDraft.trim()
    setRenaming(null)
    if (!next || next === displayTaskTitle(task)) return
    await onRenameTask(task, next)
  }

  function cancelRename(): void {
    setRenaming(null)
  }

  function onRenameProjectKey(e: KeyboardEvent<HTMLInputElement>, proj: Project): void {
    if (e.key === 'Enter') {
      e.preventDefault()
      void commitRenameProject(proj)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelRename()
    }
  }

  function onRenameTaskKey(e: KeyboardEvent<HTMLInputElement>, task: Task): void {
    if (e.key === 'Enter') {
      e.preventDefault()
      void commitRenameTask(task)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelRename()
    }
  }

  function renderTaskRow(task: Task, flat?: boolean) {
    const copied = copiedId === task.id
    const menuOpen = menuTaskId === task.id
    const pinned = Boolean(task.pinned_at?.trim())
    const renamingThis = renaming?.kind === 'task' && renaming.id === task.id
    const lamp = sessionLampKind({
      status: task.status,
      unread: unreadIds.has(task.id),
    })
    const lampTitle = lamp === 'running'
      ? SIDEBAR_PROJECT_COPY.lampRunning
      : lamp === 'unread'
        ? SIDEBAR_PROJECT_COPY.markRead
        : SIDEBAR_PROJECT_COPY.markUnread
    const lampBtn = (
      <button
        type="button"
        className={`sb-lamp is-${lamp}`}
        title={lampTitle}
        aria-label={lampTitle}
        aria-pressed={lamp === 'unread'}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          closeMenus()
          onToggleUnread(task.id)
        }}
      >
        <span className="sb-lamp-dot" aria-hidden />
      </button>
    )
    if (renamingThis) {
      return (
        <div
          key={task.id}
          className={`sb-item-row${flat ? ' sb-item-flat' : ''}${task.id === activeTaskId ? ' is-active' : ''}`}
          data-task-row={task.id}
        >
          {lampBtn}
          <input
            ref={renameRef}
            className="sb-item-rename"
            value={renameDraft}
            maxLength={40}
            aria-label={SIDEBAR_PROJECT_COPY.renameChat}
            placeholder={SIDEBAR_PROJECT_COPY.renameChatPlaceholder}
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => onRenameTaskKey(e, task)}
            onBlur={() => { void commitRenameTask(task) }}
          />
        </div>
      )
    }
    return (
      <div
        key={task.id}
        className={`sb-item-row${flat ? ' sb-item-flat' : ''}${task.id === activeTaskId ? ' is-active' : ''}${menuOpen ? ' is-menu-open' : ''}`}
        data-task-row={task.id}
      >
        {lampBtn}
        <DropdownMenu
          open={menuOpen}
          onOpenChange={(open) => {
            // 主按钮单击会请求 open——拒绝;只允许 contextmenu(双指点按/右键)打开
            if (!open) setMenuTaskId(null)
          }}
        >
          {/* Kumo Trigger:唯一子节点会被提升为 render——须显式 button,否则槽宽/跑马灯链断裂 */}
          <DropdownMenu.Trigger
            render={<button type="button" className="sb-item" />}
            onClick={(e) => {
              e.preventDefault()
              closeMenus()
              onSelect(task)
            }}
            onContextMenu={(e) => {
              // 双指点按 / 右键:挡系统菜单,开我们的置顶/重命名/复制/归档
              e.preventDefault()
              e.stopPropagation()
              window.getSelection()?.removeAllRanges()
              setMenuProjectId(null)
              setMenuTaskId(task.id)
            }}
          >
            <MarqueeTitle text={displayTaskTitle(task)} className="sb-item-title" forceRoll={menuOpen} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="start" side="bottom" sideOffset={4} className="sb-task-menu glass-card">
            <DropdownMenu.Item
              icon={pinned ? UnpinGlyph : PinGlyph}
              onClick={() => {
                closeMenus()
                void onPinTask(task, !pinned)
              }}
            >
              {pinned ? SIDEBAR_PROJECT_COPY.unpinChat : SIDEBAR_PROJECT_COPY.pinChat}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              icon={RenameGlyph}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => beginRenameTask(task)}
            >
              {SIDEBAR_PROJECT_COPY.renameChat}
            </DropdownMenu.Item>
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
            <DropdownMenu.Separator />
            <DropdownMenu.Item
              icon={ArchiveGlyph}
              variant="danger"
              onClick={() => {
                closeMenus()
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

  function toggleSessMore(projectId: string): void {
    setSessMoreOpen((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }

  function toggleProjectsSection(): void {
    setProjectsOpen((prev) => {
      const next = !prev
      try {
        localStorage.setItem('lumen:sbProjectsOpen', next ? '1' : '0')
      } catch { /* ignore */ }
      return next
    })
  }

  function onProjectRowClick(p: Project): void {
    closeMenus()
    if (renaming) return
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
    closeMenus()
    onNewChat(projectId)
  }

  return (
    <aside className="sidebar" style={{ '--sidebar-w': `${width}px` } as React.CSSProperties}>
      <nav className="sb-nav">
        <button type="button" className="sb-navrow" disabled={!connected} onClick={() => { closeMenus(); onNewChat(activeProjectId) }}>
          <span className="sb-navrow-ic"><ChatIcon size={ICON_MD} /></span>{SIDEBAR_PROJECT_COPY.newChat}
        </button>
        <button type="button" className="sb-navrow" disabled={!connected} onClick={() => { closeMenus(); onSearch() }}>
          <span className="sb-navrow-ic"><SearchIcon size={ICON_MD} /></span>{SIDEBAR_PROJECT_COPY.search}
        </button>
        {canCreateProject && (
          <button type="button" className="sb-navrow" disabled={!connected} onClick={() => { closeMenus(); onOpenCreateProject() }}>
            <span className="sb-navrow-ic"><NewProjectIcon size={ICON_MD} /></span>{SIDEBAR_PROJECT_COPY.newProject}
          </button>
        )}
      </nav>

      <nav className="sb-list" aria-label="项目与会话">
        {!connected ? (
          <div className="sb-empty sb-offline" role="status">
            <div className="sb-offline-title">{SIDEBAR_PROJECT_COPY.offline}</div>
            <div className="sb-offline-hint">{SIDEBAR_PROJECT_COPY.offlineHint}</div>
          </div>
        ) : (
          <>
            <button
              type="button"
              className={`sb-section-h sb-section-toggle${projectsOpen ? ' is-open' : ''}`}
              aria-expanded={projectsOpen}
              aria-controls="sb-projects-body"
              onClick={() => { closeMenus(); toggleProjectsSection() }}
            >
              <span className="sb-section-label">{SIDEBAR_PROJECT_COPY.section}</span>
              <span className="sb-section-chev" aria-hidden>
                <SectionChevronIcon open={projectsOpen} />
              </span>
            </button>
            {projectsOpen && (
              <div id="sb-projects-body" className="sb-projects-body">
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
              const sess = showSess
                ? visibleSessions(tasks, {
                    expanded: sessMoreOpen.has(proj.id),
                    activeId: activeTaskId,
                  })
                : null
              const menuOpen = menuProjectId === proj.id
              const renamingThis = renaming?.kind === 'project' && renaming.id === proj.id
              return (
                <div key={proj.id} className={`sb-folder ${active ? 'is-active-proj' : ''}`}>
                  <div className={`sb-folder-row${menuOpen ? ' is-menu-open' : ''}`}>
                    <button
                      type="button"
                      className="sb-folder-ic"
                      aria-expanded={open}
                      aria-label={open ? '折叠' : '展开'}
                      onClick={(e) => onToggleIcon(e, proj.id)}
                    >
                      <span className="sb-folder-ic-folder" aria-hidden><FolderIcon size={ICON_MD} open={open} /></span>
                      <span className="sb-folder-ic-chev" aria-hidden><ChevronIcon open={open} /></span>
                    </button>
                    {renamingThis ? (
                      <input
                        ref={renameRef}
                        className="sb-folder-rename"
                        value={renameDraft}
                        maxLength={64}
                        aria-label={SIDEBAR_PROJECT_COPY.renameProject}
                        placeholder={SIDEBAR_PROJECT_COPY.renamePlaceholder}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onKeyDown={(e) => onRenameProjectKey(e, proj)}
                        onBlur={() => { void commitRenameProject(proj) }}
                      />
                    ) : (
                      <DropdownMenu
                        open={menuOpen}
                        onOpenChange={(openMenu) => {
                          if (!openMenu) setMenuProjectId(null)
                        }}
                      >
                        <DropdownMenu.Trigger
                          render={<button type="button" className="sb-folder-main" />}
                          title={proj.source_path ? `${label}\n${proj.source_path}` : label}
                          onClick={(e) => {
                            e.preventDefault()
                            onProjectRowClick(proj)
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            window.getSelection()?.removeAllRanges()
                            setMenuTaskId(null)
                            setMenuProjectId(proj.id)
                          }}
                        >
                          <span className="sb-folder-name">{label}</span>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Content align="start" side="bottom" sideOffset={4} className="sb-task-menu glass-card">
                          <DropdownMenu.Item
                            icon={RenameGlyph}
                            onPointerDown={(e) => e.preventDefault()}
                            onClick={() => beginRenameProject(proj)}
                          >
                            {SIDEBAR_PROJECT_COPY.renameProject}
                          </DropdownMenu.Item>
                          <DropdownMenu.Item
                            icon={ArchiveGlyph}
                            variant="danger"
                            onClick={() => {
                              closeMenus()
                              onArchiveProject(proj)
                            }}
                          >
                            {SIDEBAR_PROJECT_COPY.archiveProject}
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu>
                    )}
                    <button
                      type="button"
                      className="sb-folder-plus"
                      title={SIDEBAR_PROJECT_COPY.newChatInProject}
                      aria-label={SIDEBAR_PROJECT_COPY.newChatInProject}
                      disabled={!connected || renamingThis}
                      onClick={(e) => onPlus(e, proj.id)}
                    >
                      <PlusIcon size={14} />
                    </button>
                  </div>
                  {showSess && sess && (
                    <div className="sb-sess">
                      {hasDraft && (
                        <button
                          type="button"
                          className={`sb-item sb-item-draft ${draftActive ? 'is-active' : ''}`}
                          onClick={() => { closeMenus(); onNewChat(proj.id) }}
                          title={SIDEBAR_PROJECT_COPY.draftChat}
                        >
                          <span className="sb-item-title">{SIDEBAR_PROJECT_COPY.draftChat}</span>
                        </button>
                      )}
                      {sess.visible.map((task) => renderTaskRow(task))}
                      {sess.canToggle && (
                        <button
                          type="button"
                          className="sb-sess-more"
                          aria-expanded={!sess.capped}
                          onClick={() => toggleSessMore(proj.id)}
                        >
                          {sess.capped
                            ? SIDEBAR_PROJECT_COPY.showMoreSessions
                            : SIDEBAR_PROJECT_COPY.showLessSessions}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
                })}
              </div>
            )}

            {pinnedTasks.length > 0 && (
              <>
                <div className="sb-section-h">{SIDEBAR_PROJECT_COPY.pinned}</div>
                {pinnedTasks.map((task) => renderTaskRow(task, true))}
              </>
            )}

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

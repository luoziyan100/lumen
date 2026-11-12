/**
 * [INPUT]: 连接发现、新目录/会话 API、Conversation/Files、独立工作区投影与会话诊断
 * [OUTPUT]: WorkspaceApp：研究工作台与本地新对话草稿；首次提交后才选择真实会话
 * [POS]: 新应用前端组合根，恢复选择时校验当前数据根与可见目录；新建入口共用 Welcome，不预建空会话；文档居中实验：阅读器占中、对话靠右可拖宽/收起(CSS 隐藏不卸载)
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { flushSync } from 'react-dom'
import { Button } from '@cloudflare/kumo/components/button'
import { Dialog } from '@cloudflare/kumo/components/dialog'
import { ChatIcon, PanelIcon, RailIcon } from '../../components/icons'
import { CreateProjectModal } from './chrome/project/CreateProjectModal'
import { Sidebar } from './chrome/Sidebar'
import { SearchModal } from './chrome/SearchModal'
import { SessionsIndex } from './chrome/SessionsIndex'
import { loadCatalog } from './chrome/catalog'
import { useResizable } from './chrome/useResizable'
import { useAppearance } from '../../appearance'
import { Input } from '@cloudflare/kumo/components/input'
import { ExternalLinkGate } from '../../components/ExternalLinkDialog'
import { MASTRA_COPY as C } from '../../copy/mastraCopy'
import { LumenApi, type Connection, type Identity, type Project, type SessionInfo } from '../data/client.ts'
import { Conversation } from './Conversation'
import { Welcome } from './conversation/welcome/Welcome'
import { Files, useWorkspace } from './Files'
import { writableDocument, type FileTarget } from '../data/file-links'
import { Settings } from './Settings'
import { Diagnostics } from '../diagnostics/Diagnostics'
import { Agents } from '../agents/Agents'
import './workbench.css'

function savedDocumentCenter(): boolean {
  try { return localStorage.getItem('lumen:layout') === 'document' } catch { return false }
}

function lastSelection(): Identity | null {
  try {
    const saved = JSON.parse(localStorage.getItem('lumen.mastra.selection') ?? 'null')
    return saved && typeof saved.projectId === 'string' && typeof saved.taskId === 'string' ? saved : null
  } catch { return null }
}

export function WorkspaceApp({ connection }: { connection: Connection }) {
  const api = useMemo(() => new LumenApi(connection), [connection.baseUrl, connection.token])
  const [projects, setProjects] = useState<Project[]>([]), [projectId, setProjectId] = useState(() => lastSelection()?.projectId ?? 'default')
  const [sessions, setSessions] = useState<SessionInfo[]>([]), [identity, setIdentity] = useState<Identity | null>(lastSelection)
  const [selectionReady, setSelectionReady] = useState(false)
  const [error, setError] = useState(''), [createProjectOpen, setCreateProjectOpen] = useState(false), [renaming, setRenaming] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true), [filesOpen, setFilesOpen] = useState(false)
  const appearance = useAppearance()
  const [diagnosticsTarget, setDiagnosticsTarget] = useState<Identity | null>(null)
  const [agentsOpen, setAgentsOpen] = useState(false)
  const [fileTarget, setFileTarget] = useState<(Identity & FileTarget) | null>(null)
  const [activeDocument, setActiveDocument] = useState<(Identity & FileTarget) | null>(null)
  const [archivedProjects, setArchivedProjects] = useState(false), [archivedSessions, setArchivedSessions] = useState(false)
  const [projectName, setProjectName] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [renameProjectTarget, setRenameProjectTarget] = useState<string | null>(null), [renameSessionTarget, setRenameSessionTarget] = useState<Identity | null>(null)
  const [index, setIndex] = useState<{ projectId: string | null } | null>(null)
  const [readerOpen, setReaderOpen] = useState(false), [documentCenter, setDocumentCenter] = useState(savedDocumentCenter), [chatHidden, setChatHidden] = useState(false)
  const chatSide = useResizable({ edge: 'left', min: 320, max: 640, fallback: 420, storageKey: 'lumen:chatSideWidth' })
  const workspace = useWorkspace(api, selectionReady && !index ? identity : null, revision)
  const activePath = activeDocument?.projectId === identity?.projectId && activeDocument?.taskId === identity?.taskId ? writableDocument(activeDocument) : null
  useEffect(() => { setFilesOpen(false); setFileTarget(null); setActiveDocument(null) }, [api, identity?.projectId, identity?.taskId, !!index])
  useEffect(() => { if (workspace.assets.length) setFilesOpen(true) }, [workspace.revealVersion])
  const selection = useRef(projectId); selection.current = projectId
  const selectedIdentity = useRef(identity); selectedIdentity.current = identity
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(value => !value) } }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [])
  const activity = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => { setSelectionReady(false); setError('') }, [api])
  useEffect(() => { try { localStorage.setItem('lumen.mastra.selection', JSON.stringify(identity)) } catch { /* 无存储权限时仍可研究。 */ } setRenaming(null) }, [identity])
  useEffect(() => {
    let active = true, loading = false
    const refresh = async () => {
      if (loading) return
      loading = true
      const priorSelection = selectedIdentity.current
      try {
        const result = await loadCatalog(api, archivedProjects, archivedSessions, () => active)
        if (!active) return
        setProjects(result.projects); setSessions(result.sessions); setError('')
        const current = selectedIdentity.current
        if (current && current === priorSelection && !result.sessions.some(session => session.projectId === current.projectId && session.taskId === current.taskId)) setIdentity(null)
        if (!result.projects.some(project => project.id === selection.current)) { setProjectId(result.projects[0]?.id ?? 'default'); setIdentity(null) }
        setSelectionReady(true)
      } catch (error) { if (active) setError(String(error)) } finally { loading = false }
    }
    void refresh(); const timer = window.setInterval(() => void refresh(), 15000)
    window.addEventListener('focus', refresh)
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [api, revision, archivedProjects, archivedSessions])
  const selectSession = (item: SessionInfo) => { setProjectId(item.projectId); setIdentity({ projectId: item.projectId, taskId: item.taskId }); setIndex(null); setSearchOpen(false) }
  function newConversation(destination: string) {
    setProjectId(destination); setIdentity(null); setIndex(null)
    setSearchOpen(false); setArchivedSessions(false); setError('')
  }
  const project = projects.find(item => item.id === projectId)
  function mutateProject(updates: { name?: string; archived?: boolean }, target = projectId) {
    void api.updateProject(target, updates).then(() => { setProjectName(null); activity(); if (updates.archived !== undefined) setIdentity(current => current?.projectId === target ? null : current) }).catch(error => setError(String(error)))
  }
  function mutate(updates: Partial<Pick<SessionInfo, 'title' | 'pinned' | 'archived'>>, target = identity) {
    if (!target) return
    void api.updateSession(target, updates).then(() => { activity(); if (updates.archived) setIdentity(current => current?.taskId === target.taskId && current?.projectId === target.projectId ? null : current) }).catch(error => setError(String(error)))
  }
  const renameProject = (item: Project) => { setRenameProjectTarget(item.id); setProjectName(item.name) }
  const renameSession = (item: SessionInfo) => { setRenameSessionTarget(item); setRenaming(item.title) }
  const toggleUnread = (item: SessionInfo) => {
    const unread = !item.unread
    if (unread && identity?.projectId === item.projectId && identity.taskId === item.taskId) flushSync(() => setIndex({ projectId: item.projectId }))
    void api.setSessionUnread(item, unread).then(activity).catch(error => setError(String(error)))
  }
  const copySession = (item: SessionInfo) => { void navigator.clipboard.writeText(item.taskId).catch(error => setError(String(error))) }
  const openFile = (target: FileTarget) => { if (identity) { setFileTarget({ ...identity, ...target }); setFilesOpen(true) } }
  const closeFiles = () => { setFilesOpen(false); setFileTarget(null) }
  const reading = documentCenter && readerOpen && filesOpen && !!identity && !index
  const toggleDocumentCenter = () => {
    const next = !documentCenter
    setDocumentCenter(next); setChatHidden(false)
    try { localStorage.setItem('lumen:layout', next ? 'document' : 'chat') } catch { /* 无存储权限仍可切换。 */ }
  }
  const openDocument = (target: FileTarget) => { if (identity && writableDocument(target)) setActiveDocument({ ...identity, ...target }) }
  if (!selectionReady) return <main className="mw-empty" role="status">{error ? <><p role="alert">{error}</p><Button onClick={activity}>{C.retry}</Button></> : '正在恢复研究工作台…'}</main>
  return <ExternalLinkGate><main className="app mw-app">
    <header className="titlebar"><div className="tb-left"><span className="brand">{C.brand}</span><button className="icon-btn nav-icon-btn" aria-label={sidebarOpen ? '收起侧栏' : '展开侧栏'} onClick={() => setSidebarOpen(value => !value)}><PanelIcon /></button></div>
      <nav className="titlebar-actions">{reading && <button className="icon-btn nav-icon-btn" aria-label={chatHidden ? '展开对话' : '收起对话'} aria-expanded={!chatHidden} onClick={() => setChatHidden(value => !value)}><ChatIcon /></button>}<button className="icon-btn nav-icon-btn" aria-label={filesOpen ? '收起工作区' : '展开工作区'} disabled={!identity || !!index} aria-expanded={filesOpen} onClick={() => filesOpen ? closeFiles() : setFilesOpen(true)}><RailIcon /></button></nav>
    </header>
    <div className={`body mw-body${reading ? ' mw-reading' : ''}${reading && chatHidden ? ' mw-reading-solo' : ''}`} style={reading ? { '--chat-side-w': `${chatSide.width}px` } as CSSProperties : undefined}>
      {sidebarOpen && <Sidebar projects={projects} sessions={sessions} projectId={projectId} identity={identity}
        onIndex={id => setIndex({ projectId: id })} onSearch={() => setSearchOpen(true)}
        archivedProjects={archivedProjects} archivedSessions={archivedSessions}
        toggleProjects={() => { setArchivedProjects(value => !value); setIdentity(null); setProjects([]) }}
        toggleSessions={() => { setArchivedSessions(value => !value); setIdentity(null) }}
        onProject={item => { setProjectId(item.id); setIdentity(null); setIndex(null) }}
        onSession={selectSession} onNew={newConversation}
        onCreateProject={() => setCreateProjectOpen(true)} onRenameProject={renameProject} onDiagnostics={setDiagnosticsTarget}
        onArchiveProject={item => mutateProject({ archived: !item.archived }, item.id)} onRenameSession={renameSession} onUpdateSession={(item, updates) => mutate(updates, item)} onCopySession={copySession} onToggleUnread={toggleUnread} onSettings={() => setSettingsOpen(true)} onAgents={() => setAgentsOpen(true)} />}
      <section className={`chat mw-center${filesOpen ? ' chat-with-reader' : ''}${index ? ' chat-sessions' : !identity ? ' chat-empty' : ''}`}>
        {reading && <div className="reader-resize" role="separator" aria-orientation="vertical" aria-label="调整对话宽度（双击复位）" {...chatSide.handleProps} />}
        {error && <div className="mw-error" role="alert">{error}</div>}
        {index ? <SessionsIndex key={index.projectId ?? "all"} projects={projects} sessions={sessions} initialProject={index.projectId} onSession={selectSession} /> : identity ? <Conversation key={`${identity.projectId}:${identity.taskId}`} api={api} identity={identity} onActivity={activity} onOpenFile={openFile} onSettings={() => setSettingsOpen(true)} activePath={activePath} onClearActivePath={() => setActiveDocument(null)} />
          : project && !project.archived ? <Welcome key={`${api.connection.baseUrl}:${projectId}`} api={api} projectId={projectId} onSettings={() => setSettingsOpen(true)} onSession={next => { setIdentity(next); setIndex(null); activity() }} /> : null}
      </section>
      {identity && !index && filesOpen && <Files key={`${identity.projectId}:${identity.taskId}`} api={api} identity={identity} revision={revision} workspace={workspace} target={fileTarget?.projectId === identity.projectId && fileTarget.taskId === identity.taskId ? fileTarget : null} onOpenDocument={openDocument} onClose={closeFiles} onActivity={activity} centered={documentCenter} onCenter={toggleDocumentCenter} onReading={setReaderOpen} />}
    </div>
    {createProjectOpen && <CreateProjectModal api={api} onClose={() => { setCreateProjectOpen(false); activity() }} onCreated={project => { setProjectId(project.id); setIdentity(null); setIndex(null) }} />}
    {(projectName !== null || renaming !== null) && <Dialog.Root open onOpenChange={open => { if (!open) { setProjectName(null); setRenaming(null) } }}><Dialog className="mw-dialog mw-rename-dialog" aria-label="重命名"><h2>重命名</h2><form onSubmit={event => {
      event.preventDefault()
      if (projectName !== null && projectName.trim()) mutateProject({ name: projectName.trim() }, renameProjectTarget ?? projectId)
      else if (renaming?.trim()) { mutate({ title: renaming.trim() }, renameSessionTarget); setRenaming(null) }
    }}><Input autoFocus aria-label="名称" value={projectName ?? renaming ?? ''} onChange={event => { if (projectName !== null) setProjectName(event.target.value); else setRenaming(event.target.value) }} /><footer><Button variant="ghost" type="button" onClick={() => { setProjectName(null); setRenaming(null) }}>取消</Button><Button type="submit" disabled={!(projectName ?? renaming)?.trim()}>保存</Button></footer></form></Dialog></Dialog.Root>}
    {searchOpen && <SearchModal open onOpenChange={setSearchOpen} conversations={sessions} onSelect={selectSession} />}
    {settingsOpen && <Settings api={api} appearance={appearance} onClose={() => setSettingsOpen(false)} />}
    {diagnosticsTarget && <Diagnostics key={`${diagnosticsTarget.projectId}:${diagnosticsTarget.taskId}:${api.connection.baseUrl}`} api={api} identity={diagnosticsTarget} onClose={() => setDiagnosticsTarget(null)} />}
    {agentsOpen && <Agents key={projectId} api={api} projectId={projectId} onClose={() => setAgentsOpen(false)} />}
  </main></ExternalLinkGate>
}

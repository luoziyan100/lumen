/**
 * [INPUT]: AgentClient;useAgent;useWorkspace;Sidebar;ChatTranscript;TurnPreviewRail;UtilityRail;AskUserDialog;ComposerCard
 * [OUTPUT]: App —— 形态 A 布局容器;项目树(p-*) + 最近平铺历史;轮次轨;composer 暗玻璃
 * [POS]: ui-client 根装配;对话列下沉 ChatTranscript;连接下沉 useServiceConnection;
 *        storage project_id ≠ 用户项目;历史不分类进「默认」;
 *        对话列 useStickToBottom:流式贴底;上滑松手可自由阅读;钉态不重绘消息列;松钉后「回到最新」挂 composer-dock 上沿;
 *        标题栏工作区钮:阅读器开时一并关闭(drawer 与 ws.open 双态,不能只拨 drawer);
 *        侧栏未读灯:task_updated 终态且非当前 → unread(localStorage);打开会话清除;
 *        上传=对话事件见 doc/upload-awareness.md;当前稿 activePath 见 artifact-loop P0;
 *        messages 容器 key=taskId|draft 强制 remount,配合 useAgent viewEpoch 防串台;
 *        助手终稿:模型正文 Sources 原样渲染;SourceList 仅漏写兜底
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Toasty, useKumoToastManager } from '@cloudflare/kumo/components/toast'
import { Tooltip, TooltipProvider } from '@cloudflare/kumo/components/tooltip'
import { AgentClient, type Asset, type Project, type SkillInfo, type SkillInstallScope, type Task } from './agent-client'
import { pathFromToolArgs, sanitizeActivePathClient } from './activePath.ts'
import { sortTasksForSidebar } from './sessions/sortTasks'
import { tasksOutsideUserProjects, userProjects } from './sessions/sidebarBuckets'
import { shouldMarkUnreadOnStatus } from './sessions/sessionLamp'
import { useUnreadSessions } from './app/useUnreadSessions'
import { useThinkClock } from './app/useThinkClock'
import { useAgent } from './useAgent'
import { useStickToBottom } from './scroll/useStickToBottom'
import { useWorkspace } from './useWorkspace'
import { Sidebar } from './components/Sidebar'
import { CreateProjectModal, type CreateProjectPayload } from './components/CreateProjectModal'
import { AskUserDialog } from './components/AskUserDialog'
import { ComposerCard, type ComposerModelOption } from './components/ComposerCard'
import { ManageSkillsDialog } from './components/ManageSkillsDialog'
import { useComposerDraft } from './app/useComposerDraft'
import { SearchModal } from './components/SearchModal'
import { SettingsModal } from './components/SettingsModal'
import { useAppearance } from './appearance'
import { ExternalLinkGate } from './components/ExternalLinkDialog'
import { PanelIcon, RailIcon } from './components/icons'
import { UtilityRail } from './components/UtilityRail'
import { ReaderPane } from './components/ReaderPane'
import { ScrollDebugHud } from './components/ScrollDebugHud'
import { TurnPreviewRail } from './components/TurnPreviewRail'
import { buildTurnRailItems, msgAnchorId } from './components/turnRail'
import {
  APP_BRAND_COPY, APP_NAV_ICON_BUTTON, APP_TITLEBAR_WORKSPACE_TOGGLE,
} from './copy/appCopy'
import { IS_DEMO, SERVICE_TOKEN, SERVICE_URL, initialProjectId } from './app/boot'
import { isEmptyChat } from './app/isEmptyChat'
import { JumpToLatestButton } from './app/JumpToLatestButton'
import { useServiceConnection } from './app/useServiceConnection'
import { ChatTranscript } from './app/ChatTranscript'

export function App() {
  return (
    <Toasty>
      <TooltipProvider>
        <ExternalLinkGate>
          <AppInner />
        </ExternalLinkGate>
      </TooltipProvider>
    </Toasty>
  )
}

function AppInner() {
  const toast = useKumoToastManager()
  const { state: appearance, setAppearance } = useAppearance()
  const client = useMemo(() => new AgentClient(SERVICE_URL, SERVICE_TOKEN), [])
  const { connected, protocolMismatch } = useServiceConnection(client)

  const [projectId, setProjectId] = useState(initialProjectId)
  const [projects, setProjects] = useState<Project[]>([])
  const [tasksByProject, setTasksByProject] = useState<Record<string, Task[]>>({})
  /** 项目行 + 后的临时「新建对话」;发言落库后清掉,未发言离开也清掉 */
  const [draftProjectId, setDraftProjectId] = useState<string | null>(null)
  const { unreadIds, markUnread, clearUnread, toggleUnread } = useUnreadSessions()
  const taskIdForUnreadRef = useRef<string | null>(null)

  // 侧栏短标题/置顶/status 异步写回;非当前会话 running→终态 → 未读灯
  useEffect(() => {
    return client.onTaskUpdated((task) => {
      let prevStatus: string | undefined
      setTasksByProject((prev) => {
        const pid = task.project_id
        const list = prev[pid]
        if (!list) {
          return { ...prev, [pid]: [task] }
        }
        const i = list.findIndex((t) => t.id === task.id)
        prevStatus = i >= 0 ? list[i]!.status : undefined
        const next = list.slice()
        if (i < 0) next.unshift(task)
        else next[i] = { ...list[i]!, ...task }
        return { ...prev, [pid]: sortTasksForSidebar(next) }
      })
      if (shouldMarkUnreadOnStatus({
        prevStatus,
        status: task.status,
        taskId: task.id,
        activeTaskId: taskIdForUnreadRef.current,
      })) {
        markUnread(task.id)
      }
    })
  }, [client])

  function persistProjectId(id: string): void {
    setProjectId(id)
    if (!IS_DEMO) localStorage.setItem('lumen:projectId', id)
  }

  const {
    items, evidenceItems, running, pendingAsk, modelRetry, send, stop, answerAsk,
    newConversation, selectConversation, taskId, ctxUsage,
  } = useAgent(client, projectId, connected)
  taskIdForUnreadRef.current = taskId
  const thinkStartedAt = useThinkClock(running, taskId)
  const [askBusy, setAskBusy] = useState(false)
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [skillsManageOpen, setSkillsManageOpen] = useState(false)
  const [skillsBusy, setSkillsBusy] = useState(false)
  const ws = useWorkspace(client, projectId, taskId, connected)
  /** 当前稿:(projectId,taskId) 作用域;切会话/项目清;可写文本才绑 */
  const [activePath, setActivePath] = useState<string | null>(null)
  const openPathRef = useRef<string | null>(null)
  useEffect(() => { openPathRef.current = ws.open?.path ?? null }, [ws.open?.path])
  useEffect(() => { setActivePath(null) }, [projectId, taskId])

  const openAssetBound = useCallback(async (a: Asset): Promise<void> => {
    await ws.openAsset(a)
    const bind = sanitizeActivePathClient(a.path)
    if (bind) setActivePath(bind)
  }, [ws])

  // write/edit 命中打开中的文件 → 重载阅读器
  useEffect(() => {
    return client.onEvent((e) => {
      if (e.kind !== 'tool_result') return
      if (taskId && e.task_id !== taskId) return
      let payload: Record<string, unknown> = {}
      try { payload = JSON.parse(e.payload_json) as Record<string, unknown> } catch { return }
      const name = String(payload.name ?? '')
      if (name !== 'write_file' && name !== 'edit_file') return
      let path = typeof payload.path === 'string' ? payload.path.trim() : ''
      if (!path) path = pathFromToolArgs(payload.args) ?? ''
      // 旧事件:从 llmContent 兜底
      if (!path && typeof payload.llmContent === 'string') {
        const m = payload.llmContent.match(/已(?:写入|编辑)\s+(\S+)/)
        if (m?.[1]) path = m[1]
      }
      if (path && openPathRef.current === path) void ws.reloadOpen()
    })
  }, [client, taskId, ws.reloadOpen])
  // 工作目录:默认收起;当前会话有产物(上传文件/模型写出报告)才自动展开——纯问答保持收起(owner 定 2026-07-10)
  const [drawer, setDrawer] = useState(false)
  // 侧栏收起/展开(记住选择)
  const [sbOpen, setSbOpen] = useState(() => localStorage.getItem('lumen:sbOpen') !== '0')
  function toggleSidebar(next: boolean): void {
    setSbOpen(next)
    localStorage.setItem('lumen:sbOpen', next ? '1' : '0')
  }
  function toggleRail(next: boolean): void {
    setDrawer(next) // 手动开合(标题栏钮/上传即时反馈);默认收起与自动展开由产物驱动
  }
  const pinMessagesRef = useRef<() => void>(() => {})
  const composer = useComposerDraft({
    client,
    projectId,
    taskId,
    running,
    pendingAsk: !!pendingAsk,
    activePath,
    send,
    selectConversation,
    setDraftProjectId,
    refreshWorkspace: (id) => ws.refresh(id),
    openRail: () => toggleRail(true),
    pinMessages: () => pinMessagesRef.current(),
    toastError: (title, description) => toast.add({ variant: 'error', title, description }),
  })
  const {
    input, setInput, taRef, fileRef,
    attachments, setAttachments,
    pendingFiles, setPendingFiles,
    uploading,
    onPaste, onSubmit, onComposerKey, activateSkill, onPickFiles, onAddFiles,
  } = composer
  // 产物驱动:当前会话有产物→展开工作目录,纯问答(无产物)→收起;手动开合保持到下次产物变化/切会话
  useEffect(() => { setDrawer(ws.assets.length > 0) }, [ws.assets.length, taskId])

  const refreshSkills = useCallback(async (): Promise<void> => {
    if (!connected) return
    try {
      setSkills(await client.listSkills(projectId))
    } catch {
      /* 列表失败不挡对话 */
    }
  }, [client, connected, projectId])

  useEffect(() => { void refreshSkills() }, [refreshSkills])

  // 会话搜索弹窗(侧栏🔍 / ⌘K)+ 设置弹窗 + 新建项目弹框
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  function pickConversation(task: Task): void {
    clearUnread(task.id)
    setDraftProjectId(null) // 点进已有会话 = 取消未发言草稿
    persistProjectId(task.project_id)
    selectConversation(task.id, task.status === 'running', task.project_id)
    ws.close()
    setSearchOpen(false)
  }

  /** 软归档:列表消失;若正看着该会话则清到空态 */
  async function archiveConversation(task: Task): Promise<void> {
    try {
      await client.archiveTask(task.id, task.project_id)
      clearUnread(task.id)
      setTasksByProject((prev) => {
        const next: Record<string, Task[]> = {}
        for (const [pid, list] of Object.entries(prev)) {
          next[pid] = list.filter((t) => t.id !== task.id)
        }
        return next
      })
      if (taskId === task.id) {
        setDraftProjectId(null)
        newConversation(task.project_id)
        ws.close()
      }
    } catch (err) {
      toast.add({
        variant: 'error',
        title: '归档失败',
        description: err instanceof Error ? err.message : '请重试',
      })
    }
  }

  async function renameProject(proj: Project, name: string): Promise<void> {
    try {
      const updated = await client.renameProject(proj.id, name)
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
    } catch (err) {
      toast.add({
        variant: 'error',
        title: '重命名失败',
        description: err instanceof Error ? err.message : '请重试',
      })
    }
  }

  /** 人手改侧栏短标题(写 title,不动 goal);成功另有 task_updated 回灌 */
  async function renameConversation(task: Task, title: string): Promise<void> {
    try {
      await client.renameTask(task.id, title, task.project_id)
    } catch (err) {
      toast.add({
        variant: 'error',
        title: '重命名失败',
        description: err instanceof Error ? err.message : '请重试',
      })
    }
  }

  async function setConversationPinned(task: Task, pinned: boolean): Promise<void> {
    try {
      if (pinned) await client.pinTask(task.id, task.project_id)
      else await client.unpinTask(task.id, task.project_id)
    } catch (err) {
      toast.add({
        variant: 'error',
        title: pinned ? '置顶失败' : '取消置顶失败',
        description: err instanceof Error ? err.message : '请重试',
      })
    }
  }

  /** 软归档项目:侧栏消失;若正看着该项目则切到空态 */
  async function archiveProject(proj: Project): Promise<void> {
    try {
      await client.archiveProject(proj.id)
      setProjects((prev) => prev.filter((p) => p.id !== proj.id))
      setTasksByProject((prev) => {
        const next = { ...prev }
        delete next[proj.id]
        return next
      })
      if (draftProjectId === proj.id) setDraftProjectId(null)
      if (projectId === proj.id) {
        const fallback = 'default'
        persistProjectId(fallback)
        newConversation(fallback)
        ws.close()
      }
    } catch (err) {
      toast.add({
        variant: 'error',
        title: '归档项目失败',
        description: err instanceof Error ? err.message : '请重试',
      })
    }
  }

  /** 新对话:p-* 下出现临时「新建对话」行;default 桶不造项目草稿 */
  function startNewChat(pid: string = projectId): void {
    const target = pid.startsWith('p-') || pid === 'default' ? pid : 'default'
    persistProjectId(target)
    newConversation(target)
    setDraftProjectId(target.startsWith('p-') ? target : null)
    ws.close()
    requestAnimationFrame(() => taRef.current?.focus({ preventScroll: true }))
  }

  function selectProject(pid: string): void {
    // 点项目名≠点 +:不造草稿;若离开草稿项目且未发言,草稿取消
    if (draftProjectId && draftProjectId !== pid) {
      setDraftProjectId(null)
      if (!taskId) {
        persistProjectId(pid)
        newConversation(pid)
        ws.close()
        return
      }
    }
    if (pid === projectId) return
    persistProjectId(pid)
    // 切项目时若不在草稿空态,只换高亮;会话内容等用户点具体对话
    if (!taskId) {
      newConversation(pid)
      ws.close()
    }
  }

  async function handleCreateProject(payload: CreateProjectPayload): Promise<void> {
    try {
      const p = await client.createProject(payload.name, payload.sourcePath)
      setProjects((prev) => [...prev, p])
      setTasksByProject((prev) => ({ ...prev, [p.id]: [] }))
      persistProjectId(p.id)
      newConversation(p.id)
      setDraftProjectId(p.id) // 新建项目后等同点了一次 +,露出临时「新建对话」
      ws.close()
      toast.add({
        variant: 'success',
        title: '项目已创建',
        description: payload.sourcePath
          ? `「${p.name}」已绑定本地文件夹；可在项目下新建对话。`
          : `「${p.name}」已创建；可在项目行右侧 + 新建对话。`,
      })
      requestAnimationFrame(() => taRef.current?.focus({ preventScroll: true }))
    } catch (err) {
      toast.add({
        variant: 'error',
        title: '创建项目失败',
        description: err instanceof Error ? err.message : '请重试',
      })
      throw err
    }
  }

  async function uploadShared(files: File[]): Promise<void> {
    try {
      for (const file of files) await client.uploadFile(projectId, file, undefined, 'shared')
      ws.refresh(taskId)
      toggleRail(true)
    } catch (err) {
      toast.add({
        variant: 'error',
        title: '共享区上传失败',
        description: err instanceof Error ? err.message : '请重试',
      })
    }
  }

  // 项目名册 + 各项目会话(树需要全量);demo 用本地 visitor 合成单项目
  // 旧 service / 协议失败时回退到 default,避免历史会话整栏消失
  useEffect(() => {
    if (!connected) return
    let live = true
    const load = async (): Promise<void> => {
      const fallbackDefault = (): Project => ({
        id: 'default', name: '默认', source_path: null, created_at: '', updated_at: '',
      })
      if (IS_DEMO) {
        const pid = projectId
        const tasks = await client.list(pid).catch(() => [] as Task[])
        if (!live) return
        setProjects([{ id: pid, name: '我的空间', source_path: null, created_at: '', updated_at: '' }])
        setTasksByProject({ [pid]: sortTasksForSidebar(tasks) })
        return
      }
      let list: Project[]
      try {
        list = await client.listProjects()
      } catch {
        list = [fallbackDefault()]
      }
      if (!live) return
      if (list.length === 0) list = [fallbackDefault()]
      // 确保当前 projectId 在树上(旧 localStorage / 孤儿任务)
      if (!list.some((p) => p.id === projectId)) {
        list = [...list, {
          id: projectId,
          name: projectId === 'default' ? '默认' : projectId,
          source_path: null,
          created_at: '',
          updated_at: '',
        }]
      }
      setProjects(list)
      // list 共用 pendingTasks 槽,必须串行,不能 Promise.all
      const map: Record<string, Task[]> = {}
      for (const p of list) {
        map[p.id] = sortTasksForSidebar(await client.list(p.id).catch(() => []))
        if (!live) return
      }
      setTasksByProject(map)
    }
    void load()
    return () => { live = false }
  }, [client, connected, taskId, running, projectId])

  /**
   * 第一性原理:storage 的 project_id ≠ 用户「项目」。
   * - 项目树:仅用户显式 create 的 p-*
   * - 最近:default/live/等历史桶平铺——绝不塞进「默认」文件夹
   */
  const sidebarProjects = useMemo(
    () => userProjects(projects),
    [projects],
  )
  /** 全局置顶区:跨项目抽一层;项目树/最近不再重复列出 */
  const pinnedTasks = useMemo(
    () => sortTasksForSidebar(
      Object.values(tasksByProject).flat().filter((t) => Boolean(t.pinned_at?.trim())),
    ),
    [tasksByProject],
  )
  const tasksByProjectUnpinned = useMemo(() => {
    const next: Record<string, Task[]> = {}
    for (const [pid, list] of Object.entries(tasksByProject)) {
      next[pid] = list.filter((t) => !t.pinned_at?.trim())
    }
    return next
  }, [tasksByProject])
  const recentTasks = useMemo(
    () => sortTasksForSidebar(tasksOutsideUserProjects(tasksByProjectUnpinned)),
    [tasksByProjectUnpinned],
  )
  /** 搜索跨项目(仍按会话点选) */
  const convs = useMemo(
    () => Object.values(tasksByProject).flat(),
    [tasksByProject],
  )

  // 当前选用模型:composer 芯片下拉决定;设置页只登记接入列表。
  // getSettings 走共享 pendingSettings,不能与设置弹窗并发。
  const [modelLabel, setModelLabel] = useState('')
  const [modelOptions, setModelOptions] = useState<ComposerModelOption[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [selectedModelId, setSelectedModelId] = useState('')
  const refreshModel = useCallback(() => {
    client.getSettings().then((s) => {
      const opts: ComposerModelOption[] = []
      for (const p of s.profiles) {
        const ids = (p.models?.length ? p.models : (p.model ? [p.model] : []))
          .map((m) => m.trim()).filter(Boolean)
        for (const modelId of ids) {
          opts.push({ profileId: p.id, modelId, profileName: p.name })
        }
      }
      setModelOptions(opts)
      const active = s.profiles.find((p) => p.id === s.activeProfileId)
      const mid = active ? (active.activeModel || active.model || '') : ''
      setSelectedProfileId(active?.id ?? null)
      setSelectedModelId(mid)
      setModelLabel(active ? (mid || active.name) : '')
    }).catch(() => {})
  }, [client])
  useEffect(() => { if (connected) refreshModel() }, [connected, refreshModel])

  async function selectModel(opt: ComposerModelOption): Promise<void> {
    try {
      await client.updateSettings({
        activeProfileId: opt.profileId,
        upsertProfile: { id: opt.profileId, activeModel: opt.modelId },
      })
      setSelectedProfileId(opt.profileId)
      setSelectedModelId(opt.modelId)
      setModelLabel(opt.modelId)
      // 列表顺序可能变了,完整刷新一次
      refreshModel()
    } catch {
      // 失败时保持原选中,不打断输入
    }
  }

  // 开屏即欢迎页;仅当上次的会话此刻仍在后台运行时,自动接回它的现场(一次性判断)
  const restoreTried = useRef(false)
  useEffect(() => {
    if (restoreTried.current || !connected || convs.length === 0) return
    restoreTried.current = true
    if (taskId) return
    const saved = localStorage.getItem(`lumen:taskId:${projectId}`)
    const last = saved ? convs.find((t) => t.id === saved) : undefined
    if (last?.status === 'running') selectConversation(last.id, true, last.project_id)
  }, [connected, convs, taskId, projectId, selectConversation])

  // 草稿发言落库 → 侧栏临时行消失,由真实会话接管
  useEffect(() => {
    if (taskId && draftProjectId) setDraftProjectId(null)
  }, [taskId, draftProjectId])

  async function installSkillPath(scope: SkillInstallScope, path: string): Promise<void> {
    setSkillsBusy(true)
    try {
      setSkills(await client.installSkill(projectId, scope, path))
    } finally {
      setSkillsBusy(false)
    }
  }

  async function uninstallSkillPath(scope: SkillInstallScope, name: string): Promise<void> {
    setSkillsBusy(true)
    try {
      setSkills(await client.uninstallSkill(projectId, scope, name))
    } finally {
      setSkillsBusy(false)
    }
  }

  const turnRailItems = useMemo(() => buildTurnRailItems(items), [items])
  const messagesRef = useRef<HTMLDivElement>(null)
  /** 消息内容根:贴底 RO 只盯它,composer 改视口高度不会误跟(doc/chat-scroll-ux.md) */
  const messagesContentRef = useRef<HTMLDivElement>(null)

  // 流式增高时贴底;用户上滚超过阈值则松手,不再强拉回 prompt
  const stickContentKey = useMemo(() => {
    const last = items[items.length - 1]
    if (!last) return `0:${running}`
    if (last.kind === 'msg') return `${items.length}:${last.id}:${last.content.length}:${running}`
    if (last.kind === 'process') {
      return `${items.length}:${last.id}:${last.steps.length}:${last.running}:${running}`
    }
    return `${items.length}:${last.id}:${running}`
  }, [items, running])
  const { pin: pinMessages, subscribePinned, getPinned } = useStickToBottom(messagesRef, stickContentKey, {
    enabled: !isEmptyChat(items, running),
    contentRef: messagesContentRef,
  })
  pinMessagesRef.current = pinMessages

  function scrollToTurn(userMsgId: string): void {
    const el = document.getElementById(msgAnchorId(userMsgId))
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const showReader = ws.open != null
  // 右栏可见 = 阅读器或工作目录轨;标题栏钮必须两边都能收,不能只拨 drawer
  const rightPaneOpen = showReader || drawer
  const isEmpty = isEmptyChat(items, running)

  function toggleRightPane(): void {
    if (showReader) {
      // 阅读器开着时:收起 = 关阅读器 + 收工作目录(回到纯对话)
      ws.close()
      setDrawer(false)
      return
    }
    toggleRail(!drawer)
  }

  return (
    <div className="app">
      <header className="titlebar">
        <div className="tb-left">
          {/* 品牌名占最左锚位;折叠/搜索恒驻其右(位置不随侧栏开合漂移,只换文案) */}
          <span className="brand">{APP_BRAND_COPY.name}</span>
          <Tooltip content={sbOpen ? '收起侧栏' : '展开侧栏'} render={
            <button className="icon-btn nav-icon-btn" aria-label={sbOpen ? '收起侧栏' : '展开侧栏'} onClick={() => toggleSidebar(!sbOpen)}>
              <PanelIcon size={APP_NAV_ICON_BUTTON.iconSize} />
            </button>
          } />
        </div>
        <nav className="titlebar-actions">
          {/* 工作区(右轨)收起/展开:图标钮,与左侧栏折叠钮对称;文字"工作区"改图标(owner 定) */}
          <Tooltip content={rightPaneOpen ? '收起工作区' : '展开工作区'} render={
            <button
              className="icon-btn nav-icon-btn"
              aria-label={rightPaneOpen ? '收起工作区' : '展开工作区'}
              aria-expanded={rightPaneOpen}
              aria-controls={APP_TITLEBAR_WORKSPACE_TOGGLE.controls}
              onClick={toggleRightPane}
            >
              <RailIcon size={APP_NAV_ICON_BUTTON.iconSize} />
            </button>
          } />
        </nav>
      </header>

      <div className="body">
        {sbOpen && (
          <Sidebar
            connected={connected}
            protocolMismatch={protocolMismatch}
            projects={sidebarProjects}
            pinnedTasks={pinnedTasks}
            tasksByProject={tasksByProjectUnpinned}
            recentTasks={recentTasks}
            activeProjectId={projectId}
            activeTaskId={taskId}
            draftProjectId={draftProjectId}
            canCreateProject={connected && !IS_DEMO}
            onOpenCreateProject={() => setCreateProjectOpen(true)}
            onNewChat={startNewChat}
            onSearch={() => setSearchOpen(true)}
            onSelect={pickConversation}
            onSelectProject={selectProject}
            onArchive={(t) => { void archiveConversation(t) }}
            onRenameTask={(t, title) => renameConversation(t, title)}
            onPinTask={(t, pinned) => setConversationPinned(t, pinned)}
            onRenameProject={(p, name) => renameProject(p, name)}
            onArchiveProject={(p) => { void archiveProject(p) }}
            onSettings={() => setSettingsOpen(true)}
            unreadIds={unreadIds}
            onToggleUnread={toggleUnread}
          />
        )}
        {createProjectOpen && (
          <CreateProjectModal
            onClose={() => setCreateProjectOpen(false)}
            onCreate={handleCreateProject}
          />
        )}
        <main className={`chat ${showReader ? 'chat-with-reader' : ''} ${isEmpty ? 'chat-empty' : ''}${pendingAsk ? ' has-ask-user' : ''}`}>
          <div className="chat-stage">
            {!isEmpty && (
              <TurnPreviewRail
                turns={turnRailItems}
                scrollerRef={messagesRef}
                onSelectTurn={scrollToTurn}
              />
            )}
            <div
              ref={messagesRef}
              key={taskId ?? `draft:${projectId}`}
              className={`messages ${isEmpty ? 'messages-empty' : ''}`}
            >
              <div ref={messagesContentRef} className="messages-content">
              <ChatTranscript
                items={items}
                evidenceItems={evidenceItems}
                running={running}
                pendingAsk={pendingAsk}
                modelRetry={modelRetry}
                thinkStartedAt={thinkStartedAt}
                isEmpty={isEmpty}
                taskId={taskId}
                projectId={projectId}
                client={client}
                onSend={(t) => { void send(t) }}
                assets={ws.assets}
                onOpenAsset={(a) => { void openAssetBound(a) }}
                onToggleRail={toggleRail}
              />
              </div>
            </div>
          </div>
          <div className="composer-dock">
            {!isEmpty && (
              <JumpToLatestButton
                pin={pinMessages}
                subscribe={subscribePinned}
                getPinned={getPinned}
              />
            )}
            {pendingAsk && (
              <AskUserDialog
                questions={pendingAsk.questions}
                busy={askBusy}
                onSubmit={async (payload) => {
                  setAskBusy(true)
                  try {
                    await answerAsk(payload)
                  } catch (err) {
                    toast.add({
                      variant: 'error',
                      title: '提交失败',
                      description: err instanceof Error ? err.message : '请重试',
                    })
                  } finally {
                    setAskBusy(false)
                  }
                }}
                onSkip={async () => {
                  setAskBusy(true)
                  try {
                    await answerAsk({ answers: {}, skipped: true })
                  } catch (err) {
                    toast.add({
                      variant: 'error',
                      title: '跳过失败',
                      description: err instanceof Error ? err.message : '请重试',
                    })
                  } finally {
                    setAskBusy(false)
                  }
                }}
              />
            )}
          <ComposerCard
            input={input}
            onInputChange={setInput}
            onSubmit={(e) => { void onSubmit(e) }}
            onKeyDown={onComposerKey}
            onPaste={onPaste}
            taRef={taRef}
            fileRef={fileRef}
            onPickFiles={onPickFiles}
            onAddFiles={onAddFiles}
            onAttachClick={() => fileRef.current?.click()}
            attachments={attachments}
            onRemoveAttachment={(i) => setAttachments((prev) => prev.filter((_, j) => j !== i))}
            pendingFiles={pendingFiles}
            onRemoveFile={(i) => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
            running={running}
            onStop={stop}
            uploading={uploading}
            pendingAsk={!!pendingAsk}
            modelLabel={modelLabel}
            modelOptions={modelOptions}
            selectedProfileId={selectedProfileId}
            selectedModelId={selectedModelId}
            onSelectModel={(opt) => { void selectModel(opt) }}
            onManageModels={() => setSettingsOpen(true)}
            ctxUsage={ctxUsage}
            canSend={!pendingAsk && !uploading && !!(input.trim() || attachments.length || pendingFiles.length)}
            skills={skills}
            onActivateSkill={(name) => { void activateSkill(name) }}
            onOpenManageSkills={() => setSkillsManageOpen(true)}
            activePath={activePath}
            onClearActivePath={() => setActivePath(null)}
          />
          </div>
        </main>

        {showReader && ws.open && <ReaderPane open={ws.open} pdfUrl={(p) => client.pdfUrl(projectId, p, taskId ?? undefined)} onClose={ws.close} />}
        {drawer && !showReader && (
          <UtilityRail
            assets={ws.assets}
            onOpen={(a) => { void openAssetBound(a) }}
            items={items}
            evidenceItems={evidenceItems}
            running={running}
            onUploadShared={(files) => { void uploadShared(files) }}
          />
        )}
      </div>

      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} conversations={convs} onSelect={pickConversation} />
      {skillsManageOpen && (
        <ManageSkillsDialog
          skills={skills}
          busy={skillsBusy}
          onClose={() => setSkillsManageOpen(false)}
          onInstall={installSkillPath}
          onUninstall={uninstallSkillPath}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          client={client}
          activeProfileId={selectedProfileId}
          onChanged={refreshModel}
          onClose={() => { setSettingsOpen(false); refreshModel() }}
          appearance={appearance}
          onAppearanceChange={setAppearance}
        />
      )}
      {/* 桌面无浏览器控制台:⌃⌥⇧S 开滚动诊断,复制日志贴聊天 */}
      <ScrollDebugHud />
    </div>
  )
}

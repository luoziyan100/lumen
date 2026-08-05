/**
 * [INPUT]: AgentClient;useAgent;useWorkspace;Sidebar;TurnPreviewRail;UtilityRail;AskUserDialog;ComposerCard;CollapsibleUserText
 * [OUTPUT]: App —— 形态 A 装配;项目树(p-*) + 最近平铺历史;轮次轨;PlanCard/ProcessRow/ThinkingIndicator;
 *           ask_user 悬浮问询;composer 暗玻璃;用户超长 prompt 折叠
 * [POS]: ui-client 根组件;storage project_id ≠ 用户项目;历史不分类进「默认」;
 *        对话列 useStickToBottom:流式贴底,用户上滚松手
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Toasty, useKumoToastManager } from '@cloudflare/kumo/components/toast'
import { Tooltip, TooltipProvider } from '@cloudflare/kumo/components/tooltip'
import { AgentClient, type ImageData, type Project, type Task } from './agent-client'
import { ensureAgentService } from './ensureAgent'
import { useAgent, type ChatItem } from './useAgent'
import { useStickToBottom } from './useStickToBottom'
import { useWorkspace } from './useWorkspace'

function isEmptyChat(items: ChatItem[], running: boolean): boolean {
  return items.length === 0 && !running
}
import { Sidebar } from './components/Sidebar'
import { CreateProjectModal, type CreateProjectPayload } from './components/CreateProjectModal'
import { AskUserDialog } from './components/AskUserDialog'
import { CollapsibleUserText } from './components/CollapsibleUserText'
import { ComposerCard } from './components/ComposerCard'
import { SearchModal } from './components/SearchModal'
import { SettingsModal } from './components/SettingsModal'
import { CheckIcon, CopyIcon, PanelIcon, RailIcon } from './components/icons'
import { UtilityRail } from './components/UtilityRail'
import { ReaderPane } from './components/ReaderPane'
import { ProcessRow } from './components/ProcessRow'
import { PlanCard } from './components/PlanCard'
import { ThinkingIndicator } from './components/ThinkingIndicator'
import { TurnPreviewRail } from './components/TurnPreviewRail'
import { buildTurnRailItems, msgAnchorId } from './components/turnRail'
import { AssistantContent } from './components/widget/AssistantContent'
import { getTimeGreeting } from './greeting'
import {
  APP_BRAND_COPY, APP_NAV_ICON_BUTTON, APP_TITLEBAR_WORKSPACE_TOGGLE,
} from './appCopy'

// 默认必须 127.0.0.1:service 只绑 IPv4;localhost 常解析到 ::1 → 永远「服务未连接」
const w = window as { __LUMEN_WS__?: string; __LUMEN_TOKEN__?: string }
const SERVICE_URL = w.__LUMEN_WS__ ?? 'ws://127.0.0.1:8787'
const SERVICE_TOKEN = w.__LUMEN_TOKEN__ || new URLSearchParams(window.location.search).get('token') || undefined
const IS_DEMO = import.meta.env.VITE_LUMEN_DEMO === '1'

/** demo=访客空间;本地=最近项目或 default */
function initialProjectId(): string {
  if (IS_DEMO) {
    try {
      let id = localStorage.getItem('lumen:visitor')
      if (!id) { id = 'v-' + crypto.randomUUID(); localStorage.setItem('lumen:visitor', id) }
      return id
    } catch { return 'default' }
  }
  return localStorage.getItem('lumen:projectId') || 'default'
}

export function App() {
  return (
    <Toasty>
      <TooltipProvider>
        <AppInner />
      </TooltipProvider>
    </Toasty>
  )
}

function AppInner() {
  const toast = useKumoToastManager()
  const client = useMemo(() => new AgentClient(SERVICE_URL, SERVICE_TOKEN), [])
  const [connected, setConnected] = useState(false)
  // 连接生命周期:断线必须把 connected 打回 false 并自动重连——否则 UI 假在线,send 静默失败。
  // 睡眠常弄死 Node sidecar:重连前先请壳 ensure;可见性恢复时再推一把。
  useEffect(() => {
    let live = true
    let retry: ReturnType<typeof setTimeout> | null = null
    const connect = (askShell = false): void => {
      void (async () => {
        if (askShell) await ensureAgentService()
        if (!live) return
        client.connect()
          .then(() => { if (live) setConnected(true) })
          .catch(() => {
            if (!live) return
            setConnected(false)
            retry = setTimeout(() => connect(true), 1200)
          })
      })()
    }
    const offClose = client.onClose(() => {
      if (!live) return
      setConnected(false)
      retry = setTimeout(() => connect(true), 800)
    })
    const onVisible = (): void => {
      if (document.visibilityState !== 'visible' || !live) return
      if (!client.connected) connect(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    connect(true)
    return () => {
      live = false
      offClose()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      if (retry) clearTimeout(retry)
      client.close()
    }
  }, [client])

  const [projectId, setProjectId] = useState(initialProjectId)
  const [projects, setProjects] = useState<Project[]>([])
  const [tasksByProject, setTasksByProject] = useState<Record<string, Task[]>>({})
  /** 项目行 + 后的临时「新建对话」;发言落库后清掉,未发言离开也清掉 */
  const [draftProjectId, setDraftProjectId] = useState<string | null>(null)

  function persistProjectId(id: string): void {
    setProjectId(id)
    if (!IS_DEMO) localStorage.setItem('lumen:projectId', id)
  }

  const {
    items, running, pendingAsk, send, stop, answerAsk,
    newConversation, selectConversation, taskId, ctxUsage,
  } = useAgent(client, projectId, connected)
  const [askBusy, setAskBusy] = useState(false)
  const ws = useWorkspace(client, projectId, taskId, connected)
  // 工作目录:默认收起;当前会话有产物(上传文件/模型写出报告)才自动展开——纯问答保持收起(owner 定 2026-07-10)
  const [drawer, setDrawer] = useState(false)
  const [input, setInput] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)
  // 输入框随内容自增高(单行起,约 6 行后内部滚动)
  useLayoutEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 168)}px`
  }, [input])
  // 侧栏收起/展开(记住选择)
  const [sbOpen, setSbOpen] = useState(() => localStorage.getItem('lumen:sbOpen') !== '0')
  function toggleSidebar(next: boolean): void {
    setSbOpen(next)
    localStorage.setItem('lumen:sbOpen', next ? '1' : '0')
  }
  function toggleRail(next: boolean): void {
    setDrawer(next) // 手动开合(标题栏钮/上传即时反馈);默认收起与自动展开由产物驱动
  }
  // 产物驱动:当前会话有产物→展开工作目录,纯问答(无产物)→收起;手动开合保持到下次产物变化/切会话
  useEffect(() => { setDrawer(ws.assets.length > 0) }, [ws.assets.length, taskId])

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
        setTasksByProject({ [pid]: tasks })
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
        map[p.id] = await client.list(p.id).catch(() => [])
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
    () => projects.filter((p) => p.id.startsWith('p-')),
    [projects],
  )
  const recentTasks = useMemo(
    () => Object.entries(tasksByProject)
      .filter(([pid]) => !pid.startsWith('p-'))
      .flatMap(([, tasks]) => tasks)
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')),
    [tasksByProject],
  )
  /** 搜索跨项目(仍按会话点选) */
  const convs = useMemo(
    () => Object.values(tasksByProject).flat(),
    [tasksByProject],
  )

  // 当前激活模型:输入卡底部显示。getSettings 走共享 pendingSettings 解析器,
  // 不能和设置弹窗的 getSettings 并发(会互相覆盖 → 弹窗那次永远 pending,模型页变空白)。
  // 所以:连上时取一次;弹窗关闭后(它的 getSettings 早已 resolve)再刷新一次。
  const [modelLabel, setModelLabel] = useState('')
  const refreshModel = useCallback(() => {
    client.getSettings().then((s) => {
      const active = s.profiles.find((p) => p.id === s.activeProfileId)
      // 芯片显「模型 ID」(如 deepseek-v4-pro / claude-opus-4-8),而非 profile 显示名(如「模型 2」);
      // 模型 ID 未填时才退回显示名(owner 定 2026-07-06)
      setModelLabel(active ? (active.model || active.name) : '')
    }).catch(() => {})
  }, [client])
  useEffect(() => { if (connected) refreshModel() }, [connected, refreshModel])

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

  // 悬停复制:平时隐身,悬到消息上才浮现;点击复制该条原文(assistant=原始 markdown)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  async function copyMsg(id: string, text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // WKWebView / 权限受限兜底:隐藏 textarea + execCommand
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopiedId(id)
    window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1400)
  }

  // 粘贴进对话的图片(随消息发给模型,多模态)
  const [attachments, setAttachments] = useState<ImageData[]>([])
  const MAX_IMAGES = 4
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>): void {
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    e.preventDefault() // 阻止把二进制粘成乱码文本
    for (const file of files.slice(0, MAX_IMAGES - attachments.length)) {
      if (file.size > MAX_IMAGE_BYTES) continue
      const reader = new FileReader()
      reader.onload = () => {
        const url = String(reader.result ?? '')
        const base64 = url.slice(url.indexOf(',') + 1)
        setAttachments((prev) => prev.length < MAX_IMAGES
          ? [...prev, { mediaType: file.type, base64 }]
          : prev)
      }
      reader.readAsDataURL(file)
    }
  }

  async function submit(): Promise<void> {
    const t = input.trim()
    // ask_user 挂起时禁普通发送——作答走 Dialog,避免与 running continue 打架
    if ((!t && attachments.length === 0 && pendingFiles.length === 0) || running || uploading || pendingAsk) return
    const images = attachments
    const files = pendingFiles
    const text = t || (files.length ? `(上传了 ${files.length} 个文件)` : '(见图)')
    // 带文件:先确保会话在(草稿,标题=第一句话而非文件名),文件入工作区后再开跑——模型第一轮就看得到
    if (files.length) {
      setUploading(true)
      try {
        let id = taskId
        if (!id) {
          id = await client.createTask(projectId, text)
          selectConversation(id, false, projectId)
        }
        for (const file of files) await client.uploadFile(projectId, file, id)
        ws.refresh(id)
        toggleRail(true) // 展开工作区轨,让用户看到刚入库的文件
      } catch (err) {
        toast.add({
          variant: 'error',
          title: '上传失败',
          description: err instanceof Error ? err.message : '文件还在暂存区,可重试或移除',
        })
        setUploading(false)
        return // 输入与文件都保留,便于重试
      }
      setUploading(false)
    }
    setInput('')
    setAttachments([])
    setPendingFiles([])
    pinMessagesRef.current() // 新一轮输出默认贴底跟随
    await send(text, images.length ? images : undefined)
  }
  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    await submit()
  }
  // Enter 发送;Shift+Enter 换行;输入法组字中的 Enter(isComposing)不发送(中文必须)
  function onComposerKey(e: ReactKeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void submit()
    }
  }

  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  // 选中的文件先暂存在输入卡(像图片一样可 ❌ 反悔),发送时才建会话、入工作区(2026-07-09 客户定)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  function onPickFiles(e: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // 允许重选同名文件
    if (files.length) setPendingFiles((prev) => [...prev, ...files])
  }

  // 每轮只给"最终输出"配复制:该 assistant 消息之后、到下一条 user 之前再无 assistant;
  // 正在流式的一轮先不配(收尾后才出现)
  const finalAssistantIds = useMemo(() => {
    const ids = new Set<string>()
    let candidate: string | null = null
    for (const it of items) {
      if (it.kind !== 'msg') continue
      if (it.role === 'assistant') candidate = it.id
      else if (it.role === 'user') { if (candidate) ids.add(candidate); candidate = null }
    }
    if (candidate && !running) ids.add(candidate)
    return ids
  }, [items, running])

  const turnRailItems = useMemo(() => buildTurnRailItems(items), [items])
  const messagesRef = useRef<HTMLDivElement>(null)
  const pinMessagesRef = useRef<() => void>(() => {})
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null)

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
  const { pin: pinMessages } = useStickToBottom(messagesRef, stickContentKey, {
    enabled: !isEmptyChat(items, running),
  })
  pinMessagesRef.current = pinMessages

  // 视口内最靠上的用户轮 → rail 选中态(与悬停预览分离)
  useEffect(() => {
    const root = messagesRef.current
    if (!root || turnRailItems.length < 4) {
      setActiveTurnId(null)
      return
    }
    const ids = turnRailItems.map((t) => t.userMsgId)
    const visible = new Map<string, number>() // id → bounding top
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = e.target.id.replace(/^msg-/, '')
          if (e.isIntersecting) visible.set(id, e.boundingClientRect.top)
          else visible.delete(id)
        }
        let best: string | null = null
        let bestTop = Infinity
        for (const [id, top] of visible) {
          if (top < bestTop) { bestTop = top; best = id }
        }
        if (best) setActiveTurnId(best)
      },
      { root, rootMargin: '-8% 0px -55% 0px', threshold: [0, 0.1, 0.5] },
    )
    for (const id of ids) {
      const el = document.getElementById(msgAnchorId(id))
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [turnRailItems, items.length])

  function scrollToTurn(userMsgId: string): void {
    const el = document.getElementById(msgAnchorId(userMsgId))
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveTurnId(userMsgId)
  }

  const copyBtn = (id: string, text: string, label: string) => (
    <button type="button" className={`msg-copy${copiedId === id ? ' is-copied' : ''}`} aria-label={label} title="复制" onClick={() => void copyMsg(id, text)}>
      {copiedId === id ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
    </button>
  )

  const lastItem = items[items.length - 1]
  const lastRunning = lastItem?.kind === 'process' && lastItem.running
  const showReader = ws.open != null
  const isEmpty = isEmptyChat(items, running)

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
          <Tooltip content={drawer ? '收起工作区' : '展开工作区'} render={
            <button
              className="icon-btn nav-icon-btn"
              aria-label={drawer ? '收起工作区' : '展开工作区'}
              aria-expanded={drawer}
              aria-controls={APP_TITLEBAR_WORKSPACE_TOGGLE.controls}
              onClick={() => toggleRail(!drawer)}
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
            projects={sidebarProjects}
            tasksByProject={tasksByProject}
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
            onSettings={() => setSettingsOpen(true)}
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
                activeId={activeTurnId}
                onSelectTurn={scrollToTurn}
              />
            )}
            <div ref={messagesRef} className={`messages ${isEmpty ? 'messages-empty' : ''}`}>
              {isEmpty && <EmptyState />}
              {items.map((it) => {
                if (it.kind === 'compaction') {
                  return <div key={it.id} className="ctx-divider"><span>已整理更早的上下文 · 细节在工作区与历史记录</span></div>
                }
                if (it.kind === 'plan') return <PlanCard key={it.id} plan={it} />
                if (it.kind === 'process') return <ProcessRow key={it.id} block={it} />
                if (it.role === 'assistant') {
                  const streamingWidget = Boolean(it.streaming) || (running && !finalAssistantIds.has(it.id))
                  if (!finalAssistantIds.has(it.id)) {
                    return (
                      <div key={it.id} id={msgAnchorId(it.id)} className="bubble bubble-assistant">
                        <AssistantContent content={it.content} isStreaming={streamingWidget} onSendMessage={(t) => { void send(t) }} />
                      </div>
                    )
                  }
                  return (
                    <div key={it.id} id={msgAnchorId(it.id)} className="msg-group msg-group-assistant">
                      <div className="bubble bubble-assistant">
                        <AssistantContent content={it.content} onSendMessage={(t) => { void send(t) }} />
                      </div>
                      <div className="msg-actions">{copyBtn(it.id, it.content, '复制这条回答')}</div>
                    </div>
                  )
                }
                if (it.role === 'user') {
                  return (
                    <div key={it.id} id={msgAnchorId(it.id)} className="msg-group msg-group-user">
                      <div className="bubble bubble-user">
                        <CollapsibleUserText
                          text={it.content}
                          leading={it.images?.length ? (
                            <div className="msg-images">
                              {it.images.map((im, i) => (
                                <img key={i} className="msg-image" src={`data:${im.mediaType};base64,${im.base64}`} alt="粘贴的图片" />
                              ))}
                            </div>
                          ) : undefined}
                        />
                      </div>
                      <div className="msg-actions">{copyBtn(it.id, it.content, '复制这条输入')}</div>
                    </div>
                  )
                }
                return <div key={it.id} id={msgAnchorId(it.id)} className={`bubble bubble-${it.role}`}>{it.content}</div>
              })}
              {running && !lastRunning && !pendingAsk && <ThinkingIndicator />}
            </div>
          </div>
          <div className="composer-dock">
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
            onOpenModel={() => setSettingsOpen(true)}
            ctxUsage={ctxUsage}
            canSend={!pendingAsk && !uploading && !!(input.trim() || attachments.length || pendingFiles.length)}
          />
          </div>
        </main>

        {showReader && ws.open && <ReaderPane open={ws.open} pdfUrl={(p) => client.pdfUrl(projectId, p, taskId ?? undefined)} onClose={ws.close} />}
        {drawer && !showReader && (
          <UtilityRail
            assets={ws.assets}
            onOpen={ws.openAsset}
            items={items}
            running={running}
            onUploadShared={(files) => { void uploadShared(files) }}
          />
        )}
      </div>

      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} conversations={convs} onSelect={pickConversation} />
      {settingsOpen && <SettingsModal client={client} onClose={() => { setSettingsOpen(false); refreshModel() }} />}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="empty">
      <div className="empty-mark">{getTimeGreeting()}</div>
    </div>
  )
}

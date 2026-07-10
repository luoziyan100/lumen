/**
 * Lumen 形态 A:对话主屏 + 可收工作区抽屉 + PDF/文件右侧分屏(阅读器)。
 * client 在此建并 connect,传给 useAgent(对话)/ useWorkspace(资产)。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import { Toasty, useKumoToastManager } from '@cloudflare/kumo/components/toast'
import { Tooltip, TooltipProvider } from '@cloudflare/kumo/components/tooltip'
import { AgentClient, type ImageData, type Task } from './agent-client'
import { useAgent } from './useAgent'
import { useWorkspace } from './useWorkspace'
import { Sidebar } from './components/Sidebar'
import { SearchModal } from './components/SearchModal'
import { SettingsModal } from './components/SettingsModal'
import { CheckIcon, CloseIcon, CopyIcon, PanelIcon, PdfIcon, PlusIcon, RailIcon, SendIcon } from './components/icons'
import { UtilityRail } from './components/UtilityRail'
import { ReaderPane } from './components/ReaderPane'
import { ProcessRow } from './components/ProcessRow'
import { Markdown } from './components/Markdown'
import { getTimeGreeting } from './greeting'
import { APP_BRAND_COPY, APP_NAV_ICON_BUTTON, APP_TITLEBAR_WORKSPACE_TOGGLE } from './appCopy'

const w = window as { __LUMEN_WS__?: string; __LUMEN_TOKEN__?: string }
const SERVICE_URL = w.__LUMEN_WS__ ?? 'ws://localhost:8787'
const SERVICE_TOKEN = w.__LUMEN_TOKEN__ ?? new URLSearchParams(window.location.search).get('token') ?? undefined
const PROJECT = 'default'

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
  useEffect(() => {
    let live = true
    client.connect().then(() => { if (live) setConnected(true) }).catch(() => {})
    return () => { live = false; client.close() }
  }, [client])

  const { items, running, send, stop, newConversation, selectConversation, taskId } = useAgent(client, PROJECT, connected)
  const ws = useWorkspace(client, PROJECT, taskId, connected)
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

  // 会话搜索弹窗(侧栏🔍 / ⌘K)+ 设置弹窗
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
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
    selectConversation(task.id, task.status === 'running')
    ws.close()
    setSearchOpen(false)
  }

  // 会话历史:连上 / 新任务建立 / 任务收尾时刷新
  const [convs, setConvs] = useState<Task[]>([])
  useEffect(() => {
    if (!connected) return
    let live = true
    client.list(PROJECT).then((tasks) => { if (live) setConvs(tasks) })
    return () => { live = false }
  }, [client, connected, taskId, running])

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
    const saved = localStorage.getItem(`lumen:taskId:${PROJECT}`)
    const last = saved ? convs.find((t) => t.id === saved) : undefined
    if (last?.status === 'running') selectConversation(last.id, true)
  }, [connected, convs, taskId, selectConversation])

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
    if ((!t && attachments.length === 0 && pendingFiles.length === 0) || running || uploading) return
    const images = attachments
    const files = pendingFiles
    const text = t || (files.length ? `(上传了 ${files.length} 个文件)` : '(见图)')
    // 带文件:先确保会话在(草稿,标题=第一句话而非文件名),文件入工作区后再开跑——模型第一轮就看得到
    if (files.length) {
      setUploading(true)
      try {
        let id = taskId
        if (!id) {
          id = await client.createTask(PROJECT, text)
          selectConversation(id)
        }
        for (const file of files) await client.uploadFile(PROJECT, file, id)
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
  const copyBtn = (id: string, text: string, label: string) => (
    <button type="button" className={`msg-copy${copiedId === id ? ' is-copied' : ''}`} aria-label={label} title="复制" onClick={() => void copyMsg(id, text)}>
      {copiedId === id ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
    </button>
  )

  const lastItem = items[items.length - 1]
  const lastRunning = lastItem?.kind === 'process' && lastItem.running
  const showReader = ws.open != null
  const isEmpty = items.length === 0 && !running

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
            conversations={convs}
            activeId={taskId}
            onNew={() => { newConversation(); ws.close() }}
            onSearch={() => setSearchOpen(true)}
            onSelect={pickConversation}
            onSettings={() => setSettingsOpen(true)}
          />
        )}
        <main className={`chat ${showReader ? 'chat-with-reader' : ''} ${isEmpty ? 'chat-empty' : ''}`}>
          <div className={`messages ${isEmpty ? 'messages-empty' : ''}`}>
            {isEmpty && <EmptyState />}
            {items.map((it) => {
              if (it.kind !== 'msg') return <ProcessRow key={it.id} block={it} />
              if (it.role === 'assistant') {
                if (!finalAssistantIds.has(it.id)) {
                  return <div key={it.id} className="bubble bubble-assistant"><Markdown>{it.content}</Markdown></div>
                }
                return (
                  <div key={it.id} className="msg-group msg-group-assistant">
                    <div className="bubble bubble-assistant"><Markdown>{it.content}</Markdown></div>
                    <div className="msg-actions">{copyBtn(it.id, it.content, '复制这条回答')}</div>
                  </div>
                )
              }
              if (it.role === 'user') {
                return (
                  <div key={it.id} className="msg-group msg-group-user">
                    <div className="bubble bubble-user">
                      {it.images?.length ? (
                        <div className="msg-images">
                          {it.images.map((im, i) => (
                            <img key={i} className="msg-image" src={`data:${im.mediaType};base64,${im.base64}`} alt="粘贴的图片" />
                          ))}
                        </div>
                      ) : null}
                      {it.content}
                    </div>
                    <div className="msg-actions">{copyBtn(it.id, it.content, '复制这条输入')}</div>
                  </div>
                )
              }
              return <div key={it.id} className={`bubble bubble-${it.role}`}>{it.content}</div>
            })}
            {running && !lastRunning && <div className="bubble bubble-status">思考中…</div>}
          </div>
          <form className="composer-card" onSubmit={onSubmit}>
            {attachments.length > 0 && (
              <div className="attach-row">
                {attachments.map((im, i) => (
                  <span key={i} className="attach-chip">
                    <img src={`data:${im.mediaType};base64,${im.base64}`} alt="待发送图片" />
                    <button type="button" aria-label="移除图片" onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}><CloseIcon size={12} /></button>
                  </span>
                ))}
              </div>
            )}
            {pendingFiles.length > 0 && (
              <div className="file-row">
                {pendingFiles.map((f, i) => (
                  <span key={`${f.name}-${i}`} className="file-chip" title={f.name}>
                    <PdfIcon size={14} />
                    <span className="file-chip-name">{f.name}</span>
                    <button type="button" aria-label="移除文件" onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}><CloseIcon size={12} /></button>
                  </span>
                ))}
              </div>
            )}
            <textarea
              ref={taRef}
              className="composer-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onComposerKey}
              onPaste={onPaste}
              placeholder="问点什么,或粘贴图片、让它去研究…"
              rows={1}
            />
            <div className="composer-bar">
              <Tooltip content={uploading ? '上传中…' : '添加文件'} render={
                <Button
                  type="button"
                  variant="ghost"
                  shape="square"
                  aria-label="添加文件"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                ><PlusIcon /></Button>
              } />
              <span className="composer-spacer" />
              {running
                ? <Tooltip content="停止" render={<Button type="button" variant="destructive" shape="circle" aria-label="停止" onClick={stop}><span className="stop-square" /></Button>} />
                : <Tooltip content="发送" render={<Button type="submit" variant="primary" shape="circle" aria-label="发送" disabled={(!input.trim() && attachments.length === 0 && pendingFiles.length === 0) || uploading}><SendIcon /></Button>} />}
            </div>
            <div className="composer-div" />
            <div className="composer-foot">
              <span className="composer-spacer" />
              <button type="button" className="composer-model" onClick={() => setSettingsOpen(true)} title="模型设置">
                <span className="composer-model-dot" />{modelLabel || '选择模型'}
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".pdf,.md,.txt,.tex,.csv,.json,.html,.png,.jpg,.jpeg,.webp,.gif,.docx,.pptx,.epub"
              hidden
              onChange={onPickFiles}
            />
          </form>
        </main>

        {showReader && ws.open && <ReaderPane open={ws.open} pdfUrl={(p) => client.pdfUrl(PROJECT, p, taskId ?? undefined)} onClose={ws.close} />}
        {drawer && !showReader && <UtilityRail assets={ws.assets} onOpen={ws.openAsset} items={items} running={running} />}
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

/**
 * Lumen 形态 A:对话主屏 + 可收工作区抽屉 + PDF/文件右侧分屏(阅读器)。
 * client 在此建并 connect,传给 useAgent(对话)/ useWorkspace(资产)。
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type FormEvent } from 'react'
import { AgentClient, type ImageData, type Task } from './agent-client'
import { useAgent } from './useAgent'
import { useWorkspace } from './useWorkspace'
import { Sidebar } from './components/Sidebar'
import { SearchModal } from './components/SearchModal'
import { SettingsModal } from './components/SettingsModal'
import { PanelIcon, SearchIcon } from './components/icons'
import { WorkspaceDrawer } from './components/WorkspaceDrawer'
import { ReaderPane } from './components/ReaderPane'
import { ProcessRow } from './components/ProcessRow'
import { Markdown } from './components/Markdown'
import { LumenAura } from './aura/LumenAura'
import { LUMEN_CELADON_AURA_MAP } from './aura/lumenTheme'
import { useAuraState } from './aura/useAuraState'
import { getTimeGreeting } from './greeting'
import { APP_BRAND_COPY, APP_NAV_ICON_BUTTON, APP_TITLEBAR_ACTIONS, APP_TITLEBAR_WORKSPACE_TOGGLE } from './appCopy'

const w = window as { __LUMEN_WS__?: string; __LUMEN_TOKEN__?: string }
const SERVICE_URL = w.__LUMEN_WS__ ?? 'ws://localhost:8787'
const SERVICE_TOKEN = w.__LUMEN_TOKEN__ ?? new URLSearchParams(window.location.search).get('token') ?? undefined
const PROJECT = 'default'

export function App() {
  const client = useMemo(() => new AgentClient(SERVICE_URL, SERVICE_TOKEN), [])
  const [connected, setConnected] = useState(false)
  useEffect(() => {
    let live = true
    client.connect().then(() => { if (live) setConnected(true) }).catch(() => {})
    return () => { live = false; client.close() }
  }, [client])

  const { items, running, send, stop, newConversation, selectConversation, taskId } = useAgent(client, PROJECT, connected)
  const ws = useWorkspace(client, PROJECT, connected)
  const [drawer, setDrawer] = useState(false)
  const [input, setInput] = useState('')
  // 侧栏收起/展开(记住选择)
  const [sbOpen, setSbOpen] = useState(() => localStorage.getItem('lumen:sbOpen') !== '0')
  function toggleSidebar(next: boolean): void {
    setSbOpen(next)
    localStorage.setItem('lumen:sbOpen', next ? '1' : '0')
  }

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

  // 粘贴进对话的图片(随消息发给模型,多模态)
  const [attachments, setAttachments] = useState<ImageData[]>([])
  const MAX_IMAGES = 4
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024

  function onPaste(e: ClipboardEvent<HTMLInputElement>): void {
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

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    const t = input.trim()
    if ((!t && attachments.length === 0) || running) return
    const images = attachments
    setInput('')
    setAttachments([])
    await send(t || '(见图)', images.length ? images : undefined)
  }

  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  async function onPickFiles(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // 允许重选同名文件
    if (!files.length) return
    setUploading(true)
    try {
      for (const file of files) await client.uploadFile(PROJECT, file)
      ws.refresh()
      setDrawer(true) // 上传后展开工作区,让用户看到刚加入的文件
    } catch { /* 失败先静默,后续接 toast */ }
    setUploading(false)
  }

  const lastItem = items[items.length - 1]
  const lastRunning = lastItem?.kind === 'process' && lastItem.running
  const showReader = ws.open != null
  const auraState = useAuraState({ connected, running, items })

  return (
    <div className="app" data-aura-state={auraState}>
      <div className="aura-backdrop" aria-hidden="true">
        <LumenAura state={auraState} map={LUMEN_CELADON_AURA_MAP} />
        <div className="aura-veil" />
      </div>

      <header className="titlebar">
        <div className="tb-left">
          {!sbOpen && (
            <>
              <button className="icon-btn nav-icon-btn" title="展开侧栏" aria-label="展开侧栏" onClick={() => toggleSidebar(true)}>
                <PanelIcon size={APP_NAV_ICON_BUTTON.iconSize} />
              </button>
              <button className="icon-btn nav-icon-btn" title="搜索对话 (⌘K)" aria-label="搜索对话" onClick={() => setSearchOpen(true)}>
                <SearchIcon size={APP_NAV_ICON_BUTTON.iconSize} />
              </button>
            </>
          )}
          <span className="brand">{APP_BRAND_COPY.name}</span>
        </div>
        <nav className="titlebar-actions">
          <span className="titlebar-workspace-cluster">
            <button
              type="button"
              className="titlebar-icon-toggle"
              onClick={() => setDrawer((v) => !v)}
              aria-label={drawer ? '收起工作区' : '展开工作区'}
              aria-expanded={drawer}
              aria-controls={APP_TITLEBAR_WORKSPACE_TOGGLE.controls}
              title={drawer ? '收起工作区' : '展开工作区'}
            >
              <PanelIcon size={APP_TITLEBAR_WORKSPACE_TOGGLE.iconSize} />
            </button>
            {APP_TITLEBAR_ACTIONS.map((action) => {
              if (action.id !== 'workspace') return null
              return (
                <button
                  key={action.id}
                  className={drawer ? 'tb-on' : ''}
                  onClick={() => setDrawer(true)}
                >
                  {action.label}
                </button>
              )
            })}
          </span>
          {APP_TITLEBAR_ACTIONS.map((action) => {
            if (action.id === 'workspace') return null
            return <button key={action.id} className={settingsOpen ? 'tb-on' : ''} onClick={() => setSettingsOpen(true)}>{action.label}</button>
          })}
        </nav>
      </header>

      <div className="body">
        {sbOpen && (
          <Sidebar
            conversations={convs}
            activeId={taskId}
            onNew={() => { newConversation(); ws.close() }}
            onSelect={pickConversation}
            onCollapse={() => toggleSidebar(false)}
            onSearch={() => setSearchOpen(true)}
          />
        )}
        <main className={`chat ${showReader ? 'chat-with-reader' : ''}`}>
          <div className="messages">
            {items.length === 0 && !running && <EmptyState />}
            {items.map((it) => it.kind === 'msg'
              ? (it.role === 'assistant'
                  ? <div key={it.id} className="bubble bubble-assistant"><Markdown>{it.content}</Markdown></div>
                  : (
                    <div key={it.id} className={`bubble bubble-${it.role}`}>
                      {it.images?.length ? (
                        <div className="msg-images">
                          {it.images.map((im, i) => (
                            <img key={i} className="msg-image" src={`data:${im.mediaType};base64,${im.base64}`} alt="粘贴的图片" />
                          ))}
                        </div>
                      ) : null}
                      {it.content}
                    </div>
                  ))
              : <ProcessRow key={it.id} block={it} />)}
            {running && !lastRunning && <div className="bubble bubble-status">思考中…</div>}
          </div>
          <form className="composer-card" onSubmit={onSubmit}>
            {attachments.length > 0 && (
              <div className="attach-row">
                {attachments.map((im, i) => (
                  <span key={i} className="attach-chip">
                    <img src={`data:${im.mediaType};base64,${im.base64}`} alt="待发送图片" />
                    <button type="button" aria-label="移除图片" onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}>×</button>
                  </span>
                ))}
              </div>
            )}
            <input
              className="composer-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={onPaste}
              placeholder="问点什么,或粘贴图片、让它去研究…"
            />
            <div className="composer-bar">
              <button
                type="button"
                className="icon-btn"
                title={uploading ? '上传中…' : '添加文件'}
                aria-label="添加文件"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >＋</button>
              <span className="composer-spacer" />
              {running
                ? <button type="button" className="send-btn send-btn-stop" title="停止" aria-label="停止" onClick={stop}><span className="stop-square" /></button>
                : <button type="submit" className="send-btn" title="发送" aria-label="发送" disabled={!input.trim() && attachments.length === 0}>↑</button>}
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

        {showReader && ws.open && <ReaderPane open={ws.open} pdfUrl={(p) => client.pdfUrl(PROJECT, p)} onClose={ws.close} />}
        {drawer && !showReader && <WorkspaceDrawer assets={ws.assets} onOpen={ws.openAsset} />}
      </div>

      {searchOpen && <SearchModal conversations={convs} onSelect={pickConversation} onClose={() => setSearchOpen(false)} />}
      {settingsOpen && <SettingsModal client={client} onClose={() => setSettingsOpen(false)} />}
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

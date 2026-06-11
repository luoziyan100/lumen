/**
 * Lumen 形态 A:对话主屏 + 可收工作区抽屉 + PDF/文件右侧分屏(阅读器)。
 * client 在此建并 connect,传给 useAgent(对话)/ useWorkspace(资产)。
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { AgentClient } from './agent-client'
import { useAgent } from './useAgent'
import { useWorkspace } from './useWorkspace'
import { WorkspaceDrawer } from './components/WorkspaceDrawer'
import { ReaderPane } from './components/ReaderPane'
import { ProcessRow } from './components/ProcessRow'
import { Markdown } from './components/Markdown'

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

  const { items, running, send, newConversation } = useAgent(client, PROJECT)
  const ws = useWorkspace(client, PROJECT, connected)
  const [drawer, setDrawer] = useState(false)
  const [input, setInput] = useState('')

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    const t = input.trim()
    if (!t || running) return
    setInput('')
    await send(t)
  }

  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  async function onPickPdf(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0]
    e.target.value = '' // 允许重选同名文件
    if (!file) return
    setUploading(true)
    try {
      await client.uploadPdf(PROJECT, file)
      ws.refresh()
      setDrawer(true) // 上传后展开工作区,让用户看到刚加入的论文
    } catch { /* 失败先静默,后续接 toast */ }
    setUploading(false)
  }

  const lastItem = items[items.length - 1]
  const lastRunning = lastItem?.kind === 'process' && lastItem.running
  const showReader = ws.open != null

  return (
    <div className="app">
      <header className="titlebar">
        <span className="brand">Lumen<span className="brand-sub"> · 研究</span></span>
        <nav className="titlebar-actions">
          <button onClick={() => { newConversation(); ws.close() }}>＋ 新对话</button>
          <button>任务</button>
          <button className={drawer ? 'tb-on' : ''} onClick={() => setDrawer((v) => !v)}>工作区</button>
        </nav>
      </header>

      <div className="body">
        <main className={`chat ${showReader ? 'chat-with-reader' : ''}`}>
          <div className="messages">
            {items.length === 0 && !running && <EmptyState />}
            {items.map((it) => it.kind === 'msg'
              ? (it.role === 'assistant'
                  ? <div key={it.id} className="bubble bubble-assistant"><Markdown>{it.content}</Markdown></div>
                  : <div key={it.id} className={`bubble bubble-${it.role}`}>{it.content}</div>)
              : <ProcessRow key={it.id} block={it} />)}
            {running && !lastRunning && <div className="bubble bubble-status">思考中…</div>}
          </div>
          <form className="composer" onSubmit={onSubmit}>
            <button type="button" className="composer-attach" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? '上传中…' : '＋ PDF'}</button>
            <input ref={fileRef} type="file" accept="application/pdf" hidden onChange={onPickPdf} />
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="问点什么,或让它去研究…" disabled={running} />
            <button type="submit" className="composer-send" disabled={running || !input.trim()}>发送</button>
          </form>
        </main>

        {showReader && ws.open && <ReaderPane open={ws.open} pdfUrl={(p) => client.pdfUrl(PROJECT, p)} onClose={ws.close} />}
        {drawer && !showReader && <WorkspaceDrawer assets={ws.assets} onOpen={ws.openAsset} onClose={() => setDrawer(false)} />}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="empty">
      <div className="empty-mark">Lumen</div>
      <p className="empty-tip">问一个研究问题,或让我去检索、读 PDF、把发现整理成笔记。</p>
      <p className="empty-sub">右上「工作区」看论文与产物;「＋ PDF」上传你自己的论文。</p>
    </div>
  )
}

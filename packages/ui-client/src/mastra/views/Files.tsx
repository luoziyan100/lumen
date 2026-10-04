/**
 * [INPUT]: 带显式 scope 的文件与资料绑定 API、原生目录选择、既有 Markdown/PDF/HTML 沙箱查看器（PDF 直接消费认证 Blob）
 * [OUTPUT]: Files：原双卡工作区、完整文件/外部资料/记忆导航、只读资料绑定、相对引用与 PDF 页码阅读、复制源码/系统打开和宽度拖拽
 * [POS]: 列表和正文按身份/范围/路径绑定响应；绑定草稿独立保护迟到加载，上传限定 shared；成功阅读仅在导航变化时通知当前稿绑定，刷新不重复通知；运行时仅轮询打开正文，先用 ETag 判断版本再读取变化内容，上传整批锁定且首次失败停止
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { BackIcon, CheckIcon, CloseIcon, CopyIcon, FileTypeIcon, FolderIcon, OpenOutIcon } from '../../components/icons'
import { WorkspaceRail } from './workspace/Rail'
import { useWorkspace, type WorkspaceState } from './workspace/useWorkspace'
import './workspace/workspace.css'
export { useWorkspace } from './workspace/useWorkspace'
import { useResizable } from './chrome/useResizable'
import { Button } from '@cloudflare/kumo/components/button'
import { Select } from '@cloudflare/kumo/components/select'
import { Input } from '@cloudflare/kumo/components/input'
import { Markdown } from '../../components/Markdown'
import { PdfViewer } from '../../components/PdfViewer'
import { HtmlViewer } from '../../components/HtmlViewer'
import { MASTRA_COPY as C } from '../../copy/mastraCopy'
import { pickFolder } from '../../shell/pickFolder'
import { LumenApi, type Asset, type Identity, type FileScope, type ProjectSource } from '../data/client.ts'
import { workspaceLink, type FileTarget } from '../data/file-links'
import { saveWorkspaceFile } from '../data/download'

function SourceBinding({ api, projectId, onChanged }: { api: LumenApi; projectId: string; onChanged: () => void }) {
  const [source, setSource] = useState<ProjectSource | undefined>(), [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState<'save' | 'pick' | null>(null), [error, setError] = useState('')
  const generation = useRef(0), edits = useRef(0), dirty = useRef(false), working = useRef(false)
  async function reload() {
    const current = ++generation.current; setLoading(true); setError('')
    try {
      const next = await api.projectSource(projectId)
      if (current !== generation.current) return
      setSource(next); if (!dirty.current) setDraft(next.path ?? '')
    } catch (error) { if (current === generation.current) setError(error instanceof Error ? error.message : String(error)) }
    finally { if (current === generation.current) setLoading(false) }
  }
  useEffect(() => {
    dirty.current = false; working.current = false; edits.current++; setSource(undefined); setDraft(''); setBusy(null)
    void reload()
    return () => { generation.current++ }
  }, [api, projectId])
  function edit(value: string) { edits.current++; dirty.current = true; setDraft(value) }
  async function choose() {
    if (working.current) return
    const current = generation.current, revision = edits.current
    working.current = true; setBusy('pick')
    try { const path = await pickFolder(); if (path && current === generation.current && revision === edits.current) edit(path) }
    finally { if (current === generation.current) { working.current = false; setBusy(null) } }
  }
  async function save(path: string | null) {
    if (working.current) return
    const current = ++generation.current
    working.current = true; setBusy('save'); setLoading(false); setError('')
    try {
      const next = await api.updateProjectSource(projectId, path)
      if (current !== generation.current) return
      dirty.current = false; setSource(next); setDraft(next.path ?? ''); onChanged()
    } catch (error) { if (current === generation.current) setError(error instanceof Error ? error.message : String(error)) }
    finally { if (current === generation.current) { working.current = false; setBusy(null) } }
  }
  return <section className="mw-source" aria-label="外部资料绑定">
    <p className="mw-file-hint">{C.sourceReadOnly}</p>
    <p className="mw-file-hint">{source ? source.path ? `当前目录：${source.path}` : '尚未绑定资料目录' : loading ? '正在读取绑定…' : '无法读取当前绑定'}</p>
    <form onSubmit={event => { event.preventDefault(); if (draft.trim()) void save(draft.trim()) }}>
      <label>资料目录<Input aria-label="资料目录" placeholder="粘贴本机绝对路径" value={draft} disabled={busy === 'save'} onChange={event => edit(event.target.value)} /></label>
      <div className="mw-file-actions">
        {typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window && <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => void choose()}>选择目录</Button>}
        <Button type="submit" disabled={busy !== null || !draft.trim() || draft.trim() === source?.path}>{busy === 'save' ? '正在保存…' : '保存绑定'}</Button>
        <Button type="button" variant="ghost" disabled={busy !== null || loading || source?.path === null} onClick={() => void save(null)}>解除绑定</Button>
        <Button type="button" variant="ghost" disabled={busy !== null || loading} onClick={() => { void reload(); onChanged() }}>刷新绑定</Button>
      </div>
    </form>
    {error && <p role="alert" className="mw-error">{error}</p>}
  </section>
}

type Kind = 'pdf' | 'image' | 'html' | 'markdown' | 'text' | 'binary'
interface Document { key: string; api: LumenApi; path: string; kind: Kind; url: string; text: string; blob: Blob; etag: string | null }
const formats: [RegExp, Kind][] = [[/\.pdf$/i, 'pdf'], [/\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i, 'image'], [/\.html?$/i, 'html'], [/\.(md|markdown)$/i, 'markdown'], [/\.(txt|csv|json|ya?ml|ts|tsx|js|jsx|py|tex|bib|css|xml|log)$/i, 'text']]
function Reader({ document, page }: { document: Document; page?: number }) {
  const render = {
    pdf: () => <PdfViewer blob={document.blob} page={page} />,
    image: () => <img src={document.url} alt={document.path} />,
    html: () => <HtmlViewer html={document.text} />,
    markdown: () => document.text ? <Markdown>{document.text}</Markdown> : <p>{C.emptyFile}</p>,
    text: () => document.text ? <pre>{document.text}</pre> : <p>{C.emptyFile}</p>,
    binary: () => <p>{C.unsupported}</p>,
  }
  return render[document.kind]()
}

export function Files({ api, identity, revision, target, onClose, workspace: suppliedWorkspace, onOpenDocument }: { api: LumenApi; identity: Identity; revision: number; target?: FileTarget | null; onClose?: () => void; workspace?: WorkspaceState; onOpenDocument?: (target: FileTarget) => void }) {
  const localWorkspace = useWorkspace(api, suppliedWorkspace ? null : identity, revision)
  const workspace = suppliedWorkspace ?? localWorkspace
  const [browsing, setBrowsing] = useState(false)
  const openCallback = useRef(onOpenDocument), opened = useRef('')
  openCallback.current = onOpenDocument
  const [folder, setFolder] = useState('.'), [listing, setListing] = useState<{ key: string; api: LumenApi; entries: Asset[] } | null>(null), [path, setPath] = useState<string | null>(null)
  const [document, setDocument] = useState<Document | null>(null), [error, setError] = useState(''), [uploadError, setUploadError] = useState('')
  const loaded = useRef<Document | null>(null), uploadBusy = useRef(false)
  const [saving, setSaving] = useState(false), [copied, setCopied] = useState(false)
  const { width, handleProps } = useResizable({ edge: 'left', min: 360, max: 820, fallback: 480, storageKey: 'lumen:readerWidth' })
  const [page, setPage] = useState<number | undefined>()
  const [scope, setScope] = useState<FileScope>('task'), [refresh, setRefresh] = useState(0), [uploading, setUploading] = useState(false)
  const input = useRef<HTMLInputElement>(null), generation = useRef(0)
  const location = `${identity.projectId}:${identity.taskId}:${scope}`, listKey = `${location}:${folder}:${revision}:${refresh}`, readKey = `${location}:${path}`
  const assets = listing?.key === listKey && listing.api === api ? listing.entries : null
  const currentDocument = document?.key === readKey && document.api === api ? document : null
  useEffect(() => {
    if (!target) return
    generation.current++; setScope(target.scope); setPath(target.path); setPage(target.page)
    setFolder(target.path.includes('/') ? target.path.slice(0, target.path.lastIndexOf('/')) : '.'); setError('')
  }, [target])
  useEffect(() => () => { generation.current++ }, [api, identity.projectId, identity.taskId])
  useEffect(() => {
    let active = true; setError('')
    void api.assets(identity, folder, scope).then(result => { if (active) setListing({ key: listKey, api, entries: result.entries }) }).catch(error => { if (active) setError(String(error)) })
    return () => { active = false }
  }, [api, identity.projectId, identity.taskId, folder, scope, revision, refresh])
  useEffect(() => {
    let active = true, pending = false
    if (!path) return
    const read = async () => {
      if (pending) return
      pending = true
      try {
        const previous = loaded.current
        const result = await api.fileVersion(identity, path, scope, previous?.key === readKey && previous.api === api ? previous.etag ?? undefined : undefined)
        if (!result.blob) {
          if (active) setError('')
          return
        }
        const blob = result.blob
        const kind = formats.find(([pattern]) => pattern.test(path))?.[1] ?? 'binary'
        const text = ['markdown', 'text', 'html'].includes(kind) ? await blob.text() : ''
        if (!active) return
        const next = { key: readKey, api, path, kind, url: URL.createObjectURL(blob), text, blob, etag: result.etag }
        loaded.current = next; setDocument(next)
        setError('')
        if (opened.current !== readKey) { opened.current = readKey; openCallback.current?.({ scope, path }) }
      } catch (error) { if (active) setError(String(error)) }
      finally { pending = false }
    }
    void read()
    const timer = workspace.display?.isRunning ? window.setInterval(() => void read(), 5000) : undefined
    return () => { active = false; if (timer !== undefined) clearInterval(timer) }
  }, [api, identity.projectId, identity.taskId, path, scope, revision, refresh, workspace.display?.isRunning])
  useEffect(() => { const url = document?.url; return () => { if (url) URL.revokeObjectURL(url) } }, [document?.url])
  function changeScope(value: string | null) {
    opened.current = ''
    generation.current++; setScope(value === 'shared' || value === 'source' || value === 'memory' ? value : 'task'); setFolder('.'); setPath(null); setPage(undefined); setError('')
  }
  function navigate(nextFolder: string, nextPath: string | null = null, nextPage?: number) {
    if (!nextPath) opened.current = ''
    generation.current++; setFolder(nextFolder); setPath(nextPath); setPage(nextPage); setError('')
  }
  async function upload(files: File[]) {
    if (uploadBusy.current || !files.length) return
    const current = generation.current
    uploadBusy.current = true; setUploading(true); setUploadError('')
    try {
      for (const file of files) await api.upload(identity, file, 'shared')
      if (current === generation.current) { setFolder('.'); setPath(null) }
    } catch (error) { if (current === generation.current) setUploadError(String(error)) }
    finally {
      uploadBusy.current = false; setUploading(false)
      if (current === generation.current) { setRefresh(value => value + 1); workspace.refresh() }
    }
  }
  async function copySource() {
    if (!currentDocument?.text) return
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(currentDocument.text)
      else {
        const input = window.document.createElement('textarea'); input.value = currentDocument.text
        input.style.position = 'fixed'; input.style.opacity = '0'; window.document.body.append(input)
        try { input.select(); if (!window.document.execCommand('copy')) throw new Error('无法复制，请使用保存到本机。') } finally { input.remove() }
      }
      setCopied(true)
    } catch (error) { setError(String(error)) }
  }
  async function openFile() {
    if (!currentDocument || !path) return
    setSaving(true)
    try {
      if (isTauri()) await invoke('open_workspace_file', { ...identity, path, scope })
      else await saveWorkspaceFile(path.split('/').pop()!, currentDocument.blob)
    } catch (error) { setError(String(error)) } finally { setSaving(false) }
  }
  useEffect(() => setCopied(false), [readKey])
  const filePath = (name: string) => folder === '.' ? name : `${folder}/${name}`
  const uploadInput = <input ref={input} hidden type="file" multiple onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void upload(files) }} />
  if (!path && !browsing) return <><WorkspaceRail workspace={{ ...workspace, error: uploadError || error || workspace.error }} onOpen={asset => { setScope(asset.scope); navigate(asset.path.includes('/') ? asset.path.slice(0, asset.path.lastIndexOf('/')) : '.', asset.path) }} onBrowse={scope => { changeScope(scope); setBrowsing(true) }} onUpload={() => input.current?.click()} uploading={uploading} />{uploadInput}</>
  return <aside className={`mw-files ${path ? 'reader mw-files-open' : ''}`} style={path ? { '--reader-w': `${width}px` } as CSSProperties : undefined}>
    {path && <div className="reader-resize" role="separator" aria-orientation="vertical" aria-label="调整阅读器宽度（双击复位）" {...handleProps} />}
    <header className={path ? 'reader-head' : 'mw-files-head'}>
      <button className="icon-btn nav-icon-btn" aria-label="返回工作目录" onClick={() => { navigate(folder); setBrowsing(false) }}><BackIcon /></button>
      {path && <span className={`ws-tag ws-tag-${currentDocument?.kind === 'pdf' ? 'pdf' : currentDocument?.kind === 'html' ? 'html' : 'md'}`}>{path.split('.').pop()?.toUpperCase()}</span>}
      <strong className="reader-title" title={path ?? undefined}>{path ? path.split('/').pop() : C.workspace}</strong>
      <div className="reader-actions">{path && currentDocument && <>
        {currentDocument.text && <button className="icon-btn reader-action" aria-label={copied ? '已复制' : '复制源码'} title={copied ? '已复制' : '复制源码'} onClick={() => void copySource()}>{copied ? <CheckIcon /> : <CopyIcon />}</button>}
        <button className="icon-btn reader-action" disabled={saving} aria-label="用系统打开" title="用系统打开" onClick={() => void openFile()}><OpenOutIcon /></button>
        <Button variant="ghost" disabled={saving} onClick={() => { setSaving(true); void saveWorkspaceFile(path.split('/').pop()!, currentDocument.blob).catch(error => setError(String(error))).finally(() => setSaving(false)) }}>{C.download}</Button>
      </>}{onClose && <button className="icon-btn nav-icon-btn" aria-label="关闭工作区" onClick={onClose}><CloseIcon /></button>}</div>
    </header>
    {!path && <><Select aria-label={C.fileScope} value={scope} items={{ task: C.taskFiles, shared: C.sharedFiles, source: C.sourceFiles, memory: C.projectMemory }} onValueChange={changeScope} />
    {scope === 'source' && <SourceBinding api={api} projectId={identity.projectId} onChanged={() => { navigate('.'); setRefresh(value => value + 1) }} />}
    <div className="mw-file-actions"><Button variant="ghost" aria-label={C.refresh} onClick={() => setRefresh(value => value + 1)}>{C.refresh}</Button>
      {scope === 'shared' && <><Button disabled={uploading} variant="ghost" onClick={() => input.current?.click()}>{uploading ? C.uploading : C.attach}</Button>{uploadInput}</>}
    </div></>}
    {(uploadError || error) && <p role="alert" className="mw-error">{uploadError || error}</p>}
    {path ? <>
      {currentDocument ? <div className={`mw-reader mw-reader-${currentDocument.kind}`} onClickCapture={event => {
        const link = (event.target as Element).closest('a[href]'), next = workspaceLink(link?.getAttribute('href') ?? '', { path, scope })
        if (next) { event.preventDefault(); event.stopPropagation(); navigate(next.path.includes('/') ? next.path.slice(0, next.path.lastIndexOf('/')) : '.', next.path, next.page) }
      }}><Reader document={currentDocument} page={page} /></div> : !error && <p role="status">{C.loading}</p>}
    </> : <nav aria-label={C.workspace}>
      {folder !== '.' && <Button variant="ghost" onClick={() => navigate(folder.includes('/') ? folder.slice(0, folder.lastIndexOf('/')) : '.')}>{C.up}</Button>}
      <small>{folder}</small>{assets === null ? !error && <p role="status">{C.loading}</p> : !assets.length && <p>{C.noFiles}</p>}
      {assets?.map(asset => <Button variant="ghost" key={asset.name} onClick={() => asset.type === 'directory' ? navigate(filePath(asset.name)) : navigate(folder, filePath(asset.name))}>{asset.type === 'directory' ? <FolderIcon size={16} /> : <FileTypeIcon name={asset.name} size={16} />}<span>{asset.name}</span></Button>)}
    </nav>}
  </aside>
}

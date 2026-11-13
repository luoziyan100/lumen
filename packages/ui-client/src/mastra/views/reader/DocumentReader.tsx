/**
 * [INPUT]: LumenApi 带 ETag 的原件读取（资料库条目或主题工作区/记忆文件）、既有 Markdown/PDF/HTML 沙箱查看器
 * [OUTPUT]: DocumentReader：单文档阅读器——50px 头部（类别轮廓、材料标题占满剩余宽度真放不下才省略、铺满/还原、复制源码、系统打开（资料库条目只传 id 给原生）、保存到本机（无扩展名时按原件类型补）、关闭，全是图标按钮；
 *           头部两端可插入面板展开按钮）、PDF 按宽适配、相对链接与 PDF 页码；运行中按 ETag 低频检查版本
 * [POS]: 新外壳中间分屏的阅读器（取代 S2 的 Files 目录轨，只保留阅读部分）；不列目录、不上传
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { ArrowDownIcon, CheckIcon, CloseIcon, CollapseIcon, CopyIcon, ExpandIcon, FileGlyph, FileTypeIcon, ICON_MD, OpenOutIcon } from '../../../components/icons'
import { Markdown } from '../../../components/Markdown'
import { PdfViewer } from '../../../components/PdfViewer'
import { HtmlViewer } from '../../../components/HtmlViewer'
import { MASTRA_COPY as C } from '../../../copy/mastraCopy'
import { STUDIO_COPY as S } from '../../../copy/studioCopy'
import type { LumenApi, Identity } from '../../data/client.ts'
import { workspaceLink, type FileTarget } from '../../data/file-links'
import { saveWorkspaceFile } from '../../data/download'

export type DocumentKind = 'pdf' | 'image' | 'html' | 'markdown' | 'text' | 'binary'
interface Loaded { key: string; kind: DocumentKind; url: string; text: string; blob: Blob; etag: string | null }
const media: [RegExp, DocumentKind][] = [[/^application\/pdf$/, 'pdf'], [/^image\//, 'image'], [/^text\/html$/, 'html'], [/^text\/markdown$/, 'markdown'], [/^(text\/|application\/json)/, 'text']]
const formats: [RegExp, DocumentKind][] = [[/\.pdf$/i, 'pdf'], [/\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i, 'image'], [/\.html?$/i, 'html'], [/\.(md|markdown)$/i, 'markdown'], [/\.(txt|csv|json|ya?ml|ts|tsx|js|jsx|py|tex|bib|css|xml|log)$/i, 'text']]
/** 先看名字的扩展名，再看原件的 media type；资料库条目的路径是 id，只能靠后者。 */
export function documentKind(name: string, type: string): DocumentKind {
  return formats.find(([pattern]) => pattern.test(name))?.[1] ?? media.find(([pattern]) => pattern.test(type))?.[1] ?? 'binary'
}

const extensions: Record<string, string> = { 'application/pdf': 'pdf', 'text/plain': 'txt', 'text/markdown': 'md', 'text/html': 'html', 'application/json': 'json', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' }
/** 保存时的文件名：资料库条目显示的是论文标题，没有扩展名就按原件类型补上，免得存出无后缀文件 */
export function saveName(name: string, type: string): string {
  const extension = extensions[type.split(';')[0]!.trim().toLowerCase()]
  return extension && !name.toLowerCase().endsWith(`.${extension}`) ? `${name}.${extension}` : name
}

function View({ document, page, title }: { document: Loaded; page?: number; title: string }) {
  const render = {
    pdf: () => <PdfViewer blob={document.blob} page={page} fit />,
    image: () => <img src={document.url} alt={title} />,
    html: () => <HtmlViewer html={document.text} />,
    markdown: () => document.text ? <Markdown>{document.text}</Markdown> : <p>{C.emptyFile}</p>,
    text: () => document.text ? <pre>{document.text}</pre> : <p>{C.emptyFile}</p>,
    binary: () => <p>{C.unsupported}</p>,
  }
  return render[document.kind]()
}

/** 类别轮廓（I1）：PDF/文档/网页用文档、图片用图片，认不出的用空白文件；格式不再做文字徽标 */
function KindIcon({ kind }: { kind: DocumentKind }) {
  return kind === 'binary' ? <FileGlyph size={ICON_MD} /> : <FileTypeIcon name={kind === 'image' ? 'x.png' : 'x.pdf'} size={ICON_MD} />
}

export function DocumentReader({ api, identity, target, title, live = false, full = false, onToggleFull, leading, trailing, onClose, onNavigate }: {
  api: LumenApi
  /** 读工作区/记忆文件需要会话身份；资料库条目不需要 */
  identity: Identity | null
  target: FileTarget
  title?: string
  /** 运行中：每 5 秒按 ETag 检查一次版本 */
  live?: boolean
  /** 铺满中栏（白板隐藏但保持挂载）；没有 onToggleFull 就不显示铺满按钮 */
  full?: boolean
  onToggleFull?: () => void
  /** 头部最左 / 最右的插槽：面板收起时的展开按钮 */
  leading?: ReactNode
  trailing?: ReactNode
  onClose: () => void
  onNavigate?: (target: FileTarget) => void
}) {
  const [document, setDocument] = useState<Loaded | null>(null), [error, setError] = useState('')
  const [copied, setCopied] = useState(false), [saving, setSaving] = useState(false)
  const loaded = useRef<Loaded | null>(null)
  const key = `${target.scope}:${target.path}:${identity?.topicId ?? ''}:${identity?.taskId ?? ''}`
  const name = title ?? target.path.split('/').pop() ?? target.path
  const current = document?.key === key ? document : null
  useEffect(() => {
    let active = true, pending = false
    setError(''); setCopied(false)
    const read = async () => {
      if (pending) return
      pending = true
      try {
        if (target.scope !== 'library' && !identity) throw new Error('需要先打开一段对话才能读工作区文件')
        const previous = loaded.current?.key === key ? loaded.current : null
        const result = await api.fileVersion(identity ?? { topicId: '', taskId: '' }, target.path, target.scope, previous?.etag ?? undefined)
        if (!result.blob || !active) return
        const blob = result.blob, kind = documentKind(name, blob.type)
        const text = ['markdown', 'text', 'html'].includes(kind) ? await blob.text() : ''
        if (!active) return
        const next = { key, kind, url: URL.createObjectURL(blob), text, blob, etag: result.etag }
        loaded.current = next; setDocument(next)
      } catch (error) { if (active) setError(error instanceof Error ? error.message : String(error)) }
      finally { pending = false }
    }
    void read()
    const timer = live ? window.setInterval(() => void read(), 5000) : undefined
    return () => { active = false; if (timer !== undefined) clearInterval(timer) }
  }, [api, key, live])
  useEffect(() => { const url = document?.url; return () => { if (url) URL.revokeObjectURL(url) } }, [document?.url])

  async function copySource() {
    if (!current?.text) return
    try { await navigator.clipboard.writeText(current.text); setCopied(true) }
    catch { setError('无法复制，请改用下载。') }
  }
  async function openOutside() {
    if (!current) return
    setSaving(true)
    try {
      // 桌面里交给系统默认应用：资料库条目只给 id，路径由服务查、原生再核对；浏览器里没有系统打开，退回保存
      if (isTauri() && target.scope === 'library') await invoke('open_library_item', { itemId: target.path })
      else if (isTauri() && identity) await invoke('open_workspace_file', { ...identity, path: target.path, scope: target.scope })
      else await saveWorkspaceFile(saveName(name, current.blob.type), current.blob)
    } catch (error) { setError(String(error)) } finally { setSaving(false) }
  }
  return <section className="studio-pane studio-reader" aria-label={name}>
    <header className="studio-head reader-head">
      {leading}
      {current && <span className="reader-icon"><KindIcon kind={current.kind} /></span>}
      <h2 className="studio-head-title reader-title" title={name}>{name}</h2>
      <div className="reader-actions">
        {onToggleFull && <button className="icon-btn reader-action reader-full" aria-label={full ? S.reader.restore : S.reader.full} aria-pressed={full} title={full ? S.reader.restore : S.reader.full} onClick={onToggleFull}>{full ? <CollapseIcon /> : <ExpandIcon />}</button>}
        {current?.text && <button className="icon-btn reader-action" aria-label={copied ? S.reader.copied : S.reader.copy} title={copied ? S.reader.copied : S.reader.copy} onClick={() => void copySource()}>{copied ? <CheckIcon /> : <CopyIcon />}</button>}
        {current && <button className="icon-btn reader-action" disabled={saving} aria-label={S.reader.open} title={S.reader.open} onClick={() => void openOutside()}><OpenOutIcon /></button>}
        {current && <button className="icon-btn reader-action" disabled={saving} aria-label={C.download} title={C.download} onClick={() => { setSaving(true); void saveWorkspaceFile(saveName(name, current.blob.type), current.blob).catch(error => setError(String(error))).finally(() => setSaving(false)) }}><ArrowDownIcon /></button>}
        <button className="icon-btn reader-action" aria-label={S.reader.close} title={S.reader.close} onClick={onClose}><CloseIcon /></button>
      </div>
      {trailing}
    </header>
    {error && <p role="alert" className="mw-error">{error}</p>}
    {current ? <div className={`mw-reader mw-reader-${current.kind}`} onClickCapture={event => {
      const link = (event.target as Element).closest('a[href]'), next = workspaceLink(link?.getAttribute('href') ?? '', target)
      if (next && onNavigate && target.scope !== 'library') { event.preventDefault(); event.stopPropagation(); onNavigate(next) }
    }}><View document={current} page={target.page} title={name} /></div> : !error && <p role="status">{C.loading}</p>}
  </section>
}

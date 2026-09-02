/**
 * [INPUT]: OpenAsset;pdfUrl;projectId/taskId;Kumo Tooltip;Markdown/Pdf/Html 三查看器
 * [OUTPUT]: ReaderPane —— 右分屏阅读器;顶栏复制源码 + 系统打开(Claude artifact 形)
 * [POS]: components/ 阅读器壳;动作合同在 shell/workspaceFile.ts;打开走 openWorkspaceFile
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useState, type CSSProperties } from 'react'
import { Tooltip } from '@cloudflare/kumo/components/tooltip'
import { useKumoToastManager } from '@cloudflare/kumo/components/toast'
import type { OpenAsset } from '../useWorkspace'
import { READER_COPY } from '../copy/appCopy'
import { openWorkspaceFile } from '../openExternal'
import { readerCanCopy, readerCopyText } from '../shell/workspaceFile'
import { PdfViewer } from './PdfViewer'
import { HtmlViewer } from './HtmlViewer'
import { Markdown } from './Markdown'
import { BackIcon, CheckIcon, CopyIcon, OpenOutIcon } from './icons'
import { useResizable } from '../shell/useResizable'

const TAG: Record<OpenAsset['kind'], { cls: string; text: string }> = {
  pdf: { cls: 'pdf', text: 'PDF' },
  html: { cls: 'html', text: 'HTML' },
  doc: { cls: 'md', text: 'MD' },
}

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

function openLabel(kind: OpenAsset['kind']): string {
  if (kind === 'html') return READER_COPY.openHtml
  if (kind === 'doc') return READER_COPY.openMd
  return READER_COPY.openPdf
}

function copyLabel(kind: OpenAsset['kind']): string {
  return kind === 'html' ? READER_COPY.copyHtml : READER_COPY.copyMd
}

export function ReaderPane({ open, projectId, taskId, pdfUrl, onClose }: {
  open: OpenAsset
  projectId: string
  taskId?: string | null
  pdfUrl: (path: string) => string
  onClose: () => void
}) {
  const tag = TAG[open.kind]
  const toast = useKumoToastManager()
  const [copied, setCopied] = useState(false)
  const { width, handleProps } = useResizable({ edge: 'left', min: 360, max: 820, fallback: 480, storageKey: 'lumen:readerWidth' })
  const source = readerCopyText(open.kind, open.content)
  const canCopy = readerCanCopy(open.kind) && Boolean(source)

  async function onCopy(): Promise<void> {
    if (source == null) return
    try {
      await copyText(source)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      toast.add({ variant: 'error', title: READER_COPY.copyFailed })
    }
  }

  async function onOpen(): Promise<void> {
    try {
      await openWorkspaceFile({
        projectId,
        path: open.path,
        taskId,
        fallbackHtml: open.kind === 'html' ? open.content : undefined,
        fallbackName: open.name,
      })
    } catch (err) {
      toast.add({
        variant: 'error',
        title: READER_COPY.openFailed,
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  return (
    <section className="reader" style={{ '--reader-w': `${width}px` } as CSSProperties}>
      <div className="reader-resize" role="separator" aria-orientation="vertical" aria-label="调整阅读器宽度(双击复位)" title="拖拽调宽 · 双击复位" {...handleProps} />
      <header className="reader-head">
        <Tooltip content="返回对话" render={
          <button className="icon-btn nav-icon-btn reader-back" aria-label="返回对话" onClick={onClose}>
            <BackIcon />
          </button>
        } />
        <span className={`ws-tag ws-tag-${tag.cls}`}>{tag.text}</span>
        <span className="reader-title">{open.name}</span>
        <div className="reader-actions">
          {canCopy ? (
            <Tooltip content={copied ? READER_COPY.copied : copyLabel(open.kind)} render={
              <button
                type="button"
                className={`icon-btn reader-action${copied ? ' is-copied' : ''}`}
                aria-label={copied ? READER_COPY.copied : copyLabel(open.kind)}
                onClick={() => { void onCopy() }}
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
              </button>
            } />
          ) : null}
          <Tooltip content={openLabel(open.kind)} render={
            <button
              type="button"
              className="icon-btn reader-action"
              aria-label={openLabel(open.kind)}
              onClick={() => { void onOpen() }}
            >
              <OpenOutIcon />
            </button>
          } />
        </div>
      </header>
      {open.kind === 'pdf' ? (
        <PdfViewer url={pdfUrl(open.path)} />
      ) : open.kind === 'html' ? (
        <div className="reader-body html-body"><HtmlViewer html={open.content ?? ''} /></div>
      ) : (
        <article className="reader-body doc-view"><Markdown>{open.content ?? ''}</Markdown></article>
      )}
    </section>
  )
}

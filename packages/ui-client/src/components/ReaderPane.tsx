/** 阅读器分屏:doc 显示 .md 衬线正文;pdf 走 pdf.js(缩放/选择/复制);html 走沙箱 iframe 预览。 */
import type { CSSProperties } from 'react'
import { Tooltip } from '@cloudflare/kumo/components/tooltip'
import type { OpenAsset } from '../useWorkspace'
import { PdfViewer } from './PdfViewer'
import { HtmlViewer } from './HtmlViewer'
import { Markdown } from './Markdown'
import { BackIcon } from './icons'
import { useResizable } from '../useResizable'

const TAG: Record<OpenAsset['kind'], { cls: string; text: string }> = {
  pdf: { cls: 'pdf', text: 'PDF' },
  html: { cls: 'html', text: 'HTML' },
  doc: { cls: 'md', text: 'MD' },
}

export function ReaderPane({ open, pdfUrl, onClose }: {
  open: OpenAsset; pdfUrl: (path: string) => string; onClose: () => void
}) {
  const tag = TAG[open.kind]
  const { width, handleProps } = useResizable({ edge: 'left', min: 360, max: 820, fallback: 480, storageKey: 'lumen:readerWidth' })
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

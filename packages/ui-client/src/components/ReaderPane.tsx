/** 阅读器分屏:doc 显示 .md 衬线正文;pdf 在 P2 接 pdf.js,此处先占位。 */
import type { OpenAsset } from '../useWorkspace'

export function ReaderPane({ open, pdfUrl, onClose }: {
  open: OpenAsset; pdfUrl: (path: string) => string; onClose: () => void
}) {
  return (
    <section className="reader">
      <header className="reader-head">
        <button className="reader-back" onClick={onClose}>← 返回对话</button>
        <span className={`ws-tag ws-tag-${open.kind === 'pdf' ? 'pdf' : 'md'}`}>{open.kind === 'pdf' ? 'PDF' : 'MD'}</span>
        <span className="reader-title">{open.name}</span>
      </header>
      {open.kind === 'pdf'
        ? <div className="reader-body reader-pdf-todo">
            <p className="t-body-sm">PDF 渲染将在 P2 接入 pdf.js。原件 URL 已就绪:</p>
            <code className="t-mono">{pdfUrl(open.path)}</code>
          </div>
        : <article className="reader-body t-read doc-view">{open.content}</article>}
    </section>
  )
}

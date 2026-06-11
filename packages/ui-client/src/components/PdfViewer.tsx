/** PDF 渲染 + 分页。pdf.js 锁 4.10.38(v5 在 WebKit/Tauri 下 ESM 加载不工作)。 */
import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy } from 'pdfjs-dist'

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

export function PdfViewer({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(1)

  useEffect(() => {
    let cancelled = false
    setDoc(null)
    setPage(1)
    const task = pdfjs.getDocument(url)
    task.promise.then((d) => { if (!cancelled) setDoc(d) }).catch(() => {})
    return () => { cancelled = true; void task.destroy() }
  }, [url])

  useEffect(() => {
    if (!doc) return
    let cancelled = false
    void doc.getPage(page).then((pg) => {
      const canvas = canvasRef.current
      if (cancelled || !canvas) return
      const viewport = pg.getViewport({ scale: 1.5 })
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.width = viewport.width
      canvas.height = viewport.height
      void pg.render({ canvasContext: ctx, viewport })
    })
    return () => { cancelled = true }
  }, [doc, page])

  const total = doc?.numPages ?? 0
  return (
    <div className="pdf-viewer">
      <div className="pdf-bar">
        <button className="pdf-nav" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹</button>
        <span className="t-mono">{page} / {total || '…'}</span>
        <button className="pdf-nav" disabled={page >= total} onClick={() => setPage((p) => Math.min(total, p + 1))}>›</button>
      </div>
      <div className="pdf-stage"><canvas ref={canvasRef} className="pdf-canvas" /></div>
    </div>
  )
}

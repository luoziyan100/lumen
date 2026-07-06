/** PDF 竖向连续滚动渲染。pdf.js 锁 4.10.38(v5 在 WebKit/Tauri 下 ESM 加载不工作)。
 *  必须配 cMapUrl + standardFontDataUrl(资产从 pdfjs-dist 复制到 public/pdfjs/):否则内嵌 CJK/
 *  标准字体(如中文译本的 FandolSong)渲染为空白——poppler 能渲、pdf.js 不配就渲不出(2026-07-06 踩过)。 */
import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy } from 'pdfjs-dist'

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

// 打包(Tauri)与 dev 都从站点根取:public/pdfjs/* → /pdfjs/*
const CMAP_URL = '/pdfjs/cmaps/'
const STD_FONTS_URL = '/pdfjs/standard_fonts/'

export function PdfViewer({ url }: { url: string }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  useEffect(() => {
    let cancelled = false
    setDoc(null)
    const task = pdfjs.getDocument({ url, cMapUrl: CMAP_URL, cMapPacked: true, standardFontDataUrl: STD_FONTS_URL })
    task.promise.then((d) => { if (!cancelled) setDoc(d) }).catch(() => {})
    return () => { cancelled = true; void task.destroy() }
  }, [url])

  if (!doc) return <div className="pdf-scroll pdf-loading">载入中…</div>
  return (
    <div className="pdf-scroll">
      {Array.from({ length: doc.numPages }, (_, i) => (
        <PdfPage key={i + 1} doc={doc} pageNumber={i + 1} />
      ))}
    </div>
  )
}

/** 单页:进入视口才渲染(IntersectionObserver 懒渲染),避免大论文一次渲染所有页。
 *  .pdf-page 始终带 aspect-ratio(渲染前 A4 估值,渲染后真实尺寸),canvas 填满它——
 *  不依赖 canvas 的 height:auto(canvas 不像 <img> 那样按 intrinsic ratio 撑高)。 */
function PdfPage({ doc, pageNumber }: { doc: PDFDocumentProxy; pageNumber: number }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(pageNumber <= 2) // 前两页直接渲染,余下懒加载
  const [size, setSize] = useState({ w: 918, h: 1188 }) // A4@scale1.5 估值;渲染后更新为真实尺寸

  useEffect(() => {
    if (visible) return
    const el = wrapRef.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect() }
    }, { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [visible])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    void doc.getPage(pageNumber).then((pg) => {
      const canvas = canvasRef.current
      if (cancelled || !canvas) return
      const viewport = pg.getViewport({ scale: 1.5 })
      setSize({ w: viewport.width, h: viewport.height })
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.width = viewport.width
      canvas.height = viewport.height
      void pg.render({ canvasContext: ctx, viewport })
    })
    return () => { cancelled = true }
  }, [doc, pageNumber, visible])

  return (
    <div ref={wrapRef} className="pdf-page" style={{ aspectRatio: `${size.w} / ${size.h}` }}>
      {visible && <canvas ref={canvasRef} className="pdf-canvas" />}
    </div>
  )
}

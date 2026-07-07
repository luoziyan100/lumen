/** PDF 竖向连续滚动渲染 + 可选文本层 + 缩放。pdf.js 锁 4.10.38(v5 在 WebKit/Tauri 下 ESM 加载不工作)。
 *  必须配 cMapUrl + standardFontDataUrl(资产从 pdfjs-dist 复制到 public/pdfjs/):否则内嵌 CJK/
 *  标准字体(如中文译本的 FandolSong)渲染为空白——poppler 能渲、pdf.js 不配就渲不出(2026-07-06 踩过)。
 *
 *  选择/复制:canvas 之上叠 pdf.js 的 TextLayer(透明可选文本)。对齐关键——TextLayer 的
 *  setLayerDimensions 用 `calc(var(--scale-factor) * pageWidth)` 定尺寸,故 .pdf-page 必须带
 *  `--scale-factor: scale`,且 canvas 显示尺寸 = viewport(=scale×页尺寸),两层才严丝合缝。
 *  缩放:scale 提为状态,+/- 重渲 canvas 与文本层;retina 用 devicePixelRatio 放大画布保持锐利。 */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import * as pdfjs from 'pdfjs-dist'
import { TextLayer } from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

// 打包(Tauri)与 dev 都从站点根取:public/pdfjs/* → /pdfjs/*
const CMAP_URL = '/pdfjs/cmaps/'
const STD_FONTS_URL = '/pdfjs/standard_fonts/'
const MIN_SCALE = 0.6
const MAX_SCALE = 3
const STEP = 0.2
const clampScale = (s: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(s * 100) / 100))

export function PdfViewer({ url }: { url: string }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [scale, setScale] = useState(1.3)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setDoc(null)
    const task = pdfjs.getDocument({ url, cMapUrl: CMAP_URL, cMapPacked: true, standardFontDataUrl: STD_FONTS_URL })
    task.promise.then((d) => { if (!cancelled) setDoc(d) }).catch(() => {})
    return () => { cancelled = true; void task.destroy() }
  }, [url])

  // 触控板双指捏合 / Ctrl+滚轮 = 缩放(浏览器把捏合发成带 ctrlKey 的 wheel);普通滚轮照常滚动
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey) return
      e.preventDefault()
      setScale((s) => clampScale(Math.round((s - e.deltaY * 0.01) / 0.05) * 0.05))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [doc])

  const zoom = (d: number): void => setScale((s) => clampScale(s + d))

  if (!doc) return <div className="pdf-scroll pdf-loading">载入中…</div>
  return (
    <div className="pdf-scroll" ref={scrollRef}>
      <div className="pdf-toolbar" role="toolbar" aria-label="缩放">
        <button className="pdf-zoom-btn" onClick={() => zoom(-STEP)} aria-label="缩小" disabled={scale <= MIN_SCALE}>−</button>
        <span className="pdf-zoom-val" aria-live="polite">{Math.round(scale * 100)}%</span>
        <button className="pdf-zoom-btn" onClick={() => zoom(STEP)} aria-label="放大" disabled={scale >= MAX_SCALE}>+</button>
      </div>
      <div className="pdf-pages">
        {Array.from({ length: doc.numPages }, (_, i) => (
          <PdfPage key={i + 1} doc={doc} pageNumber={i + 1} scale={scale} />
        ))}
      </div>
    </div>
  )
}

/** 单页:进入视口才渲染(IntersectionObserver 懒渲染),避免大论文一次渲染所有页。
 *  .pdf-page 尺寸=viewport(scale×页尺寸)并带 --scale-factor;canvas 与 textLayer 各填满、精确重叠。 */
function PdfPage({ doc, pageNumber, scale }: { doc: PDFDocumentProxy; pageNumber: number; scale: number }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(pageNumber <= 2) // 前两页直接渲染,余下懒加载
  const [size, setSize] = useState({ w: 612 * scale, h: 792 * scale }) // Letter 估值;渲染后更新为真实尺寸

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
    let renderTask: ReturnType<PDFPageProxy['render']> | null = null
    let textLayer: TextLayer | null = null
    doc.getPage(pageNumber).then(async (pg) => {
      if (cancelled) return
      const dpr = globalThis.devicePixelRatio || 1
      const viewport = pg.getViewport({ scale })
      setSize({ w: viewport.width, h: viewport.height })
      const canvas = canvasRef.current
      const textDiv = textRef.current
      if (!canvas || !textDiv) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      renderTask = pg.render({ canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined })
      textDiv.replaceChildren() // 缩放重渲时清掉上一档文本
      const textContent = await pg.getTextContent()
      if (cancelled) return
      textLayer = new TextLayer({ textContentSource: textContent, container: textDiv, viewport })
      await textLayer.render()
      await renderTask.promise.catch(() => {})
    }).catch(() => {})
    return () => { cancelled = true; renderTask?.cancel(); textLayer?.cancel() }
  }, [doc, pageNumber, visible, scale])

  return (
    <div ref={wrapRef} className="pdf-page" style={{ width: size.w, height: size.h, '--scale-factor': scale } as CSSProperties}>
      {visible && (
        <>
          <canvas ref={canvasRef} className="pdf-canvas" />
          <div ref={textRef} className="textLayer" />
        </>
      )}
    </div>
  )
}

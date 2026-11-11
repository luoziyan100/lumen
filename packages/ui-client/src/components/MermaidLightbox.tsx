/**
 * [INPUT]: 已 tighten 的 final SVG;mermaidZoom 算术;mermaidMeasureHost.tightenSvgInk
 * [OUTPUT]: MermaidLightbox —— 流程图放大层(± 钮、滚轮/触控板缩放、双指缩放、单指拖移、Esc 关闭)
 * [POS]: MermaidBlock 的放大视图;只消费 SVG 字符串,不参与渲染或缓存
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon, ICON_SM, ZoomInIcon, ZoomOutIcon } from './icons'
import { tightenSvgInk } from '../mermaid/mermaidMeasureHost'
import { clampZoom, panBy, panForZoom, sizeFromViewBox, wheelZoomFactor, zoomByFactor, zoomByStep, ZOOM_MAX, ZOOM_MIN } from '../mermaid/mermaidZoom'

export function MermaidLightbox({ svg, onClose }: { svg: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null)
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null)
  const pointersRef = useRef(new Set<number>())
  const bodyRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(1)
  const panRef = useRef({ x: 0, y: 0 })
  const closeRef = useRef(onClose)
  zoomRef.current = zoom
  panRef.current = pan
  closeRef.current = onClose

  useLayoutEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const svgEl = bodyRef.current?.querySelector('svg')
    if (svgEl) tightenSvgInk(svgEl)
    if (svgEl && svgEl.getBoundingClientRect().width < 8) {
      const vb = svgEl.viewBox.baseVal
      const box = sizeFromViewBox(
        vb?.width ?? 0,
        vb?.height ?? 0,
        Math.min(window.innerWidth * 0.9, 1200),
        Math.min(window.innerHeight * 0.78, 860),
      )
      if (box.w > 0 && box.h > 0) {
        svgEl.setAttribute('width', String(box.w))
        svgEl.setAttribute('height', String(box.h))
        svgEl.style.width = `${box.w}px`
        svgEl.style.height = `${box.h}px`
      }
    }

    const el = bodyRef.current
    let gestureBase = 1
    function applyFactor(factor: number, clientX: number, clientY: number): void {
      if (!bodyRef.current) return
      const rect = bodyRef.current.getBoundingClientRect()
      const origin = { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 }
      const z = zoomRef.current
      const next = zoomByFactor(z, factor)
      const p = panForZoom(panRef.current, z, next, origin)
      zoomRef.current = next
      panRef.current = p
      setZoom(next)
      setPan(p)
    }
    function onWheel(e: WheelEvent): void {
      e.preventDefault()
      applyFactor(wheelZoomFactor(e.deltaY), e.clientX, e.clientY)
    }
    function onGestureStart(e: Event): void {
      e.preventDefault()
      gestureBase = zoomRef.current
    }
    function onGestureChange(e: Event): void {
      e.preventDefault()
      const ge = e as Event & { scale?: number; clientX?: number; clientY?: number }
      const scale = typeof ge.scale === 'number' ? ge.scale : 1
      const next = clampZoom(gestureBase * scale)
      const factor = zoomRef.current > 0 ? next / zoomRef.current : 1
      applyFactor(factor, ge.clientX ?? 0, ge.clientY ?? 0)
    }
    function touchDist(touches: TouchList): number {
      const a = touches.item(0)
      const b = touches.item(1)
      if (!a || !b) return 0
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    }
    function onPointerDown(e: PointerEvent): void {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      pointersRef.current.add(e.pointerId)
      if (pointersRef.current.size >= 2) {
        dragRef.current = null
        el?.classList.remove('is-panning')
        return
      }
      dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
      try { el?.setPointerCapture(e.pointerId) } catch { /* 捕获失败仍可用 move */ }
      el?.classList.add('is-panning')
    }
    function onPointerMove(e: PointerEvent): void {
      const drag = dragRef.current
      if (!drag || drag.id !== e.pointerId || pointersRef.current.size !== 1 || pinchRef.current) return
      e.preventDefault()
      const next = panBy(panRef.current, e.clientX - drag.x, e.clientY - drag.y)
      dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
      panRef.current = next
      setPan(next)
    }
    function onPointerUp(e: PointerEvent): void {
      pointersRef.current.delete(e.pointerId)
      if (dragRef.current?.id === e.pointerId) dragRef.current = null
      if (pointersRef.current.size === 0) el?.classList.remove('is-panning')
    }
    function onTouchStart(e: TouchEvent): void {
      if (e.touches.length !== 2) return
      dragRef.current = null
      el?.classList.remove('is-panning')
      pinchRef.current = { dist: touchDist(e.touches), zoom: zoomRef.current }
    }
    function onTouchMove(e: TouchEvent): void {
      if (e.touches.length !== 2 || !pinchRef.current || pinchRef.current.dist <= 0) return
      e.preventDefault()
      const a = e.touches.item(0)
      const b = e.touches.item(1)
      if (!a || !b) return
      const target = clampZoom(pinchRef.current.zoom * (touchDist(e.touches) / pinchRef.current.dist))
      const factor = zoomRef.current > 0 ? target / zoomRef.current : 1
      applyFactor(factor, (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2)
    }
    function onTouchEnd(): void {
      pinchRef.current = null
    }
    el?.addEventListener('wheel', onWheel, { passive: false })
    el?.addEventListener('gesturestart', onGestureStart as EventListener, { passive: false })
    el?.addEventListener('gesturechange', onGestureChange as EventListener, { passive: false })
    el?.addEventListener('pointerdown', onPointerDown)
    el?.addEventListener('pointermove', onPointerMove, { passive: false })
    el?.addEventListener('pointerup', onPointerUp)
    el?.addEventListener('pointercancel', onPointerUp)
    el?.addEventListener('touchstart', onTouchStart, { passive: true })
    el?.addEventListener('touchmove', onTouchMove, { passive: false })
    el?.addEventListener('touchend', onTouchEnd)
    el?.addEventListener('touchcancel', onTouchEnd)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      el?.classList.remove('is-panning')
      el?.removeEventListener('wheel', onWheel)
      el?.removeEventListener('gesturestart', onGestureStart as EventListener)
      el?.removeEventListener('gesturechange', onGestureChange as EventListener)
      el?.removeEventListener('pointerdown', onPointerDown)
      el?.removeEventListener('pointermove', onPointerMove)
      el?.removeEventListener('pointerup', onPointerUp)
      el?.removeEventListener('pointercancel', onPointerUp)
      el?.removeEventListener('touchstart', onTouchStart)
      el?.removeEventListener('touchmove', onTouchMove)
      el?.removeEventListener('touchend', onTouchEnd)
      el?.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [])

  return createPortal(
    <div className="mermaid-lightbox" role="dialog" aria-modal="true" aria-label="流程图放大" onClick={onClose}>
      <div className="mermaid-lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="mermaid-tool" title="放大" aria-label="放大" disabled={zoom >= ZOOM_MAX} onClick={() => setZoom((z) => zoomByStep(z, 1))}>
          <ZoomInIcon size={ICON_SM} />
        </button>
        <button type="button" className="mermaid-tool" title="缩小" aria-label="缩小" disabled={zoom <= ZOOM_MIN} onClick={() => setZoom((z) => zoomByStep(z, -1))}>
          <ZoomOutIcon size={ICON_SM} />
        </button>
        <button type="button" className="mermaid-tool" title="关闭" aria-label="关闭" onClick={onClose}>
          <CloseIcon size={ICON_SM} />
        </button>
      </div>
      <div ref={bodyRef} className="mermaid-lightbox-body" onClick={(e) => e.stopPropagation()}>
        <div
          className="mermaid-lightbox-stage"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>,
    document.body,
  )
}

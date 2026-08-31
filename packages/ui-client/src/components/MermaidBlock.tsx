/**
 * [INPUT]: mermaid; mermaidSyntax prepareAndValidate; mermaidSanitize 颜色; mermaidMeasureHost
 * [OUTPUT]: MermaidBlock —— ```mermaid → 已 tighten 的 final SVG 一次进入主流; 放大 + 复制源码; 失败源码 + Phase B 修复
 * [POS]: Markdown language-mermaid 分支; doc/mermaid-pipeline.md S4′ Phase A/B;
 *        可读性见 doc/mermaid-readability.md。主流只允许 source 与 final-svg(或 source/error)。
 * [PROTOCOL]: 变更时更新此头部与 doc/mermaid-pipeline.md / doc/mermaid-readability.md
 *
 * 管线: prepare(语法+颜色) → 同源 parse → 箱外 render/tighten → 一次提交 final SVG。
 * 复制始终用模型原文; 展示像素用改写稿。会话内 hash@宽度 缓存已 tighten 结果。
 * 卡片右上角只留放大/复制;放大层 ± / 双指缩放 / 单指拖移。
 * flowchart 优先官方 ELK(失败回 dagre);SVG 禁止 style.width=100% 拉伸;
 * 缓存 SVG 只带固有几何,卡片横滚与 lightbox fit 由宿主 CSS 决定。
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { glassMermaidThemeVariables } from '../mermaid/mermaidSanitize'
import { mermaidMetrics, prepareAndValidate } from '../mermaid/mermaidSyntax'
import {
  cacheHoldsFinalSvg,
  createMermaidMeasureHost,
  mermaidLayoutCacheKey,
  tightenSvgInHost,
  tightenSvgInk,
} from '../mermaid/mermaidMeasureHost'
import { MERMAID_COPY } from '../copy/appCopy'
import { CheckIcon, CloseIcon, CopyIcon, ExpandIcon, ICON_SM, ZoomInIcon, ZoomOutIcon } from './icons'
import { ensureElkLayout, mermaidInitializeOptions } from '../mermaid/mermaidLayout'
import { clampZoom, panBy, panForZoom, sizeFromViewBox, wheelZoomFactor, zoomByFactor, zoomByStep, ZOOM_MAX, ZOOM_MIN } from '../mermaid/mermaidZoom'
import { scrollDebugLog } from '../scroll/scrollDebug'
import type { MermaidTracePhase } from '../scroll/scrollDebug'

type CacheEntry = {
  svg: string | null
  error: string | null
  detail: string | null
  prepared: string
  tightened?: boolean
  repaired?: boolean
  columnWidth?: number
}

/** 会话内内存缓存：原文 hash@宽度桶 → 已 tighten 的渲染结果（不落库） */
const renderCache = new Map<string, CacheEntry>()

function hashSource(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

function readThemeVars(el: HTMLElement): Record<string, string> {
  const cs = getComputedStyle(el)
  const base = glassMermaidThemeVariables()
  const v = (name: string, fallback: string): string =>
    (cs.getPropertyValue(name).trim() || fallback)
  return {
    ...base,
    primaryColor: v('--ember-tint', base.primaryColor!),
    primaryTextColor: v('--ink', base.primaryTextColor!),
    primaryBorderColor: v('--ember', base.primaryBorderColor!),
    secondaryColor: v('--paper-deep', base.secondaryColor!),
    secondaryTextColor: v('--ink-mute', base.secondaryTextColor!),
    secondaryBorderColor: v('--sand-deep', base.secondaryBorderColor!),
    tertiaryColor: v('--vellum', base.tertiaryColor!),
    tertiaryTextColor: v('--ink', base.tertiaryTextColor!),
    tertiaryBorderColor: v('--sand', base.tertiaryBorderColor!),
    lineColor: v('--ink-mute', base.lineColor!),
    textColor: v('--ink', base.textColor!),
    mainBkg: v('--paper-solid', base.mainBkg!),
    nodeBorder: v('--sand-deep', base.nodeBorder!),
    clusterBkg: v('--paper-deep', base.clusterBkg!),
    clusterBorder: v('--sand-deep', base.clusterBorder!),
    titleColor: v('--ink', base.titleColor!),
    edgeLabelBackground: v('--paper-deep', base.edgeLabelBackground!),
    fontFamily: v('--font-sans', base.fontFamily!),
  }
}

function logMermaid(
  tag: 'mermaid-phase' | 'mermaid-measure',
  phase: MermaidTracePhase,
  el: HTMLElement | null,
  extra: { key?: string; note?: string } = {},
): void {
  const r = el?.getBoundingClientRect()
  scrollDebugLog(tag, {
    trigger: tag === 'mermaid-measure' ? 'animation-frame' : 'layout-effect',
    mermaidPhase: phase,
    mermaidKey: extra.key,
    rectTop: r?.top,
    rectHeight: r?.height,
    note: extra.note,
  })
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

export function MermaidBlock({
  chart,
  onRepair,
}: {
  chart: string
  /** Phase B:把原文+错误交给后端单次修图;返回修正 body */
  onRepair?: (source: string, error: string) => Promise<string>
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const reactId = useId().replace(/:/g, '')
  const original = chart.trim()
  const [colW, setColW] = useState(0)
  const layoutKey = original && colW > 0
    ? mermaidLayoutCacheKey(hashSource(original), colW)
    : ''
  const cached0 = layoutKey ? renderCache.get(layoutKey) : undefined
  const cachedFinal = cached0 && cacheHoldsFinalSvg(cached0) ? cached0 : undefined
  const [svg, setSvg] = useState<string | null>(() => cachedFinal?.svg ?? null)
  const [error, setError] = useState<string | null>(() => cached0?.error ?? null)
  const [detail, setDetail] = useState<string | null>(() => cached0?.detail ?? null)
  const [showDetail, setShowDetail] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null)
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null)
  const pointersRef = useRef(new Set<number>())
  const lightboxBodyRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(1)
  const panRef = useRef({ x: 0, y: 0 })
  zoomRef.current = zoom
  panRef.current = pan
  const [copied, setCopied] = useState(false)
  const [renderSource, setRenderSource] = useState(original)
  const [repairing, setRepairing] = useState(false)
  const [repairFailed, setRepairFailed] = useState(false)
  const [repairedHint, setRepairedHint] = useState(() => Boolean(cachedFinal?.repaired))
  const [triedRepair, setTriedRepair] = useState(() => Boolean(cachedFinal?.repaired))

  useLayoutEffect(() => {
    const el = hostRef.current
    if (!el) return
    const apply = (): void => {
      const w = el.clientWidth
      if (w > 0) setColW(w)
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [original, svg, error])

  useEffect(() => {
    setRenderSource(original)
    setRepairFailed(false)
    const hit = layoutKey ? renderCache.get(layoutKey) : undefined
    setTriedRepair(Boolean(hit?.repaired))
    setRepairedHint(Boolean(hit?.repaired))
  }, [original, layoutKey])

  useEffect(() => {
    if (!renderSource) {
      setSvg(null)
      setError(null)
      setDetail(null)
      return
    }
    if (colW <= 0) return
    let cancelled = false
    const key = mermaidLayoutCacheKey(hashSource(original || renderSource), colW)
    const cached = renderCache.get(key)
    const skipCache = renderSource !== original && !cached?.repaired
    if (cached && cacheHoldsFinalSvg(cached) && !skipCache) {
      setSvg(cached.svg)
      setError(cached.error)
      setDetail(cached.detail)
      setRepairedHint(Boolean(cached.repaired))
      logMermaid('mermaid-phase', 'final-svg', hostRef.current, { key, note: 'cache' })
      return
    }
    if (cached?.error && !skipCache) {
      setSvg(null)
      setError(cached.error)
      setDetail(cached.detail)
      logMermaid('mermaid-phase', 'source/error', hostRef.current, { key, note: 'cache' })
      return
    }

    let host: ReturnType<typeof createMermaidMeasureHost> | null = null
    ;(async () => {
      try {
        const mermaid = (await import('mermaid')).default
        const themeEl = hostRef.current
          ?? document.querySelector('.messages-content') as HTMLElement | null
          ?? document.documentElement
        const themeVariables = readThemeVars(themeEl)
        const elkReady = await ensureElkLayout(mermaid)
        mermaid.initialize(mermaidInitializeOptions(themeVariables, elkReady))

        const validated = await prepareAndValidate(renderSource, async (src) => {
          await mermaid.parse(src)
        })
        if (cancelled) return

        if (!validated.ok) {
          const entry: CacheEntry = {
            svg: null,
            error: validated.error,
            detail: validated.detail,
            prepared: validated.source,
            columnWidth: colW,
          }
          renderCache.set(key, entry)
          setSvg(null)
          setError(validated.error)
          setDetail(validated.detail)
          if (renderSource !== original) setRepairFailed(true)
          logMermaid('mermaid-phase', 'source/error', hostRef.current, { key })
          return
        }

        const id = `mmd-${reactId}-${Math.random().toString(36).slice(2, 8)}`
        const { svg: raw } = await mermaid.render(id, validated.source)
        if (cancelled) return
        logMermaid('mermaid-measure', 'raw-svg', null, { key, note: 'off-flow host' })
        host = createMermaidMeasureHost(colW)
        logMermaid('mermaid-measure', 'tightening', host.root, { key, note: 'off-flow host' })
        const final = tightenSvgInHost(host.root, raw)
        host.dispose()
        host = null
        if (cancelled) return
        const repaired = renderSource !== original
        const entry: CacheEntry = {
          svg: final.svg,
          error: null,
          detail: null,
          prepared: validated.source,
          tightened: true,
          repaired,
          columnWidth: colW,
        }
        if (!cacheHoldsFinalSvg(entry)) return
        renderCache.set(key, entry)
        setSvg(final.svg)
        setError(null)
        setDetail(null)
        setRepairedHint(repaired)
        requestAnimationFrame(() => {
          if (cancelled) return
          logMermaid('mermaid-phase', 'final-svg', hostRef.current, { key })
        })
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : '流程图渲染失败'
        const entry: CacheEntry = {
          svg: null,
          error: msg.length > 160 ? `${msg.slice(0, 157)}…` : msg,
          detail: msg,
          prepared: renderSource,
          columnWidth: colW,
        }
        renderCache.set(key, entry)
        setSvg(null)
        setError(entry.error)
        setDetail(entry.detail)
        logMermaid('mermaid-phase', 'source/error', hostRef.current, { key })
      } finally {
        host?.dispose()
      }
    })()
    return () => {
      cancelled = true
      host?.dispose()
    }
  }, [original, renderSource, reactId, colW])

  useLayoutEffect(() => {
    if (!expanded) return
    setZoom(1)
    setPan({ x: 0, y: 0 })
    pinchRef.current = null
    dragRef.current = null
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const svgEl = lightboxBodyRef.current?.querySelector('svg')
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

    const el = lightboxBodyRef.current
    let gestureBase = 1
    function applyFactor(factor: number, clientX: number, clientY: number): void {
      if (!lightboxBodyRef.current) return
      const stage = lightboxBodyRef.current
      const rect = stage.getBoundingClientRect()
      const origin = {
        x: clientX - rect.left - rect.width / 2,
        y: clientY - rect.top - rect.height / 2,
      }
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
  }, [expanded])

  async function onCopy(): Promise<void> {
    await copyText(original)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  async function onTryRepair(): Promise<void> {
    if (!onRepair || !error || repairing || triedRepair) return
    setRepairing(true)
    setRepairFailed(false)
    setTriedRepair(true)
    mermaidMetrics.bump('llm_repair_attempt')
    try {
      const fixed = (await onRepair(original, error)).trim()
      if (!fixed) throw new Error('empty')
      mermaidMetrics.bump('llm_repair_ok')
      renderCache.delete(mermaidLayoutCacheKey(hashSource(original), colW))
      setRenderSource(fixed)
    } catch {
      setRepairFailed(true)
    } finally {
      setRepairing(false)
    }
  }

  const toolbar = (
    <div className="mermaid-toolbar" role="toolbar" aria-label="流程图操作">
      {svg && !error ? (
        <button type="button" className="mermaid-tool" title="放大查看" aria-label="放大查看" onClick={() => setExpanded(true)}>
          <ExpandIcon size={ICON_SM} />
        </button>
      ) : null}
      <button
        type="button"
        className={`mermaid-tool${copied ? ' is-copied' : ''}`}
        title={copied ? '已复制' : '复制源码'}
        aria-label={copied ? '已复制' : '复制源码'}
        onClick={() => { void onCopy() }}
      >
        {copied ? <CheckIcon size={ICON_SM} /> : <CopyIcon size={ICON_SM} />}
      </button>
    </div>
  )

  if (!svg && !error) {
    return (
      <div ref={hostRef} className="mermaid-source-slot">
        <pre>
          <code className="language-mermaid">{original}</code>
        </pre>
      </div>
    )
  }

  return (
    <div
      ref={hostRef}
      className="mermaid-block"
      role="img"
      aria-label="流程图"
    >
      {toolbar}
      <div className="mermaid-scroll">
        {error ? (
          <div className="mermaid-fallback">
            <div className="mermaid-error" role="alert">{error}</div>
            {detail && detail !== error ? (
              <button
                type="button"
                className="mermaid-error-detail-toggle"
                onClick={() => setShowDetail((v) => !v)}
              >
                {showDetail ? '收起详情' : '详情'}
              </button>
            ) : null}
            {showDetail && detail ? (
              <pre className="mermaid-error-detail"><code>{detail}</code></pre>
            ) : null}
            {onRepair && (!triedRepair || repairing) ? (
              <button
                type="button"
                className="mermaid-repair"
                disabled={repairing}
                onClick={() => { void onTryRepair() }}
              >
                {repairing ? MERMAID_COPY.repairing : MERMAID_COPY.repair}
              </button>
            ) : null}
            {repairFailed ? (
              <p className="mermaid-repaired-hint">{MERMAID_COPY.repairFailed}</p>
            ) : null}
            <pre className="mermaid-source"><code>{original}</code></pre>
          </div>
        ) : null}
        {!error && svg ? (
          <>
            {repairedHint ? (
              <p className="mermaid-repaired-hint">{MERMAID_COPY.repairedHint}</p>
            ) : null}
            <div className="mermaid-svg" dangerouslySetInnerHTML={{ __html: svg }} />
          </>
        ) : null}
      </div>

      {expanded && svg && createPortal(
        <div
          className="mermaid-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="流程图放大"
          onClick={() => setExpanded(false)}
        >
          <div className="mermaid-lightbox-bar" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="mermaid-tool"
              title="放大"
              aria-label="放大"
              disabled={zoom >= ZOOM_MAX}
              onClick={() => setZoom((z) => zoomByStep(z, 1))}
            >
              <ZoomInIcon size={ICON_SM} />
            </button>
            <button
              type="button"
              className="mermaid-tool"
              title="缩小"
              aria-label="缩小"
              disabled={zoom <= ZOOM_MIN}
              onClick={() => setZoom((z) => zoomByStep(z, -1))}
            >
              <ZoomOutIcon size={ICON_SM} />
            </button>
            <button type="button" className="mermaid-tool" title="关闭" aria-label="关闭" onClick={() => setExpanded(false)}>
              <CloseIcon size={ICON_SM} />
            </button>
          </div>
          <div
            ref={lightboxBodyRef}
            className="mermaid-lightbox-body"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="mermaid-lightbox-stage"
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

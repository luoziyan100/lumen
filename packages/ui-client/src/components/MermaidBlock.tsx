/**
 * [INPUT]: mermaid; mermaidSyntax prepareAndValidate; mermaidSanitize 颜色; icons
 * [OUTPUT]: MermaidBlock —— ```mermaid → SVG; 放大 + 复制源码; 短错误降级; 可选 Phase B 尝试修复
 * [POS]: Markdown language-mermaid 分支; doc/mermaid-pipeline.md S4′ Phase A/B;
 *        可读性(停拉伸+官方 ELK)见 doc/mermaid-readability.md
 * [PROTOCOL]: 变更时更新此头部与 doc/mermaid-pipeline.md / doc/mermaid-readability.md
 *
 * 管线: prepare(语法+颜色) → 同源 parse → render。
 * 复制始终用模型原文; 展示像素用改写稿。会话内 hash 缓存 parse/render 结果。
 * 卡片右上角只留放大/复制;放大层 ± / 双指缩放 / 单指拖移。
 * 方向 LR/TB 尊重源码,宿主只做 getBBox 收紧虚高(mermaid#1984),不改写横竖。
 * lockMinH 写入 renderCache,remount 首帧不塌;tighten 只做一次。
 * flowchart 优先官方 ELK(失败回 dagre);SVG 禁止 style.width=100% 拉伸。
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { glassMermaidThemeVariables } from '../mermaidSanitize'
import { mermaidMetrics, prepareAndValidate } from '../mermaidSyntax'
import { MERMAID_COPY } from '../appCopy'
import { CheckIcon, CloseIcon, CopyIcon, ExpandIcon, ICON_SM, ZoomInIcon, ZoomOutIcon } from './icons'
import { applySvgHostSize, ensureElkLayout, mermaidInitializeOptions } from '../mermaidLayout'
import { clampZoom, panBy, panForZoom, sizeFromViewBox, viewBoxFromBBox, wheelZoomFactor, zoomByFactor, zoomByStep, ZOOM_MAX, ZOOM_MIN } from '../mermaidZoom'

type CacheEntry = {
  svg: string | null
  error: string | null
  detail: string | null
  prepared: string
  lockMinH?: number
  repaired?: boolean
}

/** 会话内内存缓存：原文 hash → 渲染结果（不落库） */
const renderCache = new Map<string, CacheEntry>()

function hashSource(s: string): string {
  // FNV-1a 32-bit
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

/** 与 .mermaid-block padding-top+bottom 对齐,minHeight 含 padding(border-box) */
const BLOCK_CHROME = 56

function inkBox(svg: SVGSVGElement): { x: number; y: number; width: number; height: number } | null {
  try {
    const base = svg.getBBox()
    let x = base.x
    let y = base.y
    let r = base.x + base.width
    let b = base.y + base.height
    svg.querySelectorAll('foreignObject, text, .node, .cluster, .edgeLabel').forEach((n) => {
      try {
        const bb = (n as SVGGraphicsElement).getBBox()
        if (!(bb.width > 0) || !(bb.height > 0)) return
        x = Math.min(x, bb.x)
        y = Math.min(y, bb.y)
        r = Math.max(r, bb.x + bb.width)
        b = Math.max(b, bb.y + bb.height)
      } catch { /* 未插入布局的节点 getBBox 会抛 */ }
    })
    return { x, y, width: r - x, height: b - y }
  } catch {
    return null
  }
}

/** 按墨迹收紧 viewBox,卡片高度跟图走,不跟 mermaid 虚高 viewBox 走 */
function tightenSvgInk(svg: SVGSVGElement): void {
  if (svg.dataset.inkTight === '1') return
  const box = inkBox(svg)
  const vb = box ? viewBoxFromBBox(box) : null
  if (vb) {
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`)
    svg.setAttribute('width', String(Math.round(vb.w)))
    svg.setAttribute('height', String(Math.round(vb.h)))
  }
  applySvgHostSize(svg)
  svg.dataset.inkTight = '1'
}

function measureSvgHeight(host: HTMLElement | null): number {
  const svg = host?.querySelector('.mermaid-svg svg') as SVGSVGElement | null
  if (!svg) return 0
  tightenSvgInk(svg)
  const h = svg.getBoundingClientRect().height
  return h > 0 ? Math.ceil(h) + BLOCK_CHROME : 0
}

function persistLockMinH(
  key: string,
  h: number,
  setLockMinH: (updater: (prev: number) => number) => void,
): void {
  setLockMinH((prev) => {
    const next = prev > 0 ? Math.max(prev, h) : h
    const entry = renderCache.get(key)
    if (entry) entry.lockMinH = next
    return next
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
  // 同步读缓存:避免 remount 首帧 pending 把 ~3.5k 图塌成占位(V1 contentH 振荡)
  const cached0 = original ? renderCache.get(hashSource(original)) : undefined
  const [svg, setSvg] = useState<string | null>(() => cached0?.svg ?? null)
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
  const [pending, setPending] = useState(() => Boolean(original) && !cached0)
  /** 只锁「量过的 SVG 高 + 工具条」,禁止用行数估 560 把图顶在空白上方 */
  const [lockMinH, setLockMinH] = useState(() => cached0?.lockMinH ?? 0)
  const [renderSource, setRenderSource] = useState(original)
  const [repairing, setRepairing] = useState(false)
  const [repairFailed, setRepairFailed] = useState(false)
  const [repairedHint, setRepairedHint] = useState(() => Boolean(cached0?.repaired))
  const [triedRepair, setTriedRepair] = useState(() => Boolean(cached0?.repaired))

  useEffect(() => {
    setRenderSource(original)
    setRepairFailed(false)
    setTriedRepair(Boolean(renderCache.get(hashSource(original))?.repaired))
    setRepairedHint(Boolean(renderCache.get(hashSource(original))?.repaired))
  }, [original])

  useEffect(() => {
    if (!renderSource) {
      setSvg(null)
      setError(null)
      setDetail(null)
      setPending(false)
      setLockMinH(0)
      return
    }
    let cancelled = false
    const key = hashSource(original || renderSource)
    const cached = renderCache.get(key)
    const skipCache = renderSource !== original && !cached?.repaired
    if (cached && !skipCache) {
      setSvg(cached.svg)
      setError(cached.error)
      setDetail(cached.detail)
      setRepairedHint(Boolean(cached.repaired))
      setPending(false)
      requestAnimationFrame(() => {
        if (cancelled) return
        const h = measureSvgHeight(hostRef.current)
        if (h > 0) persistLockMinH(key, h, setLockMinH)
      })
      return
    }

    setPending(true)
    setError(null)
    setDetail(null)
    setSvg(null)
    ;(async () => {
      try {
        const mermaid = (await import('mermaid')).default
        const host = hostRef.current
        const themeVariables = host ? readThemeVars(host) : glassMermaidThemeVariables()
        const elkReady = await ensureElkLayout(mermaid)
        mermaid.initialize(mermaidInitializeOptions(themeVariables, elkReady))

        const validated = await prepareAndValidate(renderSource, (src) => mermaid.parse(src))
        if (cancelled) return

        if (!validated.ok) {
          const entry: CacheEntry = {
            svg: null,
            error: validated.error,
            detail: validated.detail,
            prepared: validated.source,
          }
          renderCache.set(key, entry)
          setSvg(null)
          setError(validated.error)
          setDetail(validated.detail)
          if (renderSource !== original) setRepairFailed(true)
          setPending(false)
          return
        }

        const id = `mmd-${reactId}-${Math.random().toString(36).slice(2, 8)}`
        const { svg: out } = await mermaid.render(id, validated.source)
        if (cancelled) return
        const repaired = renderSource !== original
        const entry: CacheEntry = {
          svg: out,
          error: null,
          detail: null,
          prepared: validated.source,
          repaired,
        }
        renderCache.set(key, entry)
        setSvg(out)
        setError(null)
        setDetail(null)
        setRepairedHint(repaired)
        setPending(false)
        requestAnimationFrame(() => {
          if (cancelled) return
          const h = measureSvgHeight(hostRef.current)
          if (h > 0) persistLockMinH(key, h, setLockMinH)
        })
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : '流程图渲染失败'
        const entry: CacheEntry = {
          svg: null,
          error: msg.length > 160 ? `${msg.slice(0, 157)}…` : msg,
          detail: msg,
          prepared: renderSource,
        }
        renderCache.set(key, entry)
        setSvg(null)
        setError(entry.error)
        setDetail(entry.detail)
        setPending(false)
      }
    })()
    return () => { cancelled = true }
  }, [original, renderSource, reactId])

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
      renderCache.delete(hashSource(original))
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

  return (
    <div
      ref={hostRef}
      className="mermaid-block"
      role="img"
      aria-label="流程图"
      style={lockMinH > 0 ? { minHeight: lockMinH } : undefined}
    >
      {toolbar}
      <div className="mermaid-scroll">
        {pending ? (
          <div className="mermaid-pending" aria-busy="true">正在绘制…</div>
        ) : null}
        {!pending && error ? (
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
        {!pending && !error && svg ? (
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

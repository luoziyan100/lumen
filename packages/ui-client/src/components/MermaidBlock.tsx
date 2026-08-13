/**
 * [INPUT]: mermaid; mermaidSyntax prepareAndValidate; mermaidSanitize 颜色; icons
 * [OUTPUT]: MermaidBlock —— ```mermaid → SVG; 放大 + 复制源码; 短错误降级
 * [POS]: Markdown language-mermaid 分支; doc/mermaid-pipeline.md S4′ Phase A
 * [PROTOCOL]: 变更时更新此头部与 doc/mermaid-pipeline.md
 *
 * 管线: prepare(语法+颜色) → 同源 parse → render。
 * 复制始终用模型原文; 展示像素用改写稿。会话内 hash 缓存 parse/render 结果。
 * 工具条只留放大/复制,高度跟 SVG 走,禁止预估 minHeight 把图画在大空白顶上。
 */
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { glassMermaidThemeVariables } from '../mermaidSanitize'
import { prepareAndValidate } from '../mermaidSyntax'
import { CheckIcon, CloseIcon, CopyIcon, ExpandIcon, ICON_SM } from './icons'

type CacheEntry = {
  svg: string | null
  error: string | null
  detail: string | null
  prepared: string
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

function measureSvgHeight(host: HTMLElement | null): number {
  const svg = host?.querySelector('.mermaid-svg svg') as SVGSVGElement | null
  if (!svg) return 0
  svg.style.maxWidth = '100%'
  svg.style.height = 'auto'
  svg.style.width = '100%'
  const h = svg.getBoundingClientRect().height
  return h > 0 ? Math.ceil(h) + BLOCK_CHROME : 0
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

export function MermaidBlock({ chart }: { chart: string }) {
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
  const [copied, setCopied] = useState(false)
  const [pending, setPending] = useState(() => Boolean(original) && !cached0)
  /** 只锁「量过的 SVG 高 + 工具条」,禁止用行数估 560 把图顶在空白上方 */
  const [lockMinH, setLockMinH] = useState(0)

  useEffect(() => {
    if (!original) {
      setSvg(null)
      setError(null)
      setDetail(null)
      setPending(false)
      setLockMinH(0)
      return
    }
    let cancelled = false
    const key = hashSource(original)
    const cached = renderCache.get(key)
    if (cached) {
      setSvg(cached.svg)
      setError(cached.error)
      setDetail(cached.detail)
      setPending(false)
      requestAnimationFrame(() => {
        if (cancelled) return
        const h = measureSvgHeight(hostRef.current)
        if (h > 0) setLockMinH(h)
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
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'dark',
          darkMode: true,
          themeVariables,
          fontFamily: themeVariables.fontFamily,
          flowchart: { useMaxWidth: true, htmlLabels: true, padding: 8 },
        })

        const validated = await prepareAndValidate(original, (src) => mermaid.parse(src))
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
          setPending(false)
          return
        }

        const id = `mmd-${reactId}-${Math.random().toString(36).slice(2, 8)}`
        const { svg: out } = await mermaid.render(id, validated.source)
        if (cancelled) return
        const entry: CacheEntry = {
          svg: out,
          error: null,
          detail: null,
          prepared: validated.source,
        }
        renderCache.set(key, entry)
        setSvg(out)
        setError(null)
        setDetail(null)
        setPending(false)
        requestAnimationFrame(() => {
          if (cancelled) return
          const h = measureSvgHeight(hostRef.current)
          if (h > 0) setLockMinH(h)
        })
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : '流程图渲染失败'
        const entry: CacheEntry = {
          svg: null,
          error: msg.length > 160 ? `${msg.slice(0, 157)}…` : msg,
          detail: msg,
          prepared: original,
        }
        renderCache.set(key, entry)
        setSvg(null)
        setError(entry.error)
        setDetail(entry.detail)
        setPending(false)
      }
    })()
    return () => { cancelled = true }
  }, [original, reactId])

  useEffect(() => {
    if (!expanded) return
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [expanded])

  async function onCopy(): Promise<void> {
    await copyText(original)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
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
            <pre className="mermaid-source"><code>{original}</code></pre>
          </div>
        ) : null}
        {!pending && !error && svg ? (
          <div className="mermaid-svg" dangerouslySetInnerHTML={{ __html: svg }} />
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
            <span className="mermaid-lightbox-title">流程图</span>
            <button type="button" className="mermaid-tool" title="复制源码" aria-label="复制源码" onClick={() => { void onCopy() }}>
              {copied ? <CheckIcon size={ICON_SM} /> : <CopyIcon size={ICON_SM} />}
            </button>
            <button type="button" className="mermaid-tool" title="关闭" aria-label="关闭" onClick={() => setExpanded(false)}>
              <CloseIcon size={ICON_SM} />
            </button>
          </div>
          <div
            className="mermaid-lightbox-body"
            onClick={(e) => e.stopPropagation()}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>,
        document.body,
      )}
    </div>
  )
}

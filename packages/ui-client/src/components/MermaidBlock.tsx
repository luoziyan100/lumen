/**
 * [INPUT]: mermaid; mermaidSyntax prepareAndValidate; mermaidTheme 宿主调色板; mermaidMeasureHost; MermaidLightbox
 * [OUTPUT]: MermaidBlock —— ```mermaid → 已 tighten 的 final SVG 一次进入主流; 放大 + 复制源码;
 *           失败显示源码,可选「请模型修正」把原图与错误作为普通消息发回当前会话(去重由提供方按会话 × 原文裁决)
 * [POS]: Markdown language-mermaid 分支;合同见 doc/mermaid.md。主流只允许 source 与 final-svg(或 source/error)。
 * [PROTOCOL]: 变更时更新此头部与 doc/mermaid.md
 *
 * 管线: 语法修补 → 宿主颜色裁决 → 同源 parse → 箱外 render/tighten → 一次提交 final SVG。
 * 复制始终用模型原文; 展示像素用改写稿。缓存键 = 原文 hash@列宽桶@主题签名,换皮肤即重画;缓存 LRU 64 条。
 * 无障碍:外层 figure 承载工具栏与失败卡(按钮、alert 可达),role=img 只给 SVG 本身;名称只出现一次。
 * 渲染期只读缓存(不改 LRU 顺序),命中时由 effect 更新顺序。
 * mermaid.initialize 是全局状态,initialize+parse+render 串行执行,避免并发图互相覆盖配置。
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { prepareAndValidate } from '../mermaid/mermaidSyntax'
import { getMermaidPalette, mermaidThemeVariables, paletteSignature, subscribeMermaidPalette } from '../mermaid/mermaidTheme'
import { cacheHoldsFinalSvg, createMermaidMeasureHost, mermaidLayoutCacheKey, tightenSvgInHost } from '../mermaid/mermaidMeasureHost'
import { ensureElkLayout, mermaidInitializeOptions } from '../mermaid/mermaidLayout'
import { MERMAID_COPY } from '../copy/appCopy'
import type { MermaidFix } from '../mermaid/mermaidFixLedger'
import { CheckIcon, CopyIcon, ExpandIcon, ICON_SM } from './icons'
import { MermaidLightbox } from './MermaidLightbox'
import { scrollDebugLog } from '../scroll/scrollDebug'
import type { MermaidTracePhase } from '../scroll/scrollDebug'

type CacheEntry = { svg: string | null; error: string | null; detail: string | null; tightened?: boolean }

/** 内存缓存(不落库):Map 保持插入序,读时移到队尾,超过上限淘汰最久未用 */
const RENDER_CACHE_LIMIT = 64
const renderCache = new Map<string, CacheEntry>()
function cacheGet(key: string): CacheEntry | undefined {
  const entry = renderCache.get(key)
  if (entry) { renderCache.delete(key); renderCache.set(key, entry) }
  return entry
}
function cacheSet(key: string, entry: CacheEntry): void {
  renderCache.delete(key)
  renderCache.set(key, entry)
  while (renderCache.size > RENDER_CACHE_LIMIT) renderCache.delete(renderCache.keys().next().value!)
}
/** 测试用:当前缓存条数 */
export function mermaidRenderCacheSize(): number { return renderCache.size }

let renderQueue: Promise<unknown> = Promise.resolve()
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = renderQueue.then(task, task)
  renderQueue = run.catch(() => undefined)
  return run
}

const noSubscribe = () => () => {}

function hashSource(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

function logMermaid(tag: 'mermaid-phase' | 'mermaid-measure', phase: MermaidTracePhase, el: HTMLElement | null, extra: { key?: string; note?: string } = {}): void {
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
  fix,
}: {
  chart: string
  /** 失败时把原图与解析错误交给当前会话;阅读器等无会话处不传 */
  fix?: MermaidFix
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const reactId = useId().replace(/:/g, '')
  const original = chart.trim()
  const palette = useSyncExternalStore(subscribeMermaidPalette, getMermaidPalette)
  const theme = paletteSignature(palette)
  const [colW, setColW] = useState(0)
  const key = original && colW > 0 ? `${mermaidLayoutCacheKey(hashSource(original), colW)}@${hashSource(theme)}` : ''
  const cached0 = key ? renderCache.get(key) : undefined
  const [svg, setSvg] = useState<string | null>(() => (cached0 && cacheHoldsFinalSvg(cached0) ? cached0.svg : null))
  const [error, setError] = useState<string | null>(() => cached0?.error ?? null)
  const [detail, setDetail] = useState<string | null>(() => cached0?.detail ?? null)
  const [showDetail, setShowDetail] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const askedFix = useSyncExternalStore(fix?.subscribe ?? noSubscribe, () => fix?.asked(original) ?? false)

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
    if (!original) {
      setSvg(null)
      setError(null)
      setDetail(null)
      return
    }
    if (!key) return
    let cancelled = false
    const show = (entry: CacheEntry, note?: string) => {
      setSvg(entry.svg)
      setError(entry.error)
      setDetail(entry.detail)
      logMermaid('mermaid-phase', entry.error ? 'source/error' : 'final-svg', hostRef.current, { key, note })
    }
    const cached = cacheGet(key)
    if (cached && (cacheHoldsFinalSvg(cached) || cached.error)) {
      show(cached, 'cache')
      return
    }

    let host: ReturnType<typeof createMermaidMeasureHost> | null = null
    void serialized(async () => {
      if (cancelled) return
      try {
        const mermaid = (await import('mermaid')).default
        const elkReady = await ensureElkLayout(mermaid)
        mermaid.initialize(mermaidInitializeOptions(mermaidThemeVariables(palette), elkReady))
        const validated = await prepareAndValidate(original, palette, async (src) => { await mermaid.parse(src) })
        if (cancelled) return
        if (!validated.ok) {
          const entry: CacheEntry = { svg: null, error: validated.error, detail: validated.detail }
          cacheSet(key, entry)
          show(entry)
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
        const entry: CacheEntry = { svg: final.svg, error: null, detail: null, tightened: true }
        cacheSet(key, entry)
        show(entry)
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : '流程图渲染失败'
        const entry: CacheEntry = { svg: null, error: msg.length > 160 ? `${msg.slice(0, 157)}…` : msg, detail: msg }
        cacheSet(key, entry)
        show(entry)
      } finally {
        host?.dispose()
      }
    })
    return () => {
      cancelled = true
      host?.dispose()
    }
  }, [original, key, reactId, colW, palette])

  async function onCopy(): Promise<void> {
    await copyText(original)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

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
    <div ref={hostRef} className="mermaid-block" role="figure" aria-label={svg && !error ? undefined : '流程图'}>
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
      <div className="mermaid-scroll">
        {error ? (
          <div className="mermaid-fallback">
            <div className="mermaid-error" role="alert">{error}</div>
            {detail && detail !== error ? (
              <button type="button" className="mermaid-error-detail-toggle" onClick={() => setShowDetail((v) => !v)}>
                {showDetail ? '收起详情' : '详情'}
              </button>
            ) : null}
            {showDetail && detail ? <pre className="mermaid-error-detail"><code>{detail}</code></pre> : null}
            {fix ? (
              <button
                type="button"
                className="mermaid-ask-fix"
                disabled={askedFix}
                onClick={() => fix.ask(original, detail ?? error)}
              >
                {askedFix ? MERMAID_COPY.askedFix : MERMAID_COPY.askFix}
              </button>
            ) : null}
            <pre className="mermaid-source"><code>{original}</code></pre>
          </div>
        ) : null}
        {!error && svg ? <div className="mermaid-svg" role="img" aria-label="流程图" dangerouslySetInnerHTML={{ __html: svg }} /> : null}
      </div>
      {expanded && svg ? <MermaidLightbox svg={svg} onClose={() => setExpanded(false)} /> : null}
    </div>
  )
}

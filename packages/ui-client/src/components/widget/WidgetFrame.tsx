/**
 * [INPUT]: receiver/sanitize;宿主 onSendMessage;青瓷 CSS 变量
 * [OUTPUT]: WidgetFrame —— 沙箱 iframe + 高度同步(策略见 height.ts)
 * [POS]: widget/ 渲染核心;被 AssistantContent 与 HtmlViewer 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 *
 * 高度铁律见 height.ts:终态可收缩,否则进出阅读器后底部留白。
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  WIDGET_FINALIZE,
  WIDGET_LINK,
  WIDGET_READY,
  WIDGET_RESIZE,
  WIDGET_SEND,
  WIDGET_THEME,
  WIDGET_UPDATE,
  buildReceiverSrcdoc,
  collectThemeVars,
} from './receiver'
import { sanitizeForIframe, sanitizeForStreaming, truncateOpenScript } from './sanitize'
import { nextWidgetHeight } from './height'

const heightCache = new Map<string, number>()
const UPDATE_DEBOUNCE_MS = 120
const MIN_H = 48
const MAX_H = 2400

function cacheKey(code: string): string {
  return code.slice(0, 200)
}

export function WidgetFrame({
  widgetCode,
  title,
  isStreaming,
  showOverlay,
  onSendMessage,
  fillHeight,
}: {
  widgetCode: string
  title?: string
  isStreaming: boolean
  showOverlay?: boolean
  onSendMessage?: (text: string) => void
  /** 阅读器等满高场景:iframe 吃满容器,不跟内容高度收缩 */
  fillHeight?: boolean
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const readyRef = useRef(false)
  const firstResizeRef = useRef(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onSendRef = useRef(onSendMessage)
  onSendRef.current = onSendMessage

  const initial = heightCache.get(cacheKey(widgetCode)) ?? (fillHeight ? undefined : 120)
  const [height, setHeight] = useState<number | undefined>(initial)
  const [skipTransition, setSkipTransition] = useState(true)

  const isDark = typeof window !== 'undefined'
    && window.matchMedia('(prefers-color-scheme: dark)').matches

  // 挂载时写 srcdoc(只一次)
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const vars = collectThemeVars(document.documentElement)
    const styleBlock = Object.entries(vars).map(([k, v]) => `${k}:${v};`).join('')
    const rootStyle = `:root{${styleBlock}}`
    readyRef.current = false
    firstResizeRef.current = true
    iframe.srcdoc = buildReceiverSrcdoc(rootStyle, isDark)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // postMessage 监听
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const iframe = iframeRef.current
      if (!iframe || e.source !== iframe.contentWindow || !e.data) return
      switch (e.data.type) {
        case WIDGET_READY:
          readyRef.current = true
          pushContent(iframe, widgetCode, isStreaming)
          break
        case WIDGET_RESIZE: {
          if (fillHeight) break
          const h = typeof e.data.height === 'number' ? e.data.height : null
          if (h == null || !Number.isFinite(h)) break
          const clamped = Math.max(MIN_H, Math.min(Math.ceil(h), MAX_H))
          const first = firstResizeRef.current || Boolean(e.data.first)
          if (first) firstResizeRef.current = false
          setHeight((prev) => {
            const next = nextWidgetHeight(prev, clamped, { streaming: isStreaming, first })
            heightCache.set(cacheKey(widgetCode), next)
            return next
          })
          if (first) {
            setSkipTransition(true)
            requestAnimationFrame(() => setSkipTransition(false))
          }
          break
        }
        case WIDGET_LINK:
          if (typeof e.data.href === 'string') window.open(e.data.href, '_blank', 'noopener,noreferrer')
          break
        case WIDGET_SEND:
          if (typeof e.data.text === 'string') onSendRef.current?.(e.data.text)
          break
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [widgetCode, isStreaming, fillHeight])

  // 宿主栏宽变化(开/关阅读器)→ 内容重排高度会变;请 receiver 再报一次
  // iframe 内 ResizeObserver 通常会跟,但 WebKit 偶发不抬;主动 ping 更稳
  useEffect(() => {
    if (fillHeight) return
    const body = iframeRef.current?.parentElement
    if (!body || typeof ResizeObserver === 'undefined') return
    let lastW = body.clientWidth
    const ro = new ResizeObserver(() => {
      const w = body.clientWidth
      if (Math.abs(w - lastW) < 2) return
      lastW = w
      const win = iframeRef.current?.contentWindow
      if (!win || !readyRef.current) return
      // 复用已装内容触发 _h:发一个空 theme 乒乓不如再 finalize 当前码轻
      win.postMessage({ type: WIDGET_THEME, vars: collectThemeVars(document.documentElement), isDark }, '*')
    })
    ro.observe(body)
    return () => ro.disconnect()
  }, [fillHeight, isDark])

  // 内容变化 → update / finalize
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe || !readyRef.current) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (isStreaming) {
      debounceRef.current = setTimeout(() => pushContent(iframe, widgetCode, true), UPDATE_DEBOUNCE_MS)
    } else {
      pushContent(iframe, widgetCode, false)
    }
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [widgetCode, isStreaming])

  // 主题变化推送
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow || !readyRef.current) return
    const vars = collectThemeVars(document.documentElement)
    iframe.contentWindow.postMessage({ type: WIDGET_THEME, vars, isDark }, '*')
  }, [isDark])

  const style: CSSProperties = fillHeight
    ? { height: '100%', width: '100%' }
    : {
        height: height ?? 120,
        width: '100%',
        transition: skipTransition ? undefined : 'height 0.2s ease',
      }

  return (
    <div
      className={`widget-frame${showOverlay ? ' widget-frame-loading' : ''}${fillHeight ? ' widget-frame-fill' : ''}`}
      data-title={title || undefined}
    >
      {title ? <div className="widget-frame-title">{title}</div> : null}
      <div className="widget-frame-body">
        <iframe
          ref={iframeRef}
          className="widget-iframe"
          title={title || '可视化'}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          style={style}
          onLoad={() => {
            // ready 竞态兜底:receiver 已发过 ready 时再推一次
            if (iframeRef.current) {
              readyRef.current = true
              pushContent(iframeRef.current, widgetCode, isStreaming)
            }
          }}
        />
        {showOverlay ? <div className="widget-frame-overlay" aria-hidden>正在为可视化添加交互动画</div> : null}
      </div>
    </div>
  )
}

function pushContent(iframe: HTMLIFrameElement, widgetCode: string, streaming: boolean): void {
  const win = iframe.contentWindow
  if (!win) return
  if (streaming) {
    const { html, truncated } = truncateOpenScript(widgetCode)
    void truncated
    win.postMessage({ type: WIDGET_UPDATE, html: sanitizeForStreaming(html) }, '*')
  } else {
    win.postMessage({ type: WIDGET_FINALIZE, html: sanitizeForIframe(widgetCode) }, '*')
  }
}

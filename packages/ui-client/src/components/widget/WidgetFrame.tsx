/**
 * [INPUT]: receiver/sanitize;宿主 onSendMessage/onEscape;collectThemeVars/hostChromeIsDark;MODEL_TEXT.widgetSend(回发的消息带小实验标记)
 * [OUTPUT]: WidgetFrame —— 沙箱 iframe + 高度同步(策略见 height.ts);
 *           WIDGET_DIAG 常挂 data-widget-diag,可见条默认隐藏(localStorage lumen:widgetDiag=1 打开);
 *           finalize 前 hoistInlineScripts(内联→lumenwidget: src);同代同内容只推送一次;
 *           params(宿主已校验的参数值)随 finalize 送入、变化时另发 WIDGET_PARAMS,单向不回读;onRuntimeError:finalize 后 RUNTIME_ERROR_MS 内的首个 error 诊断
 * [POS]: widget/ 渲染核心;被 AssistantContent 与 HtmlViewer 消费;
 *       暗壳内容岛浅档 + color-scheme:light,防 WKWebView 洗灰;
 *       fillHeight(阅读器)经 THEME.fillHeight 开岛内滚动,对话跟高仍 overflow:hidden;
 *       light(白板区块)固定浅档,不吃系统暗色
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 *
 * 高度铁律见 height.ts:终态可收缩,否则进出阅读器后底部留白。
 * iframe 用同源 /widget-receiver.html(非 srcdoc),避开父 CSP 继承掐死 bootstrap。
 */
import { useT } from '../../i18n/index.ts'
import { MODEL_TEXT } from '../../i18n/locales/model.ts'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  WIDGET_DIAG,
  WIDGET_ESCAPE,
  WIDGET_FINALIZE,
  WIDGET_LINK,
  WIDGET_PARAMS,
  WIDGET_READY,
  WIDGET_RESIZE,
  WIDGET_SEND,
  WIDGET_THEME,
  WIDGET_UPDATE,
} from './receiver'
import { collectThemeVars, hostChromeIsDark } from './themeVars'
import { sanitizeForIframe, sanitizeForStreaming, truncateOpenScript } from './sanitize'
import { hoistInlineScripts, putWidgetScript } from './hoistScripts'
import { nextWidgetHeight } from './height'

function receiverUrl(): string {
  const base = import.meta.env.BASE_URL || '/'
  return `${base.endsWith('/') ? base : `${base}/`}widget-receiver.html`
}

const heightCache = new Map<string, number>()
const UPDATE_DEBOUNCE_MS = 120
const MIN_H = 48
/** A runtime error this soon after the receiver finalized counts as the widget failing to start */
export const RUNTIME_ERROR_MS = 3000
const MAX_H = 2400

type ContentPushState = {
  iframe: HTMLIFrameElement | null
  key: string
  token: number
  nextToken: number
}

/** 走查仪表可见性:产品默认隐藏,验收时 localStorage.setItem('lumen:widgetDiag','1') 打开 */
function diagBarEnabled(): boolean {
  try {
    return localStorage.getItem('lumen:widgetDiag') === '1'
  } catch {
    return false
  }
}

function cacheKey(code: string): string {
  return code.slice(0, 200)
}

export function WidgetFrame({
  widgetCode,
  title,
  isStreaming,
  showOverlay,
  onSendMessage,
  onEscape,
  fillHeight,
  light,
  params,
  onRuntimeError,
}: {
  widgetCode: string
  title?: string
  isStreaming: boolean
  showOverlay?: boolean
  onSendMessage?: (text: string) => void
  /** 焦点在 iframe 内按 Esc 时触发（按 e.source 校验后转发给宿主） */
  onEscape?: () => void
  /** 阅读器等满高场景:iframe 吃满容器,不跟内容高度收缩 */
  fillHeight?: boolean
  /** 白板区块：岛始终浅档，不随系统暗色变黑（浅色白板里黑底小部件读不清） */
  light?: boolean
  /** Current values of the widget's declared params, already checked by the host: sent with finalize and again on every change, never read back */
  params?: Record<string, number | boolean | string>
  /** The page threw within RUNTIME_ERROR_MS of finalize: the error text, once per finalize */
  onRuntimeError?: (message: string) => void
}) {
  const W = useT().widget
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const readyRef = useRef(false)
  const firstResizeRef = useRef(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contentPushRef = useRef<ContentPushState>({ iframe: null, key: '', token: 0, nextToken: 0 })
  const onSendRef = useRef(onSendMessage)
  onSendRef.current = onSendMessage
  const onEscapeRef = useRef(onEscape)
  onEscapeRef.current = onEscape
  const paramsRef = useRef(params)
  paramsRef.current = params
  const onErrorRef = useRef(onRuntimeError)
  onErrorRef.current = onRuntimeError
  const finalizedAtRef = useRef<number | null>(null)

  const initial = heightCache.get(cacheKey(widgetCode)) ?? (fillHeight ? undefined : 120)
  const [height, setHeight] = useState<number | undefined>(initial)
  const [skipTransition, setSkipTransition] = useState(true)
  const [diag, setDiag] = useState('')

  // 内容岛永不跟系统/玻璃壳走暗色——暗 isDark 会触发 WK 换皮,inline 颜色丢失。
  // 宿主暗壳时强制浅档;仅暖纸浅壳且系统暗色时才给 .dark(旧 widget)。
  const isDark = !light && typeof window !== 'undefined'
    && !hostChromeIsDark(document.documentElement)
    && window.matchMedia('(prefers-color-scheme: dark)').matches

  // 挂载时导航到同源 receiver(只一次;勿用 srcdoc——会继承父 script-src 'self')
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    readyRef.current = false
    firstResizeRef.current = true
    const state = contentPushRef.current
    state.iframe = iframe
    state.key = ''
    state.token = ++state.nextToken
    iframe.src = receiverUrl()
  }, [])

  function sendContent(iframe: HTMLIFrameElement, code: string, streaming: boolean): void {
    pushContent(iframe, code, streaming, contentPushRef, paramsRef)
  }

  function pushTheme(win: Window): void {
    win.postMessage({
      type: WIDGET_THEME,
      vars: collectThemeVars(document.documentElement),
      isDark,
      // 阅读器 fillHeight:岛内 overflow:auto;对话跟高模式保持 hidden
      fillHeight: Boolean(fillHeight),
    }, '*')
  }

  // postMessage 监听
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const iframe = iframeRef.current
      if (!iframe || e.source !== iframe.contentWindow || !e.data) return
      switch (e.data.type) {
        case WIDGET_READY:
          readyRef.current = true
          if (iframe.contentWindow) pushTheme(iframe.contentWindow)
          sendContent(iframe, widgetCode, isStreaming)
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
          if (typeof e.data.href === 'string') void import('../../openExternal').then((m) => m.openExternalUrl(e.data.href as string))
          break
        case WIDGET_SEND:
          // Marked as the widget's: the conversation answers it, sediment never takes it for the person's words (R13)
          if (typeof e.data.text === 'string') onSendRef.current?.(MODEL_TEXT.widgetSend(e.data.text))
          break
        case WIDGET_ESCAPE:
          onEscapeRef.current?.()
          break
        case WIDGET_DIAG: {
          const kind = String(e.data.kind ?? '')
          if (kind === 'finalize') finalizedAtRef.current = Date.now()
          if (kind === 'error' && finalizedAtRef.current !== null && Date.now() - finalizedAtRef.current <= RUNTIME_ERROR_MS) {
            finalizedAtRef.current = null
            onErrorRef.current?.(String(e.data.message ?? ''))
          }
          const line = kind === 'csp'
            ? `csp ${String(e.data.directive ?? '')} ${String(e.data.blocked ?? '')}`
            : kind === 'error'
              ? `err ${String(e.data.message ?? '')}`
              : kind === 'finalize'
                ? `fin found=${String(e.data.found ?? '')} cdn=${String(e.data.cdn ?? '')} inline=${String(e.data.inline ?? '')}`
                : kind === 'appended'
                  ? `append ${String(e.data.src ?? '')} ${String(e.data.len ?? '')}`
                  : kind
          setDiag((prev) => (prev ? `${prev} · ${line}` : line).slice(0, 480))
          break
        }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [widgetCode, isStreaming, fillHeight, isDark])

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
      win.postMessage({
        type: WIDGET_THEME,
        vars: collectThemeVars(document.documentElement),
        isDark,
        fillHeight: Boolean(fillHeight),
      }, '*')
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
      debounceRef.current = setTimeout(() => sendContent(iframe, widgetCode, true), UPDATE_DEBOUNCE_MS)
    } else {
      sendContent(iframe, widgetCode, false)
    }
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [widgetCode, isStreaming])

  const paramsKey = params ? JSON.stringify(params) : ''
  useEffect(() => {
    const win = iframeRef.current?.contentWindow
    if (!win || !readyRef.current || !paramsRef.current || !contentPushRef.current.key.startsWith('final:')) return
    win.postMessage({ type: WIDGET_PARAMS, params: paramsRef.current }, '*')
  }, [paramsKey])

  // 主题 / fillHeight 变化推送
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow || !readyRef.current) return
    pushTheme(iframe.contentWindow)
  }, [isDark, fillHeight])

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
      data-widget-diag={diag || undefined}
    >
      {title ? <div className="widget-frame-title">{title}</div> : null}
      {diag && diagBarEnabled() ? <div className="widget-diag" title={diag}>{diag}</div> : null}
      <div className="widget-frame-body">
        <iframe
          ref={iframeRef}
          className="widget-iframe"
          title={title || W.title}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          style={style}
          onLoad={() => {
            // ready 竞态兜底:receiver 脚本已跑时再推主题+内容
            const el = iframeRef.current
            if (!el?.contentWindow) return
            readyRef.current = true
            pushTheme(el.contentWindow)
            sendContent(el, widgetCode, isStreaming)
          }}
        />
        {showOverlay ? <div className="widget-frame-overlay" aria-hidden>{W.animating}</div> : null}
      </div>
    </div>
  )
}

function pushContent(
  iframe: HTMLIFrameElement,
  widgetCode: string,
  streaming: boolean,
  stateRef: { current: ContentPushState },
  paramsRef: { current: Record<string, number | boolean | string> | undefined },
): void {
  const state = stateRef.current
  const key = `${streaming ? 'stream' : 'final'}:${widgetCode}`
  if (state.iframe === iframe && state.key === key) return
  const token = ++state.nextToken
  state.iframe = iframe
  state.key = key
  state.token = token
  void pushContentAsync(iframe, widgetCode, streaming, token, stateRef, paramsRef)
}

async function pushContentAsync(
  iframe: HTMLIFrameElement,
  widgetCode: string,
  streaming: boolean,
  token: number,
  stateRef: { current: ContentPushState },
  paramsRef: { current: Record<string, number | boolean | string> | undefined },
): Promise<void> {
  const win = iframe.contentWindow
  if (!win) return
  if (streaming) {
    const { html, truncated } = truncateOpenScript(widgetCode)
    void truncated
    if (stateRef.current.token !== token) return
    win.postMessage({ type: WIDGET_UPDATE, html: sanitizeForStreaming(html), generation: token }, '*')
    return
  }
  const cleaned = sanitizeForIframe(widgetCode)
  let html = cleaned
  try {
    html = await hoistInlineScripts(cleaned, putWidgetScript)
  } catch {
    html = cleaned
  }
  if (iframe.contentWindow !== win || stateRef.current.token !== token) return
  win.postMessage({ type: WIDGET_FINALIZE, html, generation: token, params: paramsRef.current }, '*')
}

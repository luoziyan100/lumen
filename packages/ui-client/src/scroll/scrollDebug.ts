/**
 * [INPUT]: 对话列诊断事件(滚动/身份/过程卡/Mermaid)
 * [OUTPUT]: scrollDebugEnabled / scrollDebugLog / 导出与清空 —— 只读观测,默认关闭
 * [POS]: 统一时间轴;useStickToBottom / ChatTranscript / ProcessRow / MermaidBlock / useAgent 共用同一缓冲
 *
 * 桌面 App 无浏览器控制台 —— 用应用内 HUD(ScrollDebugHud):
 *   快捷键 ⌃⌥⇧S 开关 → 清空本轮 → 复现跳动 → 「复制日志」粘贴到聊天
 * 开发者备选:
 *   localStorage.setItem('lumen:scrollDebug', '1') / removeItem
 *   URL ?scrollDebug=1
 * 关闭时不启动 rAF 时钟、不保留正文副本。
 * [PROTOCOL]: 变更时更新此头部与 doc/chat-scroll-ux.md §6
 */

export type ChatTraceTrigger =
  | 'text_delta'
  | 'model_step'
  | 'tool_call_start'
  | 'tool_call'
  | 'tool_result'
  | 'reply'
  | 'contentKey'
  | 'resize-observer'
  | 'layout-effect'
  | 'animation-frame'
  | 'user-gesture'

export type MermaidTracePhase =
  | 'source'
  | 'pending'
  | 'raw-svg'
  | 'tightening'
  | 'final-svg'
  | 'source/error'

export type ScrollDebugEvent = {
  t: number
  frame?: number
  tag: string
  trigger?: ChatTraceTrigger

  sticky?: boolean
  programmatic?: boolean
  gesture?: boolean
  scrollTop?: number
  scrollHeight?: number
  clientHeight?: number
  contentH?: number
  lastH?: number
  gap?: number
  deltaTop?: number

  visibleMsgId?: string
  semanticAnchor?: string
  anchorTop?: number
  anchorDelta?: number

  eventId?: string
  assistantUiId?: string
  mountGeneration?: number
  rootType?: 'assistant-group' | 'assistant-bubble'
  provisional?: boolean
  streaming?: boolean
  contentLength?: number

  processId?: string
  processRunning?: boolean
  processOpen?: boolean
  processDomIndex?: number
  processStepCount?: number

  mermaidKey?: string
  mermaidPhase?: MermaidTracePhase
  rectTop?: number
  rectHeight?: number

  note?: string
}

const MAX = 2000
const buf: ScrollDebugEvent[] = []
const listeners = new Set<() => void>()

let frame = 0
let frameRaf = 0
let enabled = false

function readEnabled(): boolean {
  try {
    if (typeof window === 'undefined') return false
    if ((window as unknown as { __LUMEN_SCROLL_DEBUG__?: boolean }).__LUMEN_SCROLL_DEBUG__) return true
    if (localStorage.getItem('lumen:scrollDebug') === '1') return true
    if (new URLSearchParams(window.location.search).get('scrollDebug') === '1') return true
  } catch { /* ignore */ }
  return false
}

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function notify(): void {
  listeners.forEach((fn) => fn())
}

function startFrameClock(): void {
  if (typeof requestAnimationFrame === 'undefined') return
  if (frameRaf) return
  const tick = (): void => {
    frame += 1
    frameRaf = requestAnimationFrame(tick)
  }
  frameRaf = requestAnimationFrame(tick)
}

function stopFrameClock(): void {
  if (frameRaf && typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(frameRaf)
  }
  frameRaf = 0
}

try {
  enabled = readEnabled()
  if (enabled) startFrameClock()
} catch {
  enabled = false
}

export function scrollDebugEnabled(): boolean {
  return enabled
}

/** 运行时开关(方便控制台 / HUD) */
export function setScrollDebug(on: boolean): void {
  enabled = on
  try {
    if (on) localStorage.setItem('lumen:scrollDebug', '1')
    else localStorage.removeItem('lumen:scrollDebug')
  } catch { /* ignore */ }
  if (typeof window !== 'undefined') {
    (window as unknown as { __LUMEN_SCROLL_DEBUG__?: boolean }).__LUMEN_SCROLL_DEBUG__ = on
  }
  if (on) startFrameClock()
  else stopFrameClock()
  notify()
}

export function subscribeScrollDebug(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function scrollDebugLog(tag: string, fields: Omit<ScrollDebugEvent, 't' | 'tag'> = {}): void {
  if (!enabled) return
  const ev: ScrollDebugEvent = { t: now(), frame, tag, ...fields }
  buf.push(ev)
  if (buf.length > MAX) buf.shift()
  const bits = [tag]
  if (fields.sticky != null) bits.push(`sticky=${fields.sticky ? 1 : 0}`)
  if (fields.programmatic != null) bits.push(`prog=${fields.programmatic ? 1 : 0}`)
  if (fields.gesture != null) bits.push(`gest=${fields.gesture ? 1 : 0}`)
  if (fields.scrollTop != null) bits.push(`top=${Math.round(fields.scrollTop)}`)
  if (fields.gap != null) bits.push(`gap=${Math.round(fields.gap)}`)
  if (fields.contentH != null) bits.push(`cH=${Math.round(fields.contentH)}`)
  if (fields.lastH != null) bits.push(`lastH=${Math.round(fields.lastH)}`)
  if (fields.deltaTop != null) bits.push(`dTop=${Math.round(fields.deltaTop)}`)
  if (fields.assistantUiId) bits.push(`ui=${fields.assistantUiId}`)
  if (fields.mountGeneration != null) bits.push(`gen=${fields.mountGeneration}`)
  if (fields.rootType) bits.push(fields.rootType)
  if (fields.mermaidPhase) bits.push(`mmd=${fields.mermaidPhase}`)
  if (fields.processId) bits.push(`proc=${fields.processId}`)
  if (fields.note) bits.push(fields.note)
  console.debug('[scroll]', bits.join(' '))
  try {
    (window as unknown as { __LUMEN_SCROLL_LOG__?: ScrollDebugEvent[] }).__LUMEN_SCROLL_LOG__ = buf
  } catch { /* ignore */ }
  notify()
}

export function getScrollDebugLog(): ScrollDebugEvent[] {
  return buf.slice()
}

export function clearScrollDebugLog(): void {
  buf.length = 0
  try {
    (window as unknown as { __LUMEN_SCROLL_LOG__?: ScrollDebugEvent[] }).__LUMEN_SCROLL_LOG__ = buf
  } catch { /* ignore */ }
  notify()
}

export function formatScrollDebugExport(scene?: string): string {
  const viewport = typeof window !== 'undefined'
    ? { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio ?? 1 }
    : undefined
  return JSON.stringify({
    app: 'Lumen',
    viewport,
    scene: scene?.trim() || undefined,
    startedAt: buf[0]?.t ?? now(),
    eventCount: buf.length,
    events: buf.slice(),
  }, null, 2)
}

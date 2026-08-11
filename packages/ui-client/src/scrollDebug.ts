/**
 * [INPUT]: 滚动诊断事件
 * [OUTPUT]: scrollDebugEnabled / scrollDebugLog —— 只读观测,默认关闭
 * [POS]: useStickToBottom V1 结案 H1/H2/H5;不改变行为
 *
 * 开启(任选其一,刷新后生效):
 *   localStorage.setItem('lumen:scrollDebug', '1')
 *   或 URL ?scrollDebug=1
 * 关闭:
 *   localStorage.removeItem('lumen:scrollDebug')
 * 导出最近日志:
 *   copy(JSON.stringify(window.__LUMEN_SCROLL_LOG__, null, 2))
 */

export type ScrollDebugEvent = {
  t: number
  tag: string
  sticky?: boolean
  programmatic?: boolean
  gesture?: boolean
  scrollTop?: number
  gap?: number
  contentH?: number
  lastH?: number
  deltaTop?: number
  note?: string
}

const MAX = 200
const buf: ScrollDebugEvent[] = []

function readEnabled(): boolean {
  try {
    if (typeof window === 'undefined') return false
    if ((window as unknown as { __LUMEN_SCROLL_DEBUG__?: boolean }).__LUMEN_SCROLL_DEBUG__) return true
    if (localStorage.getItem('lumen:scrollDebug') === '1') return true
    if (new URLSearchParams(window.location.search).get('scrollDebug') === '1') return true
  } catch { /* ignore */ }
  return false
}

let enabled = false
try {
  enabled = readEnabled()
} catch {
  enabled = false
}

export function scrollDebugEnabled(): boolean {
  return enabled
}

/** 运行时开关(方便控制台) */
export function setScrollDebug(on: boolean): void {
  enabled = on
  try {
    if (on) localStorage.setItem('lumen:scrollDebug', '1')
    else localStorage.removeItem('lumen:scrollDebug')
  } catch { /* ignore */ }
  if (typeof window !== 'undefined') {
    (window as unknown as { __LUMEN_SCROLL_DEBUG__?: boolean }).__LUMEN_SCROLL_DEBUG__ = on
  }
}

export function scrollDebugLog(tag: string, fields: Omit<ScrollDebugEvent, 't' | 'tag'> = {}): void {
  if (!enabled) return
  const ev: ScrollDebugEvent = { t: Date.now(), tag, ...fields }
  buf.push(ev)
  if (buf.length > MAX) buf.shift()
  // 单行便于过滤: [scroll] follow sticky=1 h=1200→1800
  const bits = [tag]
  if (fields.sticky != null) bits.push(`sticky=${fields.sticky ? 1 : 0}`)
  if (fields.programmatic != null) bits.push(`prog=${fields.programmatic ? 1 : 0}`)
  if (fields.gesture != null) bits.push(`gest=${fields.gesture ? 1 : 0}`)
  if (fields.scrollTop != null) bits.push(`top=${Math.round(fields.scrollTop)}`)
  if (fields.gap != null) bits.push(`gap=${Math.round(fields.gap)}`)
  if (fields.contentH != null) bits.push(`cH=${Math.round(fields.contentH)}`)
  if (fields.lastH != null) bits.push(`lastH=${Math.round(fields.lastH)}`)
  if (fields.deltaTop != null) bits.push(`dTop=${Math.round(fields.deltaTop)}`)
  if (fields.note) bits.push(fields.note)
  console.debug('[scroll]', bits.join(' '))
  try {
    (window as unknown as { __LUMEN_SCROLL_LOG__?: ScrollDebugEvent[] }).__LUMEN_SCROLL_LOG__ = buf
  } catch { /* ignore */ }
}

export function getScrollDebugLog(): ScrollDebugEvent[] {
  return buf.slice()
}

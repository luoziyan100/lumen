/**
 * [INPUT]: ISO 时间 + nowMs
 * [OUTPUT]: relativeTimeParts —— 会话页相对时间零件(文案在 copy)
 * [POS]: sessions/ 纯函数;不内联中文
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

export type RelativeTime =
  | { kind: 'justNow' }
  | { kind: 'minutes'; n: number }
  | { kind: 'hours'; n: number }
  | { kind: 'days'; n: number }
  | { kind: 'date'; ymd: string }

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

export function relativeTimeParts(iso: string, nowMs: number): RelativeTime {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) {
    return { kind: 'date', ymd: iso.slice(0, 10) || iso }
  }
  const delta = Math.max(0, nowMs - t)
  if (delta < MIN) return { kind: 'justNow' }
  if (delta < HOUR) return { kind: 'minutes', n: Math.floor(delta / MIN) }
  if (delta < DAY) return { kind: 'hours', n: Math.floor(delta / HOUR) }
  if (delta < 7 * DAY) return { kind: 'days', n: Math.floor(delta / DAY) }
  const d = new Date(t)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return { kind: 'date', ymd: `${y}-${m}-${day}` }
}

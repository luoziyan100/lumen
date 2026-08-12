/**
 * [INPUT]: startedAt / endedAt ISO 时间
 * [OUTPUT]: formatElapsed / useElapsedLabel —— 思考/工具耗时(tabular)
 * [POS]: ThoughtRow / ProcessRow 共用;无时间戳则不显示
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useEffect, useState } from 'react'

export function elapsedMs(startedAt?: string, endedAt?: string, now = Date.now()): number | null {
  if (!startedAt) return null
  const start = Date.parse(startedAt)
  if (Number.isNaN(start)) return null
  const end = endedAt ? Date.parse(endedAt) : now
  if (Number.isNaN(end)) return null
  return Math.max(0, end - start)
}

/** 3.2秒 / 12秒 / 1分12秒 */
export function formatElapsed(ms: number): string {
  const sec = ms / 1000
  if (sec < 10) return `${sec.toFixed(1)}秒`
  if (sec < 60) return `${Math.round(sec)}秒`
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}分${s}秒`
}

export function useElapsedLabel(startedAt?: string, endedAt?: string): string | null {
  const live = Boolean(startedAt && !endedAt)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!live) return
    const id = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(id)
  }, [live])
  const ms = elapsedMs(startedAt, endedAt, now)
  return ms == null ? null : formatElapsed(ms)
}

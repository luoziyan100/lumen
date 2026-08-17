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

/** 进行中计时: 3.2s / 46m 51.5s(对标 Claude live + 参考 LoadingState) */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, ms / 1000)
  if (total < 60) return `${total.toFixed(1)}s`
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}m ${s.toFixed(1)}s`
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

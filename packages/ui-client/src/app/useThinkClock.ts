/**
 * [INPUT]: running + taskId
 * [OUTPUT]: thinkStartedAt —— 本轮思考钟起点
 * [POS]: 点发送起跳;draft→正式 taskId 不断钟;停跑/切会话清零
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useEffect, useRef, useState } from 'react'

export function useThinkClock(running: boolean, taskId: string | null): string | null {
  const [thinkStartedAt, setThinkStartedAt] = useState<string | null>(null)
  const thinkClockKeyRef = useRef<string | null>(null)
  useEffect(() => {
    const key = running ? (taskId ?? 'draft') : null
    if (!key) {
      thinkClockKeyRef.current = null
      setThinkStartedAt(null)
      return
    }
    if (thinkClockKeyRef.current === key) return
    if (thinkClockKeyRef.current === 'draft' && taskId) {
      thinkClockKeyRef.current = taskId
      return
    }
    thinkClockKeyRef.current = key
    setThinkStartedAt(new Date().toISOString())
  }, [running, taskId])
  return thinkStartedAt
}

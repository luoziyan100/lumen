/**
 * [INPUT]: unreadSessions localStorage;sessionLamp.shouldMarkUnreadOnStatus
 * [OUTPUT]: unreadIds + mark/clear/toggle
 * [POS]: 侧栏未读灯的本机持久化;task_updated 终态且非当前由调用方 mark
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useState } from 'react'
import { loadUnreadSessionIds, saveUnreadSessionIds } from '../sessions/unreadSessions'

export function useUnreadSessions() {
  const [unreadIds, setUnreadIds] = useState<Set<string>>(() => loadUnreadSessionIds())

  function markUnread(id: string): void {
    setUnreadIds((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      saveUnreadSessionIds(next)
      return next
    })
  }

  function clearUnread(id: string): void {
    setUnreadIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      saveUnreadSessionIds(next)
      return next
    })
  }

  function toggleUnread(id: string): void {
    setUnreadIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      saveUnreadSessionIds(next)
      return next
    })
  }

  return { unreadIds, markUnread, clearUnread, toggleUnread }
}

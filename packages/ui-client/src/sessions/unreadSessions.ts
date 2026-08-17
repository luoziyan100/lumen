/**
 * [INPUT]: localStorage
 * [OUTPUT]: loadUnreadSessionIds / saveUnreadSessionIds —— 会话未读集合持久化
 * [POS]: 侧栏 unread 灯的客户端真源(不进 DB;多窗口以本机为准)
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

export const UNREAD_SESSIONS_KEY = 'lumen:unreadSessions'

export function loadUnreadSessionIds(): Set<string> {
  try {
    const raw = localStorage.getItem(UNREAD_SESSIONS_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((x): x is string => typeof x === 'string' && x.length > 0))
  } catch {
    return new Set()
  }
}

export function saveUnreadSessionIds(ids: Set<string>): void {
  try {
    localStorage.setItem(UNREAD_SESSIONS_KEY, JSON.stringify([...ids]))
  } catch { /* quota / private mode */ }
}

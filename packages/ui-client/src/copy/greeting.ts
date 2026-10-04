/**
 * [INPUT]: 本机时间
 * [OUTPUT]: getTimeGreeting：迁移前欢迎页的分时问候
 * [POS]: 欢迎态与空会话共享文案，不影响研究请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export function getTimeGreeting(now = new Date()): string {
  const hour = now.getHours()
  if (hour >= 5 && hour < 11) return '早上好'
  if (hour >= 11 && hour < 14) return '中午好'
  if (hour >= 14 && hour < 18) return '下午好'
  return '晚上好'
}

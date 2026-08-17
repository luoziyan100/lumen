/**
 * [INPUT]: getTimeGreeting
 * [OUTPUT]: EmptyState —— 对话列欢迎空态(封面;唯一全屏氛围)
 * [POS]: ChatTranscript 空列时渲染;文案随本地时辰
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { getTimeGreeting } from '../copy/greeting'

export function EmptyState() {
  return (
    <div className="empty">
      <div className="empty-mark">{getTimeGreeting()}</div>
    </div>
  )
}

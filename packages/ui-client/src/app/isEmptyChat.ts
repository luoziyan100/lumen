/**
 * [INPUT]: ChatItem[] + running
 * [OUTPUT]: isEmptyChat —— 无消息且未在跑 = 欢迎空态
 * [POS]: App 布局与贴底 hook 共用的空态判定,避免两处各写一遍
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { ChatItem } from '../useAgent'

export function isEmptyChat(items: ChatItem[], running: boolean): boolean {
  return items.length === 0 && !running
}

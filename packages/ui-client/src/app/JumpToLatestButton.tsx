/**
 * [INPUT]: useStickToBottom 的 pin / subscribePinned / getPinned
 * [OUTPUT]: JumpToLatestButton —— 松钉后挂 composer-dock 上沿的「回到最新」
 * [POS]: 钉态走 hook 外部 store,避免 sticky 翻转重绘整列消息
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useSyncExternalStore } from 'react'
import { APP_STATUS_COPY } from '../copy/appCopy'
import { ArrowDownIcon } from '../components/icons'

export function JumpToLatestButton({
  pin,
  subscribe,
  getPinned,
}: {
  pin: () => void
  subscribe: (onStoreChange: () => void) => () => void
  getPinned: () => boolean
}) {
  const pinned = useSyncExternalStore(subscribe, getPinned, getPinned)
  if (pinned) return null
  return (
    <button
      type="button"
      className="jump-latest"
      onClick={() => pin()}
      aria-label={APP_STATUS_COPY.jumpToLatest}
      title={APP_STATUS_COPY.jumpToLatest}
    >
      <ArrowDownIcon size={18} />
    </button>
  )
}

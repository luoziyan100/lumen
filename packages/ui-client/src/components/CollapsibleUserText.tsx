/**
 * [INPUT]: MSG_FOLD_COPY;msgFold.shouldCollapseUserText;用户气泡纯文本
 * [OUTPUT]: CollapsibleUserText —— 超长用户 prompt 默认折叠
 * [POS]: 仅用户气泡;阈值见 msgFold.ts(9 行 / 750 字)
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useState, type ReactNode } from 'react'
import { MSG_FOLD_COPY } from '../appCopy'
import { shouldCollapseUserText } from '../msgFold'

export function CollapsibleUserText({
  text,
  leading,
}: {
  text: string
  /** 图片等,始终露在折叠区外上方 */
  leading?: ReactNode
}) {
  const canFold = shouldCollapseUserText(text)
  const [expanded, setExpanded] = useState(false)
  const collapsed = canFold && !expanded

  return (
    <div className="msg-fold">
      {leading}
      {text ? (
        <div className={`msg-fold-body${collapsed ? ' is-collapsed' : ''}`}>
          {text}
        </div>
      ) : null}
      {canFold && (
        <button
          type="button"
          className="msg-fold-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? MSG_FOLD_COPY.collapse : MSG_FOLD_COPY.expand}
        </button>
      )}
    </div>
  )
}

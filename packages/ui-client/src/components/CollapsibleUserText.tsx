/**
 * [INPUT]: MSG_FOLD_COPY;msgFold.shouldCollapseUserText;CurtainFold;用户气泡纯文本
 * [OUTPUT]: CollapsibleUserText —— 超长用户 prompt 默认折叠;展开/收起走卷帘揭开
 * [POS]: 仅用户气泡;阈值见 msgFold.ts(9 行 / 750 字);Curtain Language 触点之一
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MSG_FOLD_COPY } from '../copy/appCopy'
import { shouldCollapseUserText } from '../composer/msgFold'
import { CurtainFold } from './CurtainFold'

/** 与 --dur-collapse-out 对齐,收起播完再露预览 */
const COLLAPSE_OUT_MS = 400

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
  const [curtainOpen, setCurtainOpen] = useState(false)
  const [showPeek, setShowPeek] = useState(true)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }, [])

  function toggle(): void {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    if (!expanded) {
      setShowPeek(false)
      setExpanded(true)
      requestAnimationFrame(() => setCurtainOpen(true))
      return
    }
    setCurtainOpen(false)
    setExpanded(false)
    closeTimer.current = setTimeout(() => {
      setShowPeek(true)
      closeTimer.current = null
    }, COLLAPSE_OUT_MS)
  }

  if (!canFold) {
    return (
      <div className="msg-fold">
        {leading}
        {text ? <div className="msg-fold-body">{text}</div> : null}
      </div>
    )
  }

  return (
    <div className="msg-fold">
      {leading}
      {text ? (
        <div className="msg-fold-stack">
          {showPeek && (
            <div className="msg-fold-body is-collapsed" aria-hidden={curtainOpen}>
              {text}
            </div>
          )}
          <CurtainFold open={curtainOpen}>
            <div className="msg-fold-body">{text}</div>
          </CurtainFold>
        </div>
      ) : null}
      <button
        type="button"
        className="msg-fold-toggle"
        aria-expanded={expanded}
        onClick={toggle}
      >
        {expanded ? MSG_FOLD_COPY.collapse : MSG_FOLD_COPY.expand}
      </button>
    </div>
  )
}

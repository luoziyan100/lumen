/**
 * [INPUT]: 用户正文、始终可见的附件和原 CurtainFold/长消息文案
 * [OUTPUT]: CollapsibleUserText：9 行或 750 字以上的用户输入以预览和卷帘全文切换
 * [POS]: 只管理阅读开合；沿原收起后 400ms 恢复预览，快速反向切换撤销旧帧和旧计时
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MSG_FOLD_COPY } from '../../copy/appCopy'
import { CurtainFold } from './CurtainFold'

// 原设计给 380ms 收帘留一帧余量，完成后才恢复摘要。
const COLLAPSE_OUT_MS = 400

export function CollapsibleUserText({ text, leading }: { text: string; leading?: ReactNode }) {
  const canFold = text.trim().length > 750 || text.trim().split('\n').length > 9
  const [expanded, setExpanded] = useState(false), [curtainOpen, setCurtainOpen] = useState(false), [showPeek, setShowPeek] = useState(true)
  const frame = useRef<number | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function clearPending() {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    if (timer.current !== null) clearTimeout(timer.current)
    frame.current = null; timer.current = null
  }
  useEffect(() => clearPending, [])
  function toggle() {
    clearPending()
    if (!expanded) {
      setShowPeek(false); setExpanded(true)
      frame.current = requestAnimationFrame(() => { frame.current = null; setCurtainOpen(true) })
      return
    }
    setCurtainOpen(false); setExpanded(false)
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    if (reducedMotion) { setShowPeek(true); return }
    timer.current = setTimeout(() => { timer.current = null; setShowPeek(true) }, COLLAPSE_OUT_MS)
  }
  if (!canFold) return <div className="msg-fold">{leading}{text && <div className="msg-fold-body">{text}</div>}</div>
  return <div className="msg-fold">
    {leading}
    <div className="msg-fold-stack">
      {showPeek && <div className="msg-fold-body is-collapsed" aria-hidden={curtainOpen}>{text}</div>}
      <CurtainFold open={curtainOpen}><div className="msg-fold-body">{text}</div></CurtainFold>
    </div>
    <button type="button" className="msg-fold-toggle" aria-expanded={expanded} onClick={toggle}>{expanded ? MSG_FOLD_COPY.collapse : MSG_FOLD_COPY.expand}</button>
  </div>
}

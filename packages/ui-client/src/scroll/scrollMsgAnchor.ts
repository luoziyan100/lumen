/**
 * [INPUT]: 对话滚动容器 + [id^=msg-] 消息锚点
 * [OUTPUT]: captureVisibleMsgAnchor / restoreMsgAnchor —— 高度突变时保持「正在看的那条」
 * [POS]: useStickToBottom manual 浏览态;对标 opensquilla scrollAnchor / ChatGPT pagination anchor
 * [PROTOCOL]: 变更时更新此头部与 doc/chat-scroll-ux.md
 */

export interface VisibleMsgAnchor {
  id: string
  /** 相对滚动容器顶部的像素 */
  offsetTop: number
}

/** 视口内第一条带 msg- 锚点的消息 */
export function captureVisibleMsgAnchor(container: HTMLElement): VisibleMsgAnchor | null {
  const crect = container.getBoundingClientRect()
  const nodes = container.querySelectorAll<HTMLElement>('[id^="msg-"]')
  for (const el of nodes) {
    const r = el.getBoundingClientRect()
    if (r.bottom > crect.top + 4 && r.top < crect.bottom) {
      return { id: el.id, offsetTop: r.top - crect.top }
    }
  }
  return null
}

/** 高度变化后把锚点消息拉回原视口位置(无动画) */
export function restoreMsgAnchor(
  container: HTMLElement,
  anchor: VisibleMsgAnchor | null,
): number {
  if (!anchor) return 0
  const el = document.getElementById(anchor.id)
  if (!el || !container.contains(el)) return 0
  const crect = container.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  const delta = (r.top - crect.top) - anchor.offsetTop
  if (Math.abs(delta) > 0.5) {
    container.scrollTop += delta
  }
  return delta
}

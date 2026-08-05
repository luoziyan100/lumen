/**
 * [INPUT]: 消息列表滚动容器 ref;内容增长依赖(items/running)
 * [OUTPUT]: useStickToBottom / isNearBottom —— 流式贴底跟随;用户上滚则松手
 * [POS]: 对话列滚动体验核;与 TurnRail 的 scrollIntoView(点选)互不抢权
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useEffect, useEffectEvent, useRef, type RefObject } from 'react'

export interface StickToBottomOptions {
  /** 距底小于此像素视为「仍在底部」。默认 96 */
  threshold?: number
  /** false 时不跟随(例如空态)。默认 true */
  enabled?: boolean
}

/** 纯函数:是否贴底(导出供单测) */
export function isNearBottom(el: HTMLElement, threshold = 96): boolean {
  const gap = el.scrollHeight - el.scrollTop - el.clientHeight
  return gap <= threshold
}

export function useStickToBottom(
  scrollerRef: RefObject<HTMLElement | null>,
  contentKey: unknown,
  options: StickToBottomOptions = {},
): { pin: () => void } {
  const threshold = options.threshold ?? 96
  const enabled = options.enabled ?? true
  const pinnedRef = useRef(true)

  const scrollToBottom = useEffectEvent((behavior: ScrollBehavior = 'auto') => {
    const el = scrollerRef.current
    if (!el || !enabled) return
    el.scrollTo({ top: el.scrollHeight, behavior })
  })

  const pin = useEffectEvent(() => {
    pinnedRef.current = true
    scrollToBottom('auto')
  })

  // 用户手势:离开底部 → 松手;回到底部 → 重新钉住
  useEffect(() => {
    const el = scrollerRef.current
    if (!el || !enabled) return
    const onScroll = (): void => {
      pinnedRef.current = isNearBottom(el, threshold)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [scrollerRef, enabled, threshold])

  // 稳定观察高度/子树变化;钉住时才跟到底
  useEffect(() => {
    if (!enabled) return
    const el = scrollerRef.current
    if (!el) return

    const follow = (): void => {
      if (pinnedRef.current) scrollToBottom('auto')
    }
    const ro = new ResizeObserver(follow)
    ro.observe(el)
    for (const child of el.children) ro.observe(child)

    const mo = new MutationObserver(() => {
      for (const child of el.children) ro.observe(child)
      follow()
    })
    mo.observe(el, { childList: true, subtree: true, characterData: true })

    follow()
    return () => {
      ro.disconnect()
      mo.disconnect()
    }
  }, [scrollerRef, enabled, scrollToBottom])

  // 内容键变化(流式字数等)再推一次——Markdown 重绘不一定触发子节点 Resize
  useEffect(() => {
    if (!enabled) return
    if (pinnedRef.current) scrollToBottom('auto')
  }, [contentKey, enabled, scrollToBottom])

  return { pin }
}

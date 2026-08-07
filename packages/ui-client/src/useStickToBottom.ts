/**
 * [INPUT]: 消息列表滚动容器 ref;内容增长依赖(items/running)
 * [OUTPUT]: useStickToBottom / isNearBottom / shouldFollowScrollHeight —— 流式贴底;上滑即松手
 * [POS]: 对话列滚动体验核;对标 Claude:生成中可上下滑;与 TurnRail 的 scrollIntoView 互不抢权;
 *        高度回缩不追滚,避免 KaTeX/重排把视口在 prompt↔输出间振荡
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react'

export interface StickToBottomOptions {
  /** 距底大于此 → 松钉。默认 64 */
  unpinThreshold?: number
  /** 距底小于此 → 重新钉住(须更严,与 unpin 形成回滞)。默认 28 */
  repinThreshold?: number
  /** false 时不跟随(例如空态)。默认 true */
  enabled?: boolean
}

/** 距底像素 */
export function distanceFromBottom(el: HTMLElement): number {
  return el.scrollHeight - el.scrollTop - el.clientHeight
}

/** 纯函数:是否贴底(导出供单测);默认用松钉阈值 */
export function isNearBottom(el: HTMLElement, threshold = 64): boolean {
  return distanceFromBottom(el) <= threshold
}

/**
 * 是否应用贴底跟随。高度回缩时不追(force 除外:contentKey/点「回到最新」)。
 * 根因:流式 Markdown/KaTeX 高度非单调 → 盲跟会在 prompt 与输出尖之间振荡。
 */
export function shouldFollowScrollHeight(prev: number, next: number, force: boolean): boolean {
  if (force) return true
  if (prev <= 0) return true
  return next >= prev
}

export function useStickToBottom(
  scrollerRef: RefObject<HTMLElement | null>,
  contentKey: unknown,
  options: StickToBottomOptions = {},
): { pin: () => void; pinned: boolean } {
  const unpinThreshold = options.unpinThreshold ?? 64
  const repinThreshold = options.repinThreshold ?? 28
  const enabled = options.enabled ?? true
  const pinnedRef = useRef(true)
  const [pinned, setPinned] = useState(true)
  /** 程序化 scrollTo 触发的 scroll 事件勿改钉态 */
  const ignoreScrollRef = useRef(false)
  const rafRef = useRef(0)
  const lastHeightRef = useRef(0)
  const forceFollowRef = useRef(false)

  const applyPinned = useEffectEvent((next: boolean) => {
    if (pinnedRef.current === next) return
    pinnedRef.current = next
    setPinned(next)
  })

  const scrollToBottom = useEffectEvent((behavior: ScrollBehavior = 'auto') => {
    const el = scrollerRef.current
    if (!el || !enabled) return
    ignoreScrollRef.current = true
    el.scrollTo({ top: el.scrollHeight, behavior })
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        ignoreScrollRef.current = false
      })
    })
  })

  const scheduleFollow = useEffectEvent((force = false) => {
    if (force) forceFollowRef.current = true
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const el = scrollerRef.current
      if (!el || !pinnedRef.current || !enabled) return
      const h = el.scrollHeight
      const prev = lastHeightRef.current
      const forceNow = forceFollowRef.current
      forceFollowRef.current = false
      if (!shouldFollowScrollHeight(prev, h, forceNow)) return
      lastHeightRef.current = h
      scrollToBottom('auto')
    })
  })

  const pin = useEffectEvent(() => {
    applyPinned(true)
    forceFollowRef.current = true
    const el = scrollerRef.current
    if (el) lastHeightRef.current = el.scrollHeight
    scrollToBottom('smooth')
  })

  // 手势:上滑/上拨立刻松钉——不等 scroll 结算(流式 follow 否则会当场抢回去)
  useEffect(() => {
    const el = scrollerRef.current
    if (!el || !enabled) return

    const onWheel = (e: WheelEvent): void => {
      if (e.deltaY < 0) applyPinned(false)
    }

    let touchY = 0
    const onTouchStart = (e: TouchEvent): void => {
      touchY = e.touches[0]?.clientY ?? 0
    }
    const onTouchMove = (e: TouchEvent): void => {
      const y = e.touches[0]?.clientY ?? 0
      // 手指下移 = 视口上移看历史
      if (y - touchY > 6) applyPinned(false)
      touchY = y
    }

    const onScroll = (): void => {
      if (ignoreScrollRef.current) return
      const gap = distanceFromBottom(el)
      if (gap > unpinThreshold) applyPinned(false)
      else if (gap <= repinThreshold) applyPinned(true)
      // 回滞带内保持原态,避免轻滑就被重新钉死
    }

    el.addEventListener('wheel', onWheel, { passive: true })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('scroll', onScroll)
    }
  }, [scrollerRef, enabled, unpinThreshold, repinThreshold, applyPinned])

  // 结构变化跟随;不听 characterData(每个 text_delta 改字会抖,改由 contentKey force)
  useEffect(() => {
    if (!enabled) return
    const el = scrollerRef.current
    if (!el) return

    const ro = new ResizeObserver(() => scheduleFollow(false))
    ro.observe(el)
    for (const child of el.children) ro.observe(child)

    const mo = new MutationObserver(() => {
      for (const child of el.children) ro.observe(child)
      scheduleFollow(false)
    })
    // 只盯子树增删,不盯 characterData——流式改字走 contentKey
    mo.observe(el, { childList: true, subtree: true })

    scheduleFollow(true)
    return () => {
      ro.disconnect()
      mo.disconnect()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
  }, [scrollerRef, enabled, scheduleFollow])

  // 文本增长等:强制贴底一次(即使中间有高度回缩噪声)
  useEffect(() => {
    if (!enabled) return
    scheduleFollow(true)
  }, [contentKey, enabled, scheduleFollow])

  return { pin, pinned }
}

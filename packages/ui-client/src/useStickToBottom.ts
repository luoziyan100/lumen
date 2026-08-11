/**
 * [INPUT]: 消息列表滚动容器 ref; contentKey(文本/步骤增长信号)
 * [OUTPUT]: useStickToBottom —— stickyBottom / manual 双态贴底
 * [POS]: 对话列滚动核
 *
 * 对标 OpenWork scroll-controller + opensquilla autoScroll:
 * - 用户上滑手势后 600ms 内禁止任何自动 scrollTo(bottom)(含 ResizeObserver)
 * - 以 scrollTop 增量判定「上滑」≥16px，打断进行中的程序化贴底
 * - 程序化贴底设 programmatic 旗;手势与上滑均可立刻取消
 * - sticky 仅在真正贴底(gap≤阈值)或用户点「回到最新」时成立
 * - 高度回缩不追滚
 *
 * 参考:
 * - openwork/.../surface/scroll-controller.ts
 * - opensquilla scrollToBottom 前 re-check autoScroll
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react'

export interface StickToBottomOptions {
  /** 距底 ≤ 此视为「在底」(sticky 判定)。默认 4 */
  bottomGapPx?: number
  /** 距底 > 此且非手势时也可解除 sticky(兜底)。默认 64 */
  leaveBottomGapPx?: number
  /** 上滑多少 px 算明确离开底部。默认 16(OpenWork MANUAL_BROWSE_UPWARD_THRESHOLD) */
  upwardThresholdPx?: number
  /** 手势保护窗 ms。默认 600(OpenWork SCROLL_GESTURE_WINDOW) */
  gestureWindowMs?: number
  enabled?: boolean
  /**
   * 内容根节点(消息列表内层)。只观察其高度增长再贴底,
   * 避免 composer 变高导致 scroller clientHeight 变化误触发 follow。
   * 缺省则回退为 scroller 自身。
   */
  contentRef?: RefObject<HTMLElement | null>
}

export function distanceFromBottom(el: HTMLElement): number {
  return el.scrollHeight - el.scrollTop - el.clientHeight
}

export function isNearBottom(el: HTMLElement, threshold = 64): boolean {
  return distanceFromBottom(el) <= threshold
}

export function shouldFollowScrollHeight(prev: number, next: number, force: boolean): boolean {
  if (force) return true
  if (prev <= 0) return true
  return next >= prev
}

export function shouldResetHeightBaseline(prev: number, next: number): boolean {
  return prev > 0 && next < prev
}

/** 是否仍在手势保护窗内 */
export function isWithinGestureWindow(lastGestureAt: number, now: number, windowMs: number): boolean {
  return now - lastGestureAt < windowMs
}

/** scrollTop 变化是否算「明确上滑」 */
export function isMeaningfulScrollUp(prevTop: number, nextTop: number, thresholdPx: number): boolean {
  return nextTop - prevTop <= -thresholdPx
}

export function useStickToBottom(
  scrollerRef: RefObject<HTMLElement | null>,
  contentKey: unknown,
  options: StickToBottomOptions = {},
): { pin: () => void; pinned: boolean } {
  const bottomGapPx = options.bottomGapPx ?? 4
  const leaveBottomGapPx = options.leaveBottomGapPx ?? 64
  const upwardThresholdPx = options.upwardThresholdPx ?? 16
  const gestureWindowMs = options.gestureWindowMs ?? 600
  const enabled = options.enabled ?? true
  const contentRef = options.contentRef

  const stickyRef = useRef(true)
  const [pinned, setPinned] = useState(true)
  const ignoreScrollRef = useRef(false)
  const programmaticRef = useRef(false)
  const lastScrollTopRef = useRef(0)
  const lastHeightRef = useRef(0)
  const lastGestureAtRef = useRef(0)
  const rafRef = useRef(0)
  const progReleaseRafRef = useRef(0)

  const applySticky = useEffectEvent((next: boolean) => {
    if (stickyRef.current === next) return
    stickyRef.current = next
    setPinned(next)
    const el = scrollerRef.current
    // OpenWork: sticky 时关 overflow-anchor,浏览时开,减轻浏览器锚点乱跳
    if (el) el.style.overflowAnchor = next ? 'none' : 'auto'
  })

  const markGesture = useEffectEvent(() => {
    lastGestureAtRef.current = Date.now()
  })

  const hasGesture = useEffectEvent((): boolean =>
    isWithinGestureWindow(lastGestureAtRef.current, Date.now(), gestureWindowMs),
  )

  const releaseProgrammaticSoon = useEffectEvent(() => {
    if (progReleaseRafRef.current) cancelAnimationFrame(progReleaseRafRef.current)
    progReleaseRafRef.current = requestAnimationFrame(() => {
      progReleaseRafRef.current = requestAnimationFrame(() => {
        progReleaseRafRef.current = 0
        programmaticRef.current = false
      })
    })
  })

  const scrollToBottom = useEffectEvent((behavior: ScrollBehavior = 'auto') => {
    const el = scrollerRef.current
    if (!el || !enabled) return
    // OpenWork/opensquilla: 执行前再确认 sticky 与无手势
    if (!stickyRef.current || hasGesture()) return

    programmaticRef.current = true
    ignoreScrollRef.current = true
    if (behavior === 'smooth') {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      lastScrollTopRef.current = el.scrollTop
      releaseProgrammaticSoon()
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          ignoreScrollRef.current = false
        })
      })
      return
    }
    el.scrollTop = el.scrollHeight
    lastScrollTopRef.current = el.scrollTop
    lastHeightRef.current = el.scrollHeight
    requestAnimationFrame(() => {
      const node = scrollerRef.current
      if (node && stickyRef.current && !hasGesture()) {
        node.scrollTop = node.scrollHeight
        lastScrollTopRef.current = node.scrollTop
        lastHeightRef.current = node.scrollHeight
      }
      releaseProgrammaticSoon()
      ignoreScrollRef.current = false
    })
  })

  const contentHeight = useEffectEvent((): number => {
    const content = contentRef?.current
    if (content) return content.offsetHeight
    const el = scrollerRef.current
    return el ? el.scrollHeight : 0
  })

  const scheduleFollow = useEffectEvent((force = false) => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const el = scrollerRef.current
      if (!el || !enabled) return
      // 核心:手势窗内绝不自动贴底(OpenWork RO 守卫)
      if (!force && hasGesture()) return
      if (!stickyRef.current) return

      // 跟「内容高度」而非 scroller.scrollHeight(含 padding/视口变化)
      const h = contentHeight()
      const prev = lastHeightRef.current
      if (!shouldFollowScrollHeight(prev, h, force)) {
        if (shouldResetHeightBaseline(prev, h)) lastHeightRef.current = h
        return
      }
      // 仅内容增高(或 force pin)时贴底
      if (!force && prev > 0 && h <= prev) return
      lastHeightRef.current = h
      scrollToBottom('auto')
    })
  })

  const pin = useEffectEvent(() => {
    lastGestureAtRef.current = 0 // 主动回到最新,清手势窗
    applySticky(true)
    const el = scrollerRef.current
    if (el) {
      lastHeightRef.current = el.scrollHeight
      lastScrollTopRef.current = el.scrollTop
    }
    // force 路径:临时允许贴底
    stickyRef.current = true
    programmaticRef.current = true
    ignoreScrollRef.current = true
    const node = scrollerRef.current
    if (node) {
      node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' })
      lastScrollTopRef.current = node.scrollTop
    }
    releaseProgrammaticSoon()
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        ignoreScrollRef.current = false
      })
    })
  })

  // 手势标记 + 上滑/下滑改 sticky
  useEffect(() => {
    const el = scrollerRef.current
    if (!el || !enabled) return

    const onGesture = (e: Event): void => {
      const t = e.target
      if (t instanceof Element) {
        const nested = t.closest('[data-scrollable]')
        if (nested && nested !== el) return
      }
      markGesture()
    }

    const onWheel = (e: WheelEvent): void => {
      onGesture(e)
      if (e.deltaY < 0) {
        // 上滑:立刻 manual(OpenWork)
        applySticky(false)
        programmaticRef.current = false
      }
    }

    let touchY = 0
    const onTouchStart = (e: TouchEvent): void => {
      onGesture(e)
      touchY = e.touches[0]?.clientY ?? 0
    }
    const onTouchMove = (e: TouchEvent): void => {
      onGesture(e)
      const y = e.touches[0]?.clientY ?? 0
      if (y - touchY > 6) {
        applySticky(false)
        programmaticRef.current = false
      }
      touchY = y
    }

    const onScroll = (): void => {
      if (ignoreScrollRef.current && programmaticRef.current) {
        // 程序化滚动中仍检测用户是否抢了方向
        const top = el.scrollTop
        if (hasGesture() || isMeaningfulScrollUp(lastScrollTopRef.current, top, upwardThresholdPx)) {
          programmaticRef.current = false
          ignoreScrollRef.current = false
          applySticky(false)
          lastScrollTopRef.current = top
          return
        }
        lastScrollTopRef.current = top
        return
      }
      if (ignoreScrollRef.current) return

      const top = el.scrollTop
      const prevTop = lastScrollTopRef.current
      const gap = distanceFromBottom(el)
      const scrolledUp = isMeaningfulScrollUp(prevTop, top, upwardThresholdPx)
      const gestured = hasGesture()

      // 程序化贴底进行中被用户上滑 → 放弃(OpenWork)
      if (programmaticRef.current && (gestured || scrolledUp)) {
        programmaticRef.current = false
        applySticky(false)
        lastScrollTopRef.current = top
        return
      }
      if (programmaticRef.current) {
        lastScrollTopRef.current = top
        return
      }

      if (scrolledUp || (gestured && gap > bottomGapPx)) {
        applySticky(false)
      } else if (gap <= bottomGapPx) {
        applySticky(true)
      } else if (gap > leaveBottomGapPx) {
        applySticky(false)
      }

      lastScrollTopRef.current = top
    }

    el.addEventListener('wheel', onWheel, { passive: true })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('pointerdown', onGesture, { passive: true })
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('pointerdown', onGesture)
      el.removeEventListener('scroll', onScroll)
    }
  }, [
    scrollerRef,
    enabled,
    bottomGapPx,
    leaveBottomGapPx,
    upwardThresholdPx,
    markGesture,
    applySticky,
    hasGesture,
  ])

  // 只观察内容根高度(OpenWork contentRef);不观察 scroller 自身,避免输入框变高误跟
  useEffect(() => {
    if (!enabled) return
    const el = scrollerRef.current
    if (!el) return
    const content = contentRef?.current ?? el

    lastHeightRef.current = content.offsetHeight
    lastScrollTopRef.current = el.scrollTop

    const ro = new ResizeObserver(() => {
      scheduleFollow(false)
    })
    ro.observe(content)

    applySticky(true)
    scheduleFollow(true)

    return () => {
      ro.disconnect()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      if (progReleaseRafRef.current) cancelAnimationFrame(progReleaseRafRef.current)
      progReleaseRafRef.current = 0
    }
  }, [scrollerRef, contentRef, enabled, scheduleFollow, applySticky])

  useEffect(() => {
    if (!enabled) return
    scheduleFollow(false)
  }, [contentKey, enabled, scheduleFollow])

  return { pin, pinned }
}

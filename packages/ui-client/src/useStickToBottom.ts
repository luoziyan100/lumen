/**
 * [INPUT]: 消息列表 scroller + 可选 contentRef; contentKey
 * [OUTPUT]: useStickToBottom —— sticky/manual 双态; mermaid 高度雪崩时 manual 锚定可见消息
 * [POS]: 对话列滚动核 · doc/chat-scroll-ux.md · 诊断报告 P1
 *
 * OpenWork: 手势窗 + 程序化可打断 + 只跟内容增高
 * opensquilla: 高度突变时 anchor 可见消息,用户手势 cancel 自动修正
 * [PROTOCOL]: 变更时更新此头部与 doc/chat-scroll-ux.md
 */
import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react'
import { captureVisibleMsgAnchor, restoreMsgAnchor, type VisibleMsgAnchor } from './scrollMsgAnchor.ts'

export interface StickToBottomOptions {
  bottomGapPx?: number
  leaveBottomGapPx?: number
  upwardThresholdPx?: number
  gestureWindowMs?: number
  /** sticky 下多次 RO 合并贴底的静默窗 ms。默认 140(mermaid 逐个落位) */
  followSettleMs?: number
  enabled?: boolean
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

export function isWithinGestureWindow(lastGestureAt: number, now: number, windowMs: number): boolean {
  return now - lastGestureAt < windowMs
}

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
  const followSettleMs = options.followSettleMs ?? 140
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
  const settleTimerRef = useRef(0)
  const progReleaseRafRef = useRef(0)
  const msgAnchorRef = useRef<VisibleMsgAnchor | null>(null)

  const applySticky = useEffectEvent((next: boolean) => {
    if (stickyRef.current === next) return
    stickyRef.current = next
    setPinned(next)
    const el = scrollerRef.current
    if (el) el.style.overflowAnchor = next ? 'none' : 'auto'
  })

  const markGesture = useEffectEvent(() => {
    lastGestureAtRef.current = Date.now()
  })

  const hasGesture = useEffectEvent((): boolean =>
    isWithinGestureWindow(lastGestureAtRef.current, Date.now(), gestureWindowMs),
  )

  const contentHeight = useEffectEvent((): number => {
    const content = contentRef?.current
    if (content) return content.offsetHeight
    const el = scrollerRef.current
    return el ? el.scrollHeight : 0
  })

  const releaseProgrammaticSoon = useEffectEvent(() => {
    if (progReleaseRafRef.current) cancelAnimationFrame(progReleaseRafRef.current)
    progReleaseRafRef.current = requestAnimationFrame(() => {
      progReleaseRafRef.current = requestAnimationFrame(() => {
        progReleaseRafRef.current = 0
        programmaticRef.current = false
      })
    })
  })

  const refreshMsgAnchor = useEffectEvent(() => {
    const el = scrollerRef.current
    if (!el || stickyRef.current) return
    msgAnchorRef.current = captureVisibleMsgAnchor(el)
  })

  const stabilizeManualView = useEffectEvent(() => {
    const el = scrollerRef.current
    if (!el || stickyRef.current || programmaticRef.current) return
    // 用户正在滚时不抢(opensquilla: 手势 cancel 修正)
    if (hasGesture()) {
      refreshMsgAnchor()
      lastHeightRef.current = contentHeight()
      return
    }
    restoreMsgAnchor(el, msgAnchorRef.current)
    lastScrollTopRef.current = el.scrollTop
    lastHeightRef.current = contentHeight()
    // 修正后刷新锚点,供下一次突变使用
    msgAnchorRef.current = captureVisibleMsgAnchor(el)
  })

  const scrollToBottom = useEffectEvent((behavior: ScrollBehavior = 'auto') => {
    const el = scrollerRef.current
    if (!el || !enabled) return
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
    lastHeightRef.current = contentHeight()
    requestAnimationFrame(() => {
      const node = scrollerRef.current
      if (node && stickyRef.current && !hasGesture()) {
        const h = contentHeight()
        if (h > lastHeightRef.current) {
          node.scrollTop = node.scrollHeight
          lastScrollTopRef.current = node.scrollTop
          lastHeightRef.current = h
        }
      }
      releaseProgrammaticSoon()
      ignoreScrollRef.current = false
    })
  })

  const runFollowNow = useEffectEvent((force = false) => {
    const el = scrollerRef.current
    if (!el || !enabled) return
    if (!force && hasGesture()) return
    if (!stickyRef.current) return

    const h = contentHeight()
    const prev = lastHeightRef.current
    if (!shouldFollowScrollHeight(prev, h, force)) {
      if (shouldResetHeightBaseline(prev, h)) lastHeightRef.current = h
      return
    }
    if (!force && prev > 0 && h <= prev) return
    lastHeightRef.current = h
    scrollToBottom('auto')
  })

  /** sticky:合并多次 RO(mermaid 逐个落位);manual:锚定可见消息 */
  const onContentResized = useEffectEvent(() => {
    if (!enabled) return
    if (stickyRef.current) {
      if (hasGesture()) return
      if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current)
      settleTimerRef.current = window.setTimeout(() => {
        settleTimerRef.current = 0
        runFollowNow(false)
      }, followSettleMs)
      return
    }
    // manual: 高度突变后把「正在看的消息」钉回原位(诊断报告 P1)
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      stabilizeManualView()
    })
  })

  const pin = useEffectEvent(() => {
    lastGestureAtRef.current = 0
    msgAnchorRef.current = null
    applySticky(true)
    stickyRef.current = true
    programmaticRef.current = true
    ignoreScrollRef.current = true
    const node = scrollerRef.current
    if (node) {
      node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' })
      lastScrollTopRef.current = node.scrollTop
      lastHeightRef.current = contentHeight()
    }
    releaseProgrammaticSoon()
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        ignoreScrollRef.current = false
      })
    })
  })

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
        const top = el.scrollTop
        if (hasGesture() || isMeaningfulScrollUp(lastScrollTopRef.current, top, upwardThresholdPx)) {
          programmaticRef.current = false
          ignoreScrollRef.current = false
          applySticky(false)
          lastScrollTopRef.current = top
          refreshMsgAnchor()
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

      if (programmaticRef.current && (gestured || scrolledUp)) {
        programmaticRef.current = false
        applySticky(false)
        lastScrollTopRef.current = top
        refreshMsgAnchor()
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
        msgAnchorRef.current = null
      } else if (gap > leaveBottomGapPx) {
        applySticky(false)
      }

      lastScrollTopRef.current = top
      if (!stickyRef.current) refreshMsgAnchor()
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
    refreshMsgAnchor,
  ])

  useEffect(() => {
    if (!enabled) return
    const el = scrollerRef.current
    if (!el) return
    const content = contentRef?.current ?? el

    lastHeightRef.current = content.offsetHeight
    lastScrollTopRef.current = el.scrollTop
    msgAnchorRef.current = captureVisibleMsgAnchor(el)

    const ro = new ResizeObserver(() => {
      onContentResized()
    })
    ro.observe(content)

    applySticky(true)
    // 首屏贴底(无 settle 延迟)
    runFollowNow(true)

    return () => {
      ro.disconnect()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current)
      settleTimerRef.current = 0
      if (progReleaseRafRef.current) cancelAnimationFrame(progReleaseRafRef.current)
      progReleaseRafRef.current = 0
    }
  }, [scrollerRef, contentRef, enabled, onContentResized, applySticky, runFollowNow])

  useEffect(() => {
    if (!enabled) return
    // contentKey 变化:sticky 合并 follow;manual 刷锚点
    if (stickyRef.current) {
      if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current)
      settleTimerRef.current = window.setTimeout(() => {
        settleTimerRef.current = 0
        runFollowNow(false)
      }, followSettleMs)
    } else {
      refreshMsgAnchor()
    }
  }, [contentKey, enabled, followSettleMs, runFollowNow, refreshMsgAnchor])

  return { pin, pinned }
}

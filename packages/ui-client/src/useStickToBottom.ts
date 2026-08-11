/**
 * [INPUT]: 消息列表 scroller + 可选 contentRef; contentKey
 * [OUTPUT]: useStickToBottom —— sticky/manual 双态; mermaid 高度雪崩时 manual 锚定可见消息
 * [POS]: 对话列滚动核 · doc/chat-scroll-ux.md · 诊断报告 P1
 *
 * OpenWork: 手势窗 + 程序化可打断 + 只跟内容增高
 * opensquilla: 高度突变时 anchor 可见消息,用户手势 cancel 自动修正
 *
 * V1 2026-08-11 日志结案:
 *   contentH ~3.5k 振荡 → gap 被挤到贴底阈值 → 误 sticky→true → follow 拽底
 *   修: 进 sticky 必须用户意图(手势/下滑);大塌缩后 guard;RO 重绑不得 force 拽底
 * [PROTOCOL]: 变更时更新此头部与 doc/chat-scroll-ux.md
 */
import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react'
import { captureVisibleMsgAnchor, restoreMsgAnchor, type VisibleMsgAnchor } from './scrollMsgAnchor.ts'
import { scrollDebugEnabled, scrollDebugLog } from './scrollDebug.ts'

export interface StickToBottomOptions {
  bottomGapPx?: number
  leaveBottomGapPx?: number
  upwardThresholdPx?: number
  gestureWindowMs?: number
  /** sticky 下多次 RO 合并贴底的静默窗 ms。默认 140(mermaid 逐个落位) */
  followSettleMs?: number
  /** 内容高度一次塌缩超过该 px 后,短时禁止仅因 gap 进 sticky。默认 80 */
  collapseGuardPx?: number
  /** 塌缩护栏时长 ms。默认 800 */
  collapseGuardMs?: number
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

export function isMeaningfulScrollDown(prevTop: number, nextTop: number, thresholdPx: number): boolean {
  return nextTop - prevTop >= thresholdPx
}

/**
 * 是否应进入 sticky。
 * 禁止: 仅因布局塌缩导致 gap 变小就 re-sticky(V1 mermaid 抽动主因)。
 * 禁止: 上滑后手势窗(600ms)残留 + gap 被挤小 → 误吸。
 * 只认「本帧向下滚且已贴底」;「回到最新」走 pin()。
 */
export function shouldEnterSticky(args: {
  gap: number
  bottomGapPx: number
  scrolledUp: boolean
  /** scrollTop 本帧增加(向更新内容方向) */
  scrolledTowardBottom: boolean
  heightRecentlyCollapsed: boolean
}): boolean {
  if (args.scrolledUp) return false
  if (args.heightRecentlyCollapsed) return false
  if (args.gap > args.bottomGapPx) return false
  return args.scrolledTowardBottom
}

export function shouldLeaveSticky(args: {
  gap: number
  bottomGapPx: number
  leaveBottomGapPx: number
  scrolledUp: boolean
  gestured: boolean
}): boolean {
  if (args.scrolledUp) return true
  if (args.gestured && args.gap > args.bottomGapPx) return true
  if (args.gap > args.leaveBottomGapPx) return true
  return false
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
  const collapseGuardPx = options.collapseGuardPx ?? 80
  const collapseGuardMs = options.collapseGuardMs ?? 800
  const enabled = options.enabled ?? true
  const contentRef = options.contentRef

  const stickyRef = useRef(true)
  const [pinned, setPinned] = useState(true)
  const ignoreScrollRef = useRef(false)
  const programmaticRef = useRef(false)
  const lastScrollTopRef = useRef(0)
  const lastHeightRef = useRef(0)
  const lastGestureAtRef = useRef(0)
  /** 最近一次内容大塌缩时刻;护栏内禁止布局误进 sticky */
  const lastCollapseAtRef = useRef(0)
  /** 本 hook 实例是否已做过首次 force 贴底(防 RO 重绑拽底) */
  const didInitFollowRef = useRef(false)
  const rafRef = useRef(0)
  const settleTimerRef = useRef(0)
  const progReleaseRafRef = useRef(0)
  const msgAnchorRef = useRef<VisibleMsgAnchor | null>(null)

  const heightRecentlyCollapsed = useEffectEvent((): boolean =>
    Date.now() - lastCollapseAtRef.current < collapseGuardMs,
  )

  const noteHeightSample = useEffectEvent((h: number) => {
    const prev = lastHeightRef.current
    if (prev > 0 && h < prev - collapseGuardPx) {
      lastCollapseAtRef.current = Date.now()
      scrollDebugLog('height-collapse', {
        sticky: stickyRef.current,
        contentH: h,
        lastH: prev,
        note: `Δ=${Math.round(h - prev)}`,
      })
    }
  })

  const applySticky = useEffectEvent((next: boolean) => {
    if (stickyRef.current === next) return
    const prev = stickyRef.current
    stickyRef.current = next
    setPinned(next)
    const el = scrollerRef.current
    if (el) el.style.overflowAnchor = next ? 'none' : 'auto'
    scrollDebugLog('sticky→', {
      sticky: next,
      note: `${prev}->${next}`,
      scrollTop: el?.scrollTop,
      gap: el ? distanceFromBottom(el) : undefined,
      contentH: contentHeight(),
    })
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
      scrollDebugLog('stabilize-skip-gesture', {
        sticky: false,
        gesture: true,
        scrollTop: el.scrollTop,
        contentH: contentHeight(),
      })
      return
    }
    const topBefore = el.scrollTop
    const delta = restoreMsgAnchor(el, msgAnchorRef.current)
    lastScrollTopRef.current = el.scrollTop
    lastHeightRef.current = contentHeight()
    // 修正后刷新锚点,供下一次突变使用
    msgAnchorRef.current = captureVisibleMsgAnchor(el)
    if (scrollDebugEnabled() && Math.abs(delta) > 1) {
      scrollDebugLog('stabilize-H5', {
        sticky: false,
        scrollTop: el.scrollTop,
        deltaTop: el.scrollTop - topBefore,
        contentH: contentHeight(),
        note: `anchorDelta=${Math.round(delta)} id=${msgAnchorRef.current?.id ?? '?'}`,
      })
    }
  })

  const scrollToBottom = useEffectEvent((behavior: ScrollBehavior = 'auto') => {
    const el = scrollerRef.current
    if (!el || !enabled) return
    if (!stickyRef.current || hasGesture()) return

    const topBefore = el.scrollTop
    scrollDebugLog('scrollToBottom-H1', {
      sticky: true,
      programmatic: true,
      gesture: hasGesture(),
      scrollTop: topBefore,
      gap: distanceFromBottom(el),
      contentH: contentHeight(),
      lastH: lastHeightRef.current,
      note: behavior,
    })

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
          scrollDebugLog('scrollToBottom-rAF-grow', {
            sticky: true,
            scrollTop: node.scrollTop,
            contentH: h,
            deltaTop: node.scrollTop - topBefore,
          })
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
    scrollDebugLog('follow', {
      sticky: true,
      contentH: h,
      lastH: prev,
      note: force ? 'force' : `grew ${Math.round(prev)}→${Math.round(h)}`,
    })
    scrollToBottom('auto')
  })

  /** sticky:合并多次 RO(mermaid 逐个落位);manual:锚定可见消息 */
  const onContentResized = useEffectEvent(() => {
    if (!enabled) return
    const h = contentHeight()
    const prev = lastHeightRef.current
    noteHeightSample(h)
    scrollDebugLog('content-resize-H2?', {
      sticky: stickyRef.current,
      gesture: hasGesture(),
      contentH: h,
      lastH: prev,
      scrollTop: scrollerRef.current?.scrollTop,
      gap: scrollerRef.current ? distanceFromBottom(scrollerRef.current) : undefined,
      note: stickyRef.current ? '→settle-follow' : '→stabilize',
    })
    if (stickyRef.current) {
      // 回缩只改基线,不追(合同);增高再 settle follow
      if (shouldResetHeightBaseline(prev, h)) {
        lastHeightRef.current = h
        return
      }
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
      // 进 sticky 用 1px 阈值:贴底细滑也要能吸回;离 sticky 仍用 upwardThresholdPx 防抖
      const scrolledTowardBottom = top > prevTop + 0.5
      const gestured = hasGesture()
      const collapsed = heightRecentlyCollapsed()

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

      // V1: 禁止「高度塌缩 → gap 变小 → 误 sticky → follow」拉锯
      if (shouldLeaveSticky({
        gap,
        bottomGapPx,
        leaveBottomGapPx,
        scrolledUp,
        gestured,
      })) {
        applySticky(false)
      } else if (shouldEnterSticky({
        gap,
        bottomGapPx,
        scrolledUp,
        scrolledTowardBottom,
        heightRecentlyCollapsed: collapsed,
      })) {
        applySticky(true)
        msgAnchorRef.current = null
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
    if (!stickyRef.current) {
      msgAnchorRef.current = captureVisibleMsgAnchor(el)
    }

    const ro = new ResizeObserver(() => {
      onContentResized()
    })
    ro.observe(content)

    // 禁止 RO 重绑时 applySticky(true)+force 拽底(V1: follow force 与 sticky 同 ms)
    // 仅本实例首次观察且当前仍 sticky 时 force 贴一次
    if (stickyRef.current) {
      if (!didInitFollowRef.current) {
        didInitFollowRef.current = true
        runFollowNow(true)
      } else {
        runFollowNow(false)
      }
    }

    return () => {
      ro.disconnect()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current)
      settleTimerRef.current = 0
      if (progReleaseRafRef.current) cancelAnimationFrame(progReleaseRafRef.current)
      progReleaseRafRef.current = 0
    }
  }, [scrollerRef, contentRef, enabled, onContentResized, runFollowNow])

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

/**
 * [INPUT]: 消息列表滚动容器 ref;内容增长依赖(items/running)
 * [OUTPUT]: useStickToBottom / isNearBottom / shouldFollowScrollHeight —— 流式贴底;上滑即松手
 * [POS]: 对话列滚动体验核;对标 Claude:生成中可上下滑;与 TurnRail 的 scrollIntoView 互不抢权
 *
 * 第一性:
 * 1) 贴底 = 内容增高时视口跟着看最新;不是「距底 < N 就永远钉死」
 * 2) 上滑 = 明确松钉,允许连续滚过本轮长文/图;禁止「轻滑 20px 又 re-pin 拉回底」
 * 3) 高度回缩只改基线不追滚,避免 mermaid/表格非单调增高振荡
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react'

export interface StickToBottomOptions {
  /** 距底大于此 → 视为已离开底部(兜底松钉)。默认 80 */
  unpinThreshold?: number
  /** 用户**向下**滚且距底小于此 → 重新钉住。默认 40 */
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
 * 是否应用贴底滚动。
 * - 增高/等高:跟随
 * - 回缩:默认不追(force 仅用于「回到最新」主动 pin)
 */
export function shouldFollowScrollHeight(prev: number, next: number, force: boolean): boolean {
  if (force) return true
  if (prev <= 0) return true
  return next >= prev
}

/** 回缩时下移高度基线(不滚动) */
export function shouldResetHeightBaseline(prev: number, next: number): boolean {
  return prev > 0 && next < prev
}

export type PinGestureIntent = 'unpin' | 'repin' | 'hold'

/**
 * 手势如何改钉态(纯函数,单测契约)。
 * - 上滑/上拨:一律 unpin(哪怕 gap 只有 10px)——否则轻滑会被 re-pin 顶回底,动量整段飞过本轮
 * - 下滑且已近底:repin
 * - scroll 兜底:仅 gap 很大时 unpin; **绝不**仅因 gap 小而 repin
 */
export function pinIntentFromGesture(opts: {
  /** 负 = 看历史, 正 = 看更新; 0 = 非 wheel/未知 */
  deltaY: number
  gap: number
  unpinThreshold: number
  repinThreshold: number
  /** true = 来自 scroll 事件的兜底,无方向 */
  fromScrollEvent?: boolean
}): PinGestureIntent {
  const { deltaY, gap, unpinThreshold, repinThreshold, fromScrollEvent } = opts
  if (fromScrollEvent) {
    // 只松不钉:避免「上滑 20px → gap=20 ≤ repin → 立刻钉死」
    if (gap > unpinThreshold) return 'unpin'
    return 'hold'
  }
  if (deltaY < 0) return 'unpin'
  if (deltaY > 0 && gap <= repinThreshold) return 'repin'
  return 'hold'
}

export function useStickToBottom(
  scrollerRef: RefObject<HTMLElement | null>,
  contentKey: unknown,
  options: StickToBottomOptions = {},
): { pin: () => void; pinned: boolean } {
  const unpinThreshold = options.unpinThreshold ?? 80
  const repinThreshold = options.repinThreshold ?? 40
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

  const applyIntent = useEffectEvent((intent: PinGestureIntent) => {
    if (intent === 'unpin') applyPinned(false)
    else if (intent === 'repin') applyPinned(true)
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
      if (!shouldFollowScrollHeight(prev, h, forceNow)) {
        if (shouldResetHeightBaseline(prev, h)) lastHeightRef.current = h
        return
      }
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

  // 手势:上滑立刻松钉;下滑近底才 re-pin;scroll 只做「离底很远」兜底松钉
  useEffect(() => {
    const el = scrollerRef.current
    if (!el || !enabled) return

    const onWheel = (e: WheelEvent): void => {
      const gap = distanceFromBottom(el)
      applyIntent(pinIntentFromGesture({
        deltaY: e.deltaY,
        gap,
        unpinThreshold,
        repinThreshold,
      }))
    }

    let touchY = 0
    const onTouchStart = (e: TouchEvent): void => {
      touchY = e.touches[0]?.clientY ?? 0
    }
    const onTouchMove = (e: TouchEvent): void => {
      const y = e.touches[0]?.clientY ?? 0
      const dy = touchY - y // 与 wheel 同号:指上滑内容→看历史→负向意图用 dy>0 表示指下移
      // 手指下移 = 看历史 → unpin; 手指上移近底 = repin
      const gap = distanceFromBottom(el)
      if (y - touchY > 6) {
        applyIntent(pinIntentFromGesture({
          deltaY: -1,
          gap,
          unpinThreshold,
          repinThreshold,
        }))
      } else if (touchY - y > 6) {
        applyIntent(pinIntentFromGesture({
          deltaY: 1,
          gap,
          unpinThreshold,
          repinThreshold,
        }))
      }
      void dy
      touchY = y
    }

    const onScroll = (): void => {
      if (ignoreScrollRef.current) return
      const gap = distanceFromBottom(el)
      applyIntent(pinIntentFromGesture({
        deltaY: 0,
        gap,
        unpinThreshold,
        repinThreshold,
        fromScrollEvent: true,
      }))
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
  }, [scrollerRef, enabled, unpinThreshold, repinThreshold, applyIntent])

  // 结构/尺寸变化跟随
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
    mo.observe(el, { childList: true, subtree: true })

    scheduleFollow(true)
    return () => {
      ro.disconnect()
      mo.disconnect()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
  }, [scrollerRef, enabled, scheduleFollow])

  useEffect(() => {
    if (!enabled) return
    scheduleFollow(false)
  }, [contentKey, enabled, scheduleFollow])

  return { pin, pinned }
}

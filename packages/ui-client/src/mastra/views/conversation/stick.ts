/**
 * [INPUT]: 对话滚动容器的几何与 doc/chat-scroll-ux.md 的 sticky/manual 合同
 * [OUTPUT]: followAfterScroll / followAfterGrowth / useTranscriptStick
 * [POS]: Conversation 的滚动意图；程序贴底不恢复跟随，内容增高才在 sticky 下追底
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject, type UIEvent, type WheelEvent as ReactWheelEvent } from 'react'

export const STICK_GAP = 64
export const STICK_RISE = 16
const GESTURE_MS = 600
const COLLAPSE_PX = 80
const COLLAPSE_MS = 800

export function followAfterScroll(input: {
  following: boolean
  programmatic: boolean
  collapseGuard: boolean
  previousTop: number
  scrollTop: number
  gap: number
}): boolean {
  if (input.programmatic) return input.following
  const movedUp = input.previousTop - input.scrollTop >= STICK_RISE
  const movedDown = input.scrollTop > input.previousTop
  if (movedUp) return false
  if (input.collapseGuard) return input.following
  if (input.gap > STICK_GAP) return false
  if (movedDown && input.gap <= STICK_GAP) return true
  return input.following
}

export function followAfterGrowth(input: {
  following: boolean
  now: number
  gestureUntil: number
  previousHeight: number
  nextHeight: number
}): boolean {
  if (!input.following || input.now < input.gestureUntil) return false
  return input.nextHeight > input.previousHeight
}

export function useTranscriptStick(empty: boolean): {
  transcript: RefObject<HTMLDivElement | null>
  following: boolean
  followingNow: RefObject<boolean>
  onScroll: (event: UIEvent<HTMLDivElement>) => void
  onWheel: (event: ReactWheelEvent<HTMLDivElement>) => void
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
  jumpToLatest: () => void
  scrollToOffset: (top: number) => void
} {
  const transcript = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  const [following, setFollowing] = useState(true)
  const previousTop = useRef(0)
  const previousHeight = useRef(0)
  const gestureUntil = useRef(0)
  const collapseUntil = useRef(0)
  const programmatic = useRef(0)
  const setFollow = (value: boolean) => { follow.current = value; setFollowing(value) }
  const move = (top: number, behavior: ScrollBehavior) => {
    const root = transcript.current
    if (!root) return
    const generation = ++programmatic.current
    root.scrollTo({ top, behavior })
    previousTop.current = root.scrollTop
    if (behavior !== 'smooth') { if (programmatic.current === generation) programmatic.current = 0; return }
    const release = () => { if (programmatic.current === generation) programmatic.current = 0 }
    root.addEventListener('scrollend', release, { once: true })
    window.setTimeout(release, 800)
  }
  const pin = () => { const root = transcript.current; if (root) move(root.scrollHeight, 'auto') }
  useEffect(() => {
    const root = transcript.current
    const content = root?.firstElementChild
    const dock = root?.closest('.mw-conversation')?.querySelector('.composer-dock')
    if (!root || !content || !dock) return
    if (follow.current) pin()
    if (typeof ResizeObserver === 'undefined') return
    const resize = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === dock) root.style.setProperty('--messages-composer-pad', `${Math.max(168, dock.getBoundingClientRect().height + 20)}px`)
      }
      const height = content.getBoundingClientRect().height
      const previous = previousHeight.current
      const now = performance.now()
      if (previous - height > COLLAPSE_PX) collapseUntil.current = now + COLLAPSE_MS
      const grow = followAfterGrowth({ following: follow.current, now, gestureUntil: gestureUntil.current, previousHeight: previous, nextHeight: height })
      previousHeight.current = height
      if (!grow) return
      requestAnimationFrame(() => { if (follow.current && performance.now() >= gestureUntil.current) pin() })
    })
    resize.observe(dock)
    resize.observe(content)
    return () => resize.disconnect()
  }, [empty])
  return {
    transcript, following, followingNow: follow,
    onScroll: event => {
      const el = event.currentTarget
      const next = followAfterScroll({
        following: follow.current, programmatic: programmatic.current !== 0,
        collapseGuard: performance.now() < collapseUntil.current, previousTop: previousTop.current,
        scrollTop: el.scrollTop, gap: el.scrollHeight - el.scrollTop - el.clientHeight,
      })
      previousTop.current = el.scrollTop
      if (next !== follow.current) setFollow(next)
    },
    onWheel: event => {
      gestureUntil.current = performance.now() + GESTURE_MS
      if (event.deltaY < 0) setFollow(false)
    },
    onPointerDown: () => { gestureUntil.current = performance.now() + GESTURE_MS },
    jumpToLatest: () => { setFollow(true); pin() },
    scrollToOffset: top => { setFollow(false); move(top, 'smooth') },
  }
}

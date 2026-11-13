/**
 * [INPUT]: Sprite 的 Shape（锚点、开合、停靠、大小）与写回函数、视口尺寸、prefers-reduced-motion、sprite-place 的纯函数
 * [OUTPUT]: useSpriteMove：头像与浮窗的位置（由锚点算出）、展开阶段（closed/opening/open/closing）与 setOpen；
 *           头像拖动（>4px 才算拖、拖后 click 不打开且下一次按下清标记、键盘激活从不吞、pointer capture、cancel 停在最后位置、Alt+方向键 16px）、浮窗标题栏拖动（带着锚点走）；
 *           展开/收起用 Web Animations 只动 transform 与 opacity，原点在头像中心，中途反向从当前进度倒放，不叠第二层
 * [POS]: Sprite 的交互层。拖动中只用 ref 写 transform，不触发 React 重渲染；松手才写状态与 localStorage。展开的挂载走 transition，不在点击里形成长任务。没有 Element.animate（jsdom）时直接到终态
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { anchorAt, anchorOfWindow, clampOrb, clampWindow, isDrag, nudge, orbPoint, originOf, spriteMotion, windowAt, type Point, type Shape } from './sprite-place'

export type Phase = 'closed' | 'opening' | 'open' | 'closing'
interface Running { dir: 'open' | 'close'; anims: Animation[] }
interface Drag { px: number; py: number; moved: boolean; last: Point }

function useViewport() {
  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const resize = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  return viewport
}

export function useSpriteMove(shape: Shape, commit: (patch: Partial<Shape>) => void, reduced: boolean) {
  const { w: vw, h: vh } = useViewport()
  const orb = orbPoint(shape.anchor, vw, vh), frame = windowAt(orb, shape, vw, vh)
  const orbRef = useRef<HTMLButtonElement>(null), winRef = useRef<HTMLElement>(null)
  const [phase, setPhase] = useState<Phase>(shape.open ? 'open' : 'closed')
  const running = useRef<Running | null>(null), settled = useRef<Animation[]>([])
  const latest = useRef({ orb, frame, vw, vh, reduced, docked: shape.docked })
  latest.current = { orb, frame, vw, vh, reduced, docked: shape.docked }

  // ---- 开合：动画进行中再点就倒放当前这一段，不另起一层 ----
  const setOpen = useCallback((next: boolean) => {
    commit({ open: next })
    const live = running.current, dir = next ? 'open' : 'close'
    if (live) {
      if (live.dir !== dir) { live.dir = dir; for (const anim of live.anims) anim.reverse(); setPhase(next ? 'opening' : 'closing') }
      return
    }
    if (latest.current.docked) { setPhase(next ? 'open' : 'closed'); return }
    // 挂载浮窗（对话、输入框自动聚焦）放进 transition：渲染分片，不在点击里堵成长任务；动画在提交后的布局效应里开始，首帧仍是终态布局
    startTransition(() => setPhase(previous => next ? (previous === 'open' ? 'open' : 'opening') : (previous === 'closed' ? 'closed' : 'closing')))
  }, [commit])

  useLayoutEffect(() => {
    if (phase === 'open' || phase === 'closed') { for (const anim of settled.current) anim.cancel(); settled.current = []; return }
    if (running.current) return
    const dir = phase === 'opening' ? 'open' : 'close', win = winRef.current, orbEl = orbRef.current
    if (!win || typeof win.animate !== 'function') { setPhase(dir === 'open' ? 'open' : 'closed'); return }
    const { orb, frame, reduced } = latest.current, motion = spriteMotion(dir, reduced), origin = originOf(orb, frame)
    win.style.transformOrigin = `${origin.x}px ${origin.y}px`
    const timing: KeyframeAnimationOptions = { duration: motion.duration, easing: motion.easing, fill: 'both' }
    const anims = [win.animate(motion.window, timing), ...(orbEl && typeof orbEl.animate === 'function' ? [orbEl.animate(motion.orb, timing)] : [])]
    const entry: Running = { dir, anims }
    running.current = entry
    anims[0]!.onfinish = () => {
      if (running.current !== entry) return
      running.current = null; settled.current = anims
      setPhase(entry.dir === 'open' ? 'open' : 'closed')
    }
  }, [phase])
  useEffect(() => () => { for (const anim of running.current?.anims ?? []) anim.cancel() }, [])

  // ---- 松手后新位置由锚点算出，拖动时临时写的 transform 在同一帧清掉 ----
  useLayoutEffect(() => {
    orbRef.current?.style.removeProperty('transform')
    winRef.current?.style.removeProperty('transform')
  }, [shape.anchor])

  // ---- 头像：拖与点分开 ----
  const orbDrag = useRef<Drag | null>(null), swallowClick = useRef(false)
  const orbHandlers = {
    onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
      swallowClick.current = false
      if (event.button !== 0) return
      orbDrag.current = { px: event.clientX, py: event.clientY, moved: false, last: latest.current.orb }
      event.currentTarget.setPointerCapture?.(event.pointerId)
    },
    onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
      const drag = orbDrag.current
      if (!drag) return
      const dx = event.clientX - drag.px, dy = event.clientY - drag.py
      if (!drag.moved && !isDrag(dx, dy)) return
      const { orb, vw, vh } = latest.current
      drag.moved = true
      drag.last = clampOrb({ x: orb.x + dx, y: orb.y + dy }, vw, vh)
      event.currentTarget.classList.add('is-dragging')
      event.currentTarget.style.transform = `translate(${drag.last.x - orb.x}px, ${drag.last.y - orb.y}px)`
    },
    onPointerUp(event: ReactPointerEvent<HTMLButtonElement>) { endOrbDrag(event.currentTarget, true) },
    /** 系统取消（切走窗口等）：停在最后的位置；取消之后不会有 click，不必吞 */
    onPointerCancel(event: ReactPointerEvent<HTMLButtonElement>) { endOrbDrag(event.currentTarget, false) },
    /** 键盘激活（detail 0）从不吞；拖后鼠标 click 按手势归属判定，不依赖调度时机 */
    onClick(event: ReactMouseEvent<HTMLButtonElement>) {
      const swallow = swallowClick.current && event.detail !== 0
      swallowClick.current = false
      if (!swallow) setOpen(true)
    },
    onKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
      if (!event.altKey) return
      const { vw, vh } = latest.current, next = nudge(shape.anchor, event.key, vw, vh)
      if (!next) return
      event.preventDefault()
      commit({ anchor: next })
    },
  }
  function endOrbDrag(element: HTMLButtonElement, released: boolean) {
    const drag = orbDrag.current
    orbDrag.current = null
    element.classList.remove('is-dragging')
    if (!drag?.moved) return
    // 拖后迟到的 click 仍属这次手势；没派发时由下次 pointerdown 或键盘激活清除
    if (released) swallowClick.current = true
    const { vw, vh } = latest.current
    commit({ anchor: anchorAt(drag.last, vw, vh) })
  }

  // ---- 浮窗标题栏：拖动带着锚点走 ----
  const winDrag = useRef<Drag | null>(null)
  const headHandlers = {
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      if (latest.current.docked || event.button !== 0 || (event.target as Element).closest('button, input, textarea')) return
      winDrag.current = { px: event.clientX, py: event.clientY, moved: false, last: latest.current.frame }
      event.currentTarget.setPointerCapture?.(event.pointerId)
    },
    onPointerMove(event: ReactPointerEvent<HTMLElement>) {
      const drag = winDrag.current, win = winRef.current
      if (!drag || !win) return
      const { frame, vw, vh } = latest.current
      drag.moved = true
      drag.last = clampWindow({ ...frame, x: frame.x + event.clientX - drag.px, y: frame.y + event.clientY - drag.py }, vw, vh)
      win.style.transform = `translate(${drag.last.x - frame.x}px, ${drag.last.y - frame.y}px)`
    },
    onPointerUp() { endWinDrag() },
    onPointerCancel() { endWinDrag() },
  }
  function endWinDrag() {
    const drag = winDrag.current
    winDrag.current = null
    if (!drag?.moved) return
    const { frame, vw, vh } = latest.current
    commit({ anchor: anchorOfWindow({ ...frame, x: drag.last.x, y: drag.last.y }, vw, vh) })
  }

  return { orb, frame, phase, setOpen, orbRef, winRef, orbHandlers, headHandlers }
}

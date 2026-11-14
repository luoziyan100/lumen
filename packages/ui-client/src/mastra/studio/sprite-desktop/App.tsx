/**
 * [INPUT]: 原生四态缓存、可见性通知、transparent window and shared A04 expression driver/SpriteFigure
 * [OUTPUT]: SpriteDesktopApp；按下即交原生拖动，以实际位移超过4px区分拖点，单击唤回，右键原生菜单
 * [POS]: 桌面窗口唯一入口；不读取研究连接，不创建 HTTP/SSE，位置归 Rust
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { SpriteState } from '../sprite-face'
import { useReducedMotion, useSpriteExpression } from '../sprite-face'
import { isDrag } from '../sprite-place'
import { isSpriteState } from './state'
import { desktopMotion } from './motion'
import { SpriteFigure } from '../SpriteFigure'
import './desktop.css'
import { useT } from '../../../i18n/index.ts'


export function SpriteDesktopApp() {
  const copy = useT().studio.desktop
  const [state, setState] = useState<SpriteState>('idle')
  const [visible, setVisible] = useState(!isTauri())
  const root = useRef<HTMLElement>(null)
  const position = useRef<{ x: number; y: number }>({ x: 0, y: 0 }), scale = useRef(1)
  const gesture = useRef<{ x: number; y: number } | null>(null)
  const reduced = useReducedMotion()
  const expression = useSpriteExpression(state, reduced, visible)

  useEffect(() => {
    if (!isTauri()) return
    let stopped = false, receivedLiveState = false
    const stops: (() => void)[] = []
    const receive = (payload: unknown) => {
      if (!stopped && isSpriteState(payload)) setState(payload)
    }
    void (async () => {
      const window = getCurrentWindow()
      const initial = await window.outerPosition()
      position.current = initial; scale.current = await window.scaleFactor()
      const registered = await Promise.all([
        window.onMoved(event => { position.current = event.payload }),
        listen<unknown>('sprite-state', event => {
          if (isSpriteState(event.payload)) { receivedLiveState = true; receive(event.payload) }
        }),
        listen<boolean>('sprite-presence', event => setVisible(event.payload === true)),
      ])
      if (stopped) { registered.forEach(stop => stop()); return }
      stops.push(...registered)
      const snapshot = await invoke('sprite_snapshot')
      // 注册后收到实时状态，就不再让迟到的初始快照覆盖它。
      if (!receivedLiveState) receive(snapshot)
      if (!stopped) await invoke('sprite_ready')
    })().catch(() => {})
    return () => { stopped = true; stops.forEach(stop => stop()) }
  }, [])

  useEffect(() => {
    const element = root.current
    if (!element) return
    const motion = desktopMotion(visible, reduced)
    if (!element.animate) { element.style.opacity = visible ? '1' : '0'; return }
    const animation = element.animate(motion.frames, { duration: motion.duration, easing: 'ease-out', fill: 'forwards' })
    return () => animation.cancel()
  }, [visible, reduced])

  const start = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !isTauri()) return
    gesture.current = { ...position.current }
    void getCurrentWindow().startDragging().catch(() => {})
  }
  const finish = () => {
    const initial = gesture.current
    if (!initial || !isTauri()) return
    gesture.current = null
    void getCurrentWindow().outerPosition().then(async end => {
      const dragged = isDrag((end.x - initial.x) / scale.current, (end.y - initial.y) / scale.current)
      if (!dragged) await invoke('sprite_action', { action: 'open' })
    })
  }
  const open = (event: React.MouseEvent) => {
    if (event.detail === 0 && isTauri()) void invoke('sprite_action', { action: 'open' }).catch(() => {})
  }
  return <main ref={root} className="sprite-root" data-state={state} data-visible={visible} onContextMenu={event => {
    event.preventDefault()
    if (isTauri()) void invoke('show_sprite_menu').catch(() => {})
  }}>
    <button className="sprite-art-button" type="button" aria-label={copy[state]} onClick={open} onPointerDown={start} onPointerUp={finish}>
      <SpriteFigure state={state} size="desktop" expression={expression} />
    </button>
  </main>
}

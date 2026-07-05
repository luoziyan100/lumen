/**
 * useResizable —— 面板拖拽调宽(侧栏 / 工作区抽屉共用)。
 * edge='right':把手在右缘,向右拖变宽(左侧栏);edge='left':把手在左缘,向左拖变宽(右侧抽屉)。
 * 宽度经 localStorage 记忆,双击复位;实时宽度走 ref(松手事件可能先于最后一次 setState 到达)。
 */
import { useRef, useState, type PointerEvent } from 'react'

interface ResizeOpts {
  edge: 'left' | 'right'
  min: number
  max: number
  fallback: number
  storageKey: string
}

export function useResizable({ edge, min, max, fallback, storageKey }: ResizeOpts) {
  const clamp = (w: number): number => Math.min(max, Math.max(min, Math.round(w)))
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem(storageKey))
    return Number.isFinite(saved) && saved >= min && saved <= max ? saved : fallback
  })
  const widthRef = useRef(width)
  const drag = useRef<{ startX: number; startW: number } | null>(null)

  const handleProps = {
    onPointerDown(e: PointerEvent<HTMLDivElement>): void {
      e.preventDefault()
      drag.current = { startX: e.clientX, startW: widthRef.current }
      e.currentTarget.setPointerCapture(e.pointerId)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    onPointerMove(e: PointerEvent<HTMLDivElement>): void {
      if (!drag.current) return
      const dx = e.clientX - drag.current.startX
      const w = clamp(drag.current.startW + (edge === 'right' ? dx : -dx))
      widthRef.current = w
      setWidth(w)
    },
    onPointerUp(e: PointerEvent<HTMLDivElement>): void {
      if (!drag.current) return
      drag.current = null
      e.currentTarget.releasePointerCapture(e.pointerId)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      localStorage.setItem(storageKey, String(widthRef.current))
    },
    onDoubleClick(): void {
      widthRef.current = fallback
      setWidth(fallback)
      localStorage.setItem(storageKey, String(fallback))
    },
  }
  return { width, handleProps }
}

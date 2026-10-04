/**
 * [INPUT]: 面板边缘、宽度边界与本机存储键
 * [OUTPUT]: useResizable：指针拖宽、双击复位与宽度记忆
 * [POS]: 原阅读器/侧栏交互的独立恢复，不依赖服务或消息状态
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useRef, useState, type PointerEvent } from 'react'

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
    try {
      const saved = Number(localStorage.getItem(storageKey))
      return Number.isFinite(saved) && saved >= min && saved <= max ? saved : fallback
    } catch { return fallback }
  })
  const widthRef = useRef(width)
  const drag = useRef<{ startX: number; startW: number } | null>(null)

  useEffect(() => () => { document.body.style.cursor = ''; document.body.style.userSelect = '' }, [])
  const persist = (value: number) => { try { localStorage.setItem(storageKey, String(value)) } catch { /* 无存储权限仍可调宽。 */ } }
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
      persist(widthRef.current)
    },
    onPointerCancel(): void {
      drag.current = null; document.body.style.cursor = ''; document.body.style.userSelect = ''
    },
    onDoubleClick(): void {
      widthRef.current = fallback
      setWidth(fallback)
      persist(fallback)
    },
  }
  return { width, handleProps }
}

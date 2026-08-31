/**
 * [INPUT]: scrollDebug 开关、缓冲、导出与清空
 * [OUTPUT]: ScrollDebugHud —— 桌面 App 无控制台时的统一 trace 入口
 * [POS]: App 根级;默认隐藏;快捷键开关;关闭时不挂 interval
 *
 * 快捷键(macOS): ⌃⌥⇧S  开关诊断
 * 开启后右下角浮层:场景号 / 清空本轮 / 复制日志 / 关闭
 * [PROTOCOL]: 变更时更新此头部与 doc/chat-scroll-ux.md §6
 */
import { useEffect, useState } from 'react'
import {
  clearScrollDebugLog,
  formatScrollDebugExport,
  getScrollDebugLog,
  scrollDebugEnabled,
  setScrollDebug,
  subscribeScrollDebug,
} from '../scroll/scrollDebug'

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
      return true
    } catch {
      return false
    }
  }
}

export function ScrollDebugHud() {
  const [on, setOn] = useState(() => scrollDebugEnabled())
  const [hint, setHint] = useState<string | null>(null)
  const [count, setCount] = useState(() => getScrollDebugLog().length)
  const [scene, setScene] = useState('')

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      // ⌃⌥⇧S — 无控制台也能开;避免和系统/输入法常见快捷键撞车
      if (!(e.ctrlKey && e.altKey && e.shiftKey)) return
      if (e.key !== 's' && e.key !== 'S') return
      e.preventDefault()
      const next = !scrollDebugEnabled()
      setScrollDebug(next)
      setOn(next)
      setCount(getScrollDebugLog().length)
      setHint(next ? '滚动诊断已开 · 填场景号后复现,再复制日志' : '滚动诊断已关')
      window.setTimeout(() => setHint(null), 3200)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    return subscribeScrollDebug(() => {
      setOn(scrollDebugEnabled())
      setCount(getScrollDebugLog().length)
    })
  }, [])

  async function onCopy(): Promise<void> {
    const text = formatScrollDebugExport(scene)
    const ok = await copyText(text)
    setCount(getScrollDebugLog().length)
    setHint(ok
      ? `已复制 ${getScrollDebugLog().length} 条 · 粘贴到这里发给我`
      : '复制失败 · 再试一次')
    window.setTimeout(() => setHint(null), 4000)
  }

  function onClear(): void {
    clearScrollDebugLog()
    setCount(0)
    setHint('本轮日志已清空')
    window.setTimeout(() => setHint(null), 2000)
  }

  if (!on && !hint) return null

  return (
    <div className="scroll-debug-hud" role="status" aria-live="polite">
      {on ? (
        <div className="scroll-debug-panel">
          <span className="scroll-debug-title">滚动诊断 ON</span>
          <input
            className="scroll-debug-scene"
            value={scene}
            onChange={(e) => setScene(e.target.value)}
            placeholder="T1–T6"
            aria-label="场景编号"
          />
          <span className="scroll-debug-meta">{count} 条</span>
          <button type="button" className="scroll-debug-btn" onClick={onClear}>
            清空本轮
          </button>
          <button type="button" className="scroll-debug-btn" onClick={() => { void onCopy() }}>
            复制日志
          </button>
          <button
            type="button"
            className="scroll-debug-btn scroll-debug-btn-mute"
            onClick={() => {
              setScrollDebug(false)
              setOn(false)
              setHint('滚动诊断已关')
              window.setTimeout(() => setHint(null), 2000)
            }}
          >
            关闭
          </button>
        </div>
      ) : null}
      {hint ? <div className="scroll-debug-hint">{hint}</div> : null}
    </div>
  )
}

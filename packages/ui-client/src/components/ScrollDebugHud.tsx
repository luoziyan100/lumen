/**
 * [INPUT]: scrollDebug 开关与日志缓冲
 * [OUTPUT]: ScrollDebugHud —— 桌面 App 无控制台时的滚动诊断入口
 * [POS]: App 根级;默认隐藏;快捷键开关
 *
 * 快捷键(macOS): ⌃⌥⇧S  开关诊断
 * 开启后右下角浮层:复制日志 / 关闭
 * [PROTOCOL]: 变更时更新此头部与 doc/chat-scroll-ux.md §6
 */
import { useEffect, useState } from 'react'
import {
  getScrollDebugLog,
  scrollDebugEnabled,
  setScrollDebug,
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
      setHint(next ? '滚动诊断已开 · 复现跳动后点「复制日志」' : '滚动诊断已关')
      window.setTimeout(() => setHint(null), 3200)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 开着时刷条数,不用订阅总线
  useEffect(() => {
    if (!on) return
    const id = window.setInterval(() => setCount(getScrollDebugLog().length), 400)
    return () => window.clearInterval(id)
  }, [on])

  async function onCopy(): Promise<void> {
    const log = getScrollDebugLog()
    const text = JSON.stringify(log, null, 2)
    const ok = await copyText(text)
    setCount(log.length)
    setHint(ok
      ? `已复制 ${log.length} 条 · 粘贴到这里发给我`
      : '复制失败 · 再试一次')
    window.setTimeout(() => setHint(null), 4000)
  }

  if (!on && !hint) return null

  return (
    <div className="scroll-debug-hud" role="status" aria-live="polite">
      {on ? (
        <div className="scroll-debug-panel">
          <span className="scroll-debug-title">滚动诊断 ON</span>
          <span className="scroll-debug-meta">{count} 条</span>
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

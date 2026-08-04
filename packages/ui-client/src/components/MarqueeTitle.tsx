/**
 * [INPUT]: 单行标题文案;ResizeObserver / pointer 时测真实字宽
 * [OUTPUT]: MarqueeTitle —— 溢出时悬停从右往左跑马灯(hover marquee)
 * [POS]: 侧栏会话名;必须是 button.sb-item 的后代(见 Sidebar Trigger render=)
 *        位移用 px CSS 变量,不靠 keyframes 里的 cqi(行为在 WK 里难观测/易被布局时序坑)
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'

/** 进跑马灯的最大字符(防极端长 goal 拖动画) */
const MAX_CHARS = 72

export function MarqueeTitle({
  text,
  className = '',
}: {
  text: string
  className?: string
}) {
  const wrapRef = useRef<HTMLSpanElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const [shift, setShift] = useState(0)
  const [hot, setHot] = useState(false)

  const display = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text

  const measure = useCallback((): void => {
    const wrap = wrapRef.current
    const inner = textRef.current
    if (!wrap || !inner) return
    // ellipsis+max-width 时 scrollWidth≈槽宽——离屏探针量自然宽
    const probe = inner.cloneNode(true) as HTMLElement
    probe.removeAttribute('id')
    probe.className = 'sb-marquee-text'
    probe.style.cssText =
      'position:absolute;left:0;top:0;visibility:hidden;display:inline-block;' +
      'max-width:none;width:auto;overflow:visible;white-space:nowrap;pointer-events:none'
    wrap.appendChild(probe)
    const next = Math.max(0, Math.ceil(probe.scrollWidth - wrap.clientWidth))
    wrap.removeChild(probe)
    setShift(next)
  }, [])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    measure()
    const ro = new ResizeObserver(() => measure())
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [display, measure])

  const overflow = shift > 2
  const durationSec = Math.min(12, Math.max(2.4, shift / 36))
  const style = overflow
    ? ({
        '--sb-marquee-shift': `${shift}px`,
        '--sb-marquee-dur': `${durationSec}s`,
      } as CSSProperties)
    : undefined

  return (
    <span
      ref={wrapRef}
      className={
        `sb-marquee${overflow ? ' is-overflow' : ''}${hot ? ' is-hot' : ''}` +
        (className ? ` ${className}` : '')
      }
      style={style}
      onPointerEnter={() => {
        measure()
        setHot(true)
      }}
      onPointerLeave={() => setHot(false)}
    >
      <span ref={textRef} className="sb-marquee-text">{display}</span>
    </span>
  )
}

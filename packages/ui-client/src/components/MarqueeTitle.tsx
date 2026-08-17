/**
 * [INPUT]: 单行标题;active 由 Sidebar 经 isSessionMarqueeActive 注入;marqueeDurationSec / MARQUEE_GAP_PX
 * [OUTPUT]: MarqueeTitle —— 溢出时单向走马灯(双份文案 + translateX(-50%))
 * [POS]: 侧栏会话名;必须是 button.sb-item 的后代(见 Sidebar Trigger render=)
 *        闲置 ellipsis;热态双轨滚动。热态不自管 pointer——Kumo Trigger 下 leave 会粘住单行
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { MARQUEE_GAP_PX, marqueeDurationSec } from '../marquee/marqueeDuration'

/** 进跑马灯的最大字符 */
const MAX_CHARS = 72

export function MarqueeTitle({
  text,
  className = '',
  active = false,
}: {
  text: string
  className?: string
  /** 行悬停或菜单打开:由 Sidebar 保证同一时刻最多一条 */
  active?: boolean
}) {
  const wrapRef = useRef<HTMLSpanElement>(null)
  const [overflowPx, setOverflowPx] = useState(0)
  const [cyclePx, setCyclePx] = useState(0)

  const display = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text

  const measure = useCallback((): void => {
    const wrap = wrapRef.current
    if (!wrap) return
    const probe = document.createElement('span')
    probe.className = 'sb-marquee-seg'
    probe.textContent = display
    probe.style.cssText =
      'position:absolute;left:0;top:0;visibility:hidden;display:inline-block;' +
      'max-width:none;width:auto;overflow:visible;white-space:nowrap;pointer-events:none;' +
      `padding-right:${MARQUEE_GAP_PX}px`
    wrap.appendChild(probe)
    const seg = Math.ceil(probe.scrollWidth) // 含 gap
    const natural = Math.ceil(probe.scrollWidth - MARQUEE_GAP_PX)
    wrap.removeChild(probe)
    setCyclePx(seg)
    setOverflowPx(Math.max(0, natural - wrap.clientWidth))
  }, [display])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    measure()
    const ro = new ResizeObserver(() => measure())
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [display, measure])

  const overflow = overflowPx > 2
  const rolling = overflow && active
  const durationSec = marqueeDurationSec(cyclePx)
  const style = rolling && durationSec > 0
    ? ({ '--sb-marquee-dur': `${durationSec}s` } as CSSProperties)
    : undefined

  useEffect(() => {
    if (active) measure()
  }, [active, measure])

  return (
    <span
      ref={wrapRef}
      className={
        `sb-marquee${overflow ? ' is-overflow' : ''}${active ? ' is-hot' : ''}` +
        (className ? ` ${className}` : '')
      }
      style={style}
    >
      {rolling ? (
        <span className="sb-marquee-track">
          <span className="sb-marquee-seg">{display}</span>
          <span className="sb-marquee-seg" aria-hidden="true">{display}</span>
        </span>
      ) : (
        <span className="sb-marquee-text">{display}</span>
      )}
    </span>
  )
}

/**
 * [INPUT]: turnRail 的 TurnRailItem;宿主 onSelectTurn(滚到锚点)
 * [OUTPUT]: TurnPreviewRail —— 竖轨圆点(鱼眼缩放) + 悬停预览卡(CSS,无 motion)
 * [POS]: 对话列左侧浮层;空闲点极小(防抢眼);窄栏/阅读器开时 CSS 隐藏
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useState, type KeyboardEvent } from 'react'
import type { TurnRailItem } from './turnRail'

const MIN_TURNS = 4

export function TurnPreviewRail({
  turns,
  activeId,
  onSelectTurn,
}: {
  turns: TurnRailItem[]
  /** IntersectionObserver 驱动的「当前可见」轮 */
  activeId: string | null
  onSelectTurn: (userMsgId: string) => void
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)

  if (turns.length < MIN_TURNS) return null

  const displayedId = hoveredId ?? focusedId
  const displayedIndex = displayedId
    ? turns.findIndex((t) => t.id === displayedId)
    : -1
  const preview = displayedIndex >= 0 ? turns[displayedIndex] : null

  function scaleFor(index: number): number {
    if (displayedIndex < 0) {
      // 空闲:全体小圆点;当前轮略大
      if (activeId && turns[index]?.id === activeId) return 0.72
      return 0.5
    }
    const d = Math.abs(index - displayedIndex)
    if (d === 0) return 1
    if (d === 1) return 0.78
    if (d === 2) return 0.62
    return 0.5
  }

  return (
    <div
      className="turn-rail"
      onPointerLeave={() => setHoveredId(null)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setFocusedId(null)
        }
      }}
    >
      <nav
        className="turn-rail-nav"
        aria-label="对话轮次"
        style={{ gridTemplateRows: `repeat(${turns.length}, 1.5rem)` }}
      >
        {turns.map((turn, index) => {
          const selected = turn.id === activeId
          const highlighted = turn.id === displayedId
          const scale = scaleFor(index)
          return (
            <button
              key={turn.id}
              type="button"
              className={`turn-rail-hit${highlighted ? ' is-hot' : ''}${selected ? ' is-active' : ''}`}
              aria-label={turn.label}
              aria-current={selected ? 'true' : undefined}
              onPointerEnter={() => setHoveredId(turn.id)}
              onFocus={(e) => {
                if (e.currentTarget.matches(':focus-visible')) setFocusedId(turn.id)
              }}
              onClick={() => onSelectTurn(turn.userMsgId)}
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelectTurn(turn.userMsgId)
                }
              }}
            >
              <span
                aria-hidden="true"
                className="turn-rail-tick"
                style={{ transform: `scale(${scale})` }}
              />
            </button>
          )
        })}
      </nav>

      <div
        className="turn-rail-preview-layer"
        aria-hidden="true"
        style={{ gridTemplateRows: `repeat(${turns.length}, 1.5rem)` }}
      >
        {turns.map((turn) => (
          <div key={turn.id} className="turn-rail-preview-slot">
            {preview && turn.id === preview.id ? (
              <div className="turn-rail-preview">
                <p className="turn-rail-preview-title">{preview.label}</p>
                <p className="turn-rail-preview-desc">{preview.description}</p>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

export { MIN_TURNS as TURN_RAIL_MIN }

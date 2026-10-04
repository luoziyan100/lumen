/**
 * [INPUT]: 原生消息派生轮次、会话滚动容器、显式跳转回调
 * [OUTPUT]: TurnRail；原圆点缩放、当前轮高亮与对齐对应轮次的悬停/键盘摘要
 * [POS]: 只控制局部滚动位置；不改变会话消息或自动跟随策略
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useState, type RefObject } from 'react'
import { messageAnchor, type TurnItem } from './content.ts'

export function TurnRail({ turns, scroller, onSelect }: { turns: TurnItem[]; scroller: RefObject<HTMLDivElement | null>; onSelect: (id: string) => void }) {
  const [active, setActive] = useState(''), [hovered, setHovered] = useState(''), [focused, setFocused] = useState('')
  const preview = turns.find(turn => turn.id === (hovered || focused))
  useEffect(() => {
    const root = scroller.current
    if (!root || turns.length < 4) return
    let frame = 0
    const update = () => {
      const top = root.getBoundingClientRect().top + root.clientHeight * 0.2
      let current = turns[0]!.id
      for (const turn of turns) {
        const node = document.getElementById(messageAnchor(turn.id))
        if (node && root.contains(node) && node.getBoundingClientRect().top <= top) current = turn.id
      }
      setActive(current)
    }
    const scroll = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update) }
    update(); root.addEventListener('scroll', scroll, { passive: true })
    return () => { root.removeEventListener('scroll', scroll); cancelAnimationFrame(frame) }
  }, [turns, scroller])
  if (turns.length < 4) return null
  const previewIndex = turns.findIndex(turn => turn.id === preview?.id)
  return <div className="turn-rail mw-turn-rail" onPointerLeave={() => setHovered('')} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused('') }}>
    <nav className="turn-rail-nav" aria-label="对话轮次" style={{ gridTemplateRows: `repeat(${turns.length}, 1.5rem)` }}>{turns.map((turn, index) => {
      const distance = Math.abs(index - previewIndex), scale = previewIndex < 0 ? (turn.id === active ? 0.72 : 0.5) : [1, 0.78, 0.62][distance] ?? 0.5
      return <button type="button" className={`turn-rail-hit${turn.id === active ? ' is-active' : ''}${turn.id === preview?.id ? ' is-hot' : ''}`} key={turn.id} aria-label={`第 ${index + 1} 轮：${turn.label}`} aria-current={turn.id === active ? 'step' : undefined} onPointerEnter={() => setHovered(turn.id)} onFocus={event => { if (event.currentTarget.matches(':focus-visible')) setFocused(turn.id) }} onClick={() => { setActive(turn.id); onSelect(turn.id) }}><span className="turn-rail-tick" style={{ transform: `scale(${scale})` }} /></button>
    })}</nav>
    <div className="turn-rail-preview-layer" aria-hidden="true" style={{ gridTemplateRows: `repeat(${turns.length}, 1.5rem)` }}>{turns.map(turn => <div className="turn-rail-preview-slot" key={turn.id}>{preview?.id === turn.id && <div className="turn-rail-preview"><p className="turn-rail-preview-title">{preview.label}</p><p className="turn-rail-preview-desc">{preview.description}</p></div>}</div>)}</div>
  </div>
}

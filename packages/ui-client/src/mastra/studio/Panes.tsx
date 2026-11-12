/**
 * [INPUT]: localStorage、窗口键盘事件、统一 icons 的 PanelIcon
 * [OUTPUT]: usePanes：左右栏收起状态与分屏比例（存 localStorage），⌘B 收放主题栏、⌘⌥B 收放素材栏；
 *           splitBoardWidth：分屏时白板段宽（白板 ≥360、阅读器 ≥420，放不下时先压阅读器）；PaneToggle：收起/展开按钮（aria-expanded、title 带快捷键）；
 *           Splitter：分屏分隔条（拖动、双击各一半、方向键）
 * [POS]: StudioApp 的显示层布局状态；不进服务端，不改主题数据
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { PanelIcon } from '../../components/icons'
import { STUDIO_COPY as S } from '../../copy/studioCopy'

export const PANES_KEY = 'lumen.studio.panes'
export const SPLIT = { BOARD_MIN: 360, READER_MIN: 420, RATIO: 0.5 }
export type Side = 'left' | 'right'
interface Panes { left: boolean; right: boolean; ratio: number }

function load(): Panes {
  try {
    const saved = JSON.parse(localStorage.getItem(PANES_KEY) ?? 'null') as Partial<Panes> | null
    const ratio = typeof saved?.ratio === 'number' && saved.ratio > 0 && saved.ratio < 1 ? saved.ratio : SPLIT.RATIO
    return { left: saved?.left === true, right: saved?.right === true, ratio }
  } catch { return { left: false, right: false, ratio: SPLIT.RATIO } }
}

/** 白板段宽：按比例，夹在 [360, 总宽 − 420]；两个下限放不下时白板保住 360，先压阅读器（与 studio.css 的 clamp 同一规则） */
export function splitBoardWidth(total: number, ratio: number) {
  return Math.min(total, Math.max(SPLIT.BOARD_MIN, Math.min(total * ratio, total - SPLIT.READER_MIN)))
}

/** left / right 为 true 表示那一栏收起 */
export function usePanes() {
  const [panes, setPanes] = useState(load)
  useEffect(() => { try { localStorage.setItem(PANES_KEY, JSON.stringify(panes)) } catch { /* 仅本次有效 */ } }, [panes])
  const toggle = useCallback((side: Side) => setPanes(previous => ({ ...previous, [side]: !previous[side] })), [])
  const setRatio = useCallback((ratio: number) => setPanes(previous => ({ ...previous, ratio })), [])
  // ---- ⌘B 主题栏、⌘⌥B 素材栏；按物理键位认 B（⌥ 会把字符变成 ∫） ----
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.code !== 'KeyB') return
      event.preventDefault()
      toggle(event.altKey ? 'right' : 'left')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])
  return { ...panes, toggle, setRatio }
}

/** 收起按钮在栏头右侧；展开按钮在中栏头部最左 / 最右。右栏用同一轮廓镜像 */
export function PaneToggle({ side, open, onToggle, className = '' }: { side: Side; open: boolean; onToggle: () => void; className?: string }) {
  const copy = S.panes[side], label = open ? copy.collapse : copy.expand
  return <button type="button" className={`icon-btn pane-toggle ${className}`.trim()} data-pane={side} aria-controls={side === 'left' ? 'studio-topics' : 'studio-materials'} aria-label={label} aria-expanded={open}
    aria-keyshortcuts={copy.keys} title={`${label} ${copy.key}`} onClick={onToggle}><PanelIcon mirrored={side === 'right'} /></button>
}

/** 分屏分隔条：8px 命中区、悬停显 1px 线；拖动改比例（夹在两个下限之间），双击回到各一半，←/→ 键每次 5% */
export function Splitter({ host, ratio, onRatio }: { host: HTMLElement | null; ratio: number; onRatio: (ratio: number) => void }) {
  const dragging = useRef(false)
  const settle = (raw: number) => { const total = host?.clientWidth ?? 0; if (total) onRatio(splitBoardWidth(total, raw) / total) }
  const at = (clientX: number) => { if (host?.clientWidth) settle((clientX - host.getBoundingClientRect().left - host.clientLeft) / host.clientWidth) }
  const end = () => { dragging.current = false; host?.classList.remove('is-resizing') }
  return <div className="studio-splitter" role="separator" aria-orientation="vertical" aria-label={S.reader.splitter} title={S.reader.splitter} tabIndex={0}
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}
    onPointerDown={event => { dragging.current = true; host?.classList.add('is-resizing'); event.currentTarget.setPointerCapture?.(event.pointerId); event.preventDefault() }}
    onPointerMove={event => { if (dragging.current) at(event.clientX) }} onPointerUp={end} onPointerCancel={end}
    onDoubleClick={() => onRatio(SPLIT.RATIO)}
    onKeyDown={event => {
      const step = event.key === 'ArrowLeft' ? -0.05 : event.key === 'ArrowRight' ? 0.05 : 0
      if (step) { event.preventDefault(); settle(ratio + step) }
    }} />
}

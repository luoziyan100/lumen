/**
 * [INPUT]: useBoard 的白板张与视图、主题材料、精灵传来的「正在画/跳到某块」信号
 * [OUTPUT]: Board：白板画布——张标签与 ＋、DOM + CSS transform 平移缩放、按实测高度的三列排版、白板边界与「已用 n / 8」、AI 正在画提示、小部件同时运行名额
 * [POS]: 中间「白板」视图；P0 对人只读（不圈、不钉、不改）。坐标列由服务端定，纵向位置按渲染后实测高度重排，避免估高造成重叠
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { MinusIcon, PlusIcon, ExpandIcon } from '../../components/icons'
import { STUDIO_COPY as S } from '../../copy/studioCopy'
import type { TopicMaterial } from '../data/client.ts'
import { BlockCard, type Block } from './Block'
import type { BoardState } from './useBoard'

const GAP = 32, PAD = 40, MAX_WIDGETS = 2

/** 按列（x）分组、组内按服务端 y 排序，再用实测高度从上往下堆；没量到的先用服务端估高。 */
export function stackLayout(blocks: Block[], heights: Record<string, number>) {
  const columns = new Map<number, Block[]>()
  for (const block of blocks) columns.set(block.x, [...(columns.get(block.x) ?? []), block])
  const top = new Map<string, number>()
  for (const column of columns.values()) {
    let y = 0
    for (const block of column.sort((a, b) => a.y - b.y)) { top.set(block.id, y); y += (heights[block.id] ?? block.h) + GAP }
  }
  return top
}

export function Board({ board, materials, drawing, focus, onOpenSource }: {
  board: BoardState
  materials: TopicMaterial[]
  drawing: string | null
  focus: { blockId: string; nonce: number } | null
  onOpenSource: (itemId: string, page?: number) => void
}) {
  const viewport = useRef<HTMLDivElement>(null), world = useRef<HTMLDivElement>(null)
  const [camera, setCamera] = useState({ x: PAD * 2, y: PAD * 2, scale: 1 })
  const fitted = useRef<string | null>(null)
  const [heights, setHeights] = useState<Record<string, number>>({})
  const [widgets, setWidgets] = useState<string[]>([])
  const [focused, setFocused] = useState<string | null>(null)
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)
  const view = board.view, blocks = view?.blocks ?? []
  const byId = useMemo(() => new Map(materials.map(item => [item.id, item])), [materials])
  const titles = useMemo(() => new Map(blocks.map(block => [block.id, block.title])), [blocks])
  const tops = useMemo(() => stackLayout(blocks, heights), [blocks, heights])
  const positioned = blocks.map(block => ({ ...block, y: tops.get(block.id) ?? block.y }))
  const bounds = positioned.reduce((box, block) => ({ w: Math.max(box.w, block.x + block.w), h: Math.max(box.h, block.y + (heights[block.id] ?? block.h)) }), { w: 0, h: 0 })
  const writable = view && board.writable === view.sheet.id

  // ---- 小部件名额：默认前两块运行，点开的挤掉最早的 ----
  useEffect(() => {
    const ids = blocks.filter(block => block.kind === 'widget' && block.state === 'current').map(block => block.id)
    setWidgets(previous => { const kept = previous.filter(id => ids.includes(id)); return kept.length ? kept : ids.slice(0, MAX_WIDGETS) })
  }, [view?.sheet.id, blocks.length])
  const activate = useCallback((id: string) => setWidgets(previous => [...previous.filter(item => item !== id), id].slice(-MAX_WIDGETS)), [])

  // ---- 量高：块内容（Markdown、小部件）渲染后高度才准 ----
  useLayoutEffect(() => {
    const root = world.current
    if (!root) return
    const measure = () => {
      const next: Record<string, number> = {}
      for (const node of root.querySelectorAll<HTMLElement>('[data-block]')) next[node.dataset.block!] = node.offsetHeight
      setHeights(previous => Object.keys(next).length === Object.keys(previous).length && Object.entries(next).every(([id, h]) => previous[id] === h) ? previous : next)
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    for (const node of root.querySelectorAll<HTMLElement>('[data-block]')) observer?.observe(node)
    return () => observer?.disconnect()
  }, [blocks, widgets])

  const fit = useCallback((floor = 0.3) => {
    const box = viewport.current?.getBoundingClientRect()
    if (!box || !bounds.w) { setCamera({ x: PAD * 2, y: PAD * 2, scale: 1 }); return }
    const scale = Math.max(floor, Math.min(1, (box.width - PAD * 4) / bounds.w, (box.height - PAD * 4) / bounds.h))
    setCamera({ x: Math.max(PAD * 2, (box.width - bounds.w * scale) / 2), y: PAD * 2, scale })
  }, [bounds.w, bounds.h])

  // ---- 每张白板第一次量完高度后看全貌一次（不小于 80%，保证能读）；之后的平移缩放归用户 ----
  useEffect(() => {
    if (!view || fitted.current === view.sheet.id || blocks.some(block => heights[block.id] === undefined)) return
    fitted.current = view.sheet.id
    fit(0.8)
  }, [view?.sheet.id, heights, fit])

  // ---- 跳到某块：移到视口中间并短暂高亮 ----
  useEffect(() => {
    if (!focus) return
    const target = positioned.find(block => block.id === focus.blockId), box = viewport.current?.getBoundingClientRect()
    if (!target || !box) return
    setCamera(camera => ({ ...camera, x: box.width / 2 - (target.x + target.w / 2) * camera.scale, y: box.height / 3 - target.y * camera.scale }))
    setFocused(target.id)
    const timer = window.setTimeout(() => setFocused(null), 2400)
    return () => clearTimeout(timer)
  }, [focus?.nonce, view?.sheet.id])

  function zoomAt(factor: number, clientX?: number, clientY?: number) {
    const box = viewport.current?.getBoundingClientRect()
    setCamera(camera => {
      const scale = Math.max(0.3, Math.min(2.5, camera.scale * factor))
      const px = clientX !== undefined && box ? clientX - box.left : (box?.width ?? 0) / 2, py = clientY !== undefined && box ? clientY - box.top : (box?.height ?? 0) / 2
      return { scale, x: px - (px - camera.x) * scale / camera.scale, y: py - (py - camera.y) * scale / camera.scale }
    })
  }
  function onWheel(event: ReactWheelEvent) {
    if (event.ctrlKey || event.metaKey) zoomAt(event.deltaY < 0 ? 1.1 : 1 / 1.1, event.clientX, event.clientY)
    else setCamera(camera => ({ ...camera, x: camera.x - event.deltaX, y: camera.y - event.deltaY }))
  }
  function onPointerDown(event: ReactPointerEvent) {
    if ((event.target as Element).closest('[data-block], button, a, iframe, input')) return
    drag.current = { x: event.clientX, y: event.clientY, cx: camera.x, cy: camera.y }
    ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  }
  function onPointerMove(event: ReactPointerEvent) {
    const start = drag.current
    if (start) setCamera(camera => ({ ...camera, x: start.cx + event.clientX - start.x, y: start.cy + event.clientY - start.y }))
  }

  return <section className="studio-board" aria-label={S.views.board.label}>
    <nav className="board-sheets" aria-label="白板">
      {board.sheets.map(sheet => <button type="button" key={sheet.id} className={sheet.id === board.selected ? 'on' : ''} aria-pressed={sheet.id === board.selected} onClick={() => board.select(sheet.id)}>
        {sheet.title}{sheet.state !== 'live' && <small> · 已收起</small>}</button>)}
      <button type="button" className="board-sheet-new" title={S.board.newSheet} aria-label={S.board.newSheet} onClick={() => void board.createSheet()}>＋</button>
    </nav>
    <div className="board-viewport" ref={viewport} onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
      <div className="board-world" ref={world} style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` }}>
        {view && <div className="board-frame" style={{ width: Math.max(bounds.w, 400) + PAD * 2, height: Math.max(bounds.h, 240) + PAD * 2, left: -PAD, top: -PAD }}>
          <span className="board-frame-label">{S.board.frame(view.sheet.used, view.sheet.capacity)}</span>
        </div>}
        {positioned.map(block => <BlockCard key={block.id} block={block} materials={byId} supersededTitle={block.supersededBy ? titles.get(block.supersededBy) : undefined}
          widgetActive={widgets.includes(block.id)} onActivateWidget={activate} onOpenSource={onOpenSource} focused={focused === block.id} drawing={drawing === block.id} />)}
      </div>
      {view && !blocks.length && <p className="board-empty">{S.board.empty}</p>}
      {!view && !board.sheets.length && !board.error && <p className="board-empty">{S.board.noLive}</p>}
      {view && !writable && board.writable === null && <p className="board-empty board-hint">{S.board.noLive}</p>}
      {drawing && <div className="board-drawing" role="status"><span className="board-drawing-dot" />{drawing === 'new' ? S.board.drawing : S.board.updating}</div>}
      {board.error && <p className="mw-error board-error" role="alert">{board.error}</p>}
      <div className="board-zoom">
        <button type="button" className="icon-btn" aria-label={S.board.zoomOut} onClick={() => zoomAt(1 / 1.15)}><MinusIcon /></button>
        <span className="board-zoom-value">{Math.round(camera.scale * 100)}%</span>
        <button type="button" className="icon-btn" aria-label={S.board.zoomIn} onClick={() => zoomAt(1.15)}><PlusIcon /></button>
        <button type="button" className="icon-btn" aria-label={S.board.fit} title={S.board.fit} onClick={() => fit()}><ExpandIcon /></button>
      </div>
    </div>
  </section>
}

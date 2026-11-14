/**
 * [INPUT]: useBoard 的白板张与视图、主题材料、精灵传来的「正在画/跳到某块」信号、layout.ts 的按宽排列
 * [OUTPUT]: Board：白板画布——左上角浮层（多张时的张标签：白板图标 + 序号，完整标题在 title/aria-label，收起的变淡，本轮写入目标在 AI 画时带小点，放不下横向滚动不换行；每张带「⋯」菜单（悬停/聚焦出现，选中那张常显；只有一张时在 ＋ 旁）删除白板，有内容先弹确认，本轮写入目标不可删；＋ 新开即选中；不显示已用块数，上限与 R11 在服务端不变，写满时边框标签如实写「已经写满」）、
 *           画布起点在浮层之下（BOARD.TOP ≥ 浮层顶 12 + 高 30 + 12，首屏不压区块标题）、DOM + CSS transform 平移缩放（默认 100%，看全貌可缩小）、
 *           按视口宽度 1–3 列重排、贴着内容的白板边框、AI 正在画提示、小部件同时运行名额、右下角缩放条
 * [POS]: 中间「白板」视图；P0 对人只读（不圈、不钉、不改）。看着哪张，下一条消息就写哪张（R16）；收起的那张提示 AI 不会写在这里。对话卡片指向已删除白板上的块时只提示「这块所在的白板已删除」，不跳到别处（R17）。列与位置只在显示层重排，服务端坐标不动
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import { Dialog } from '@cloudflare/kumo/components/dialog'
import { DropdownMenu } from '@cloudflare/kumo/components/dropdown'
import { BoardViewIcon, MinusIcon, MoreIcon, PlusIcon, ExpandIcon } from '../../components/icons'
import { useT } from '../../i18n/index.ts'
import type { Sheet, TopicMaterial } from '../data/client.ts'
import { BlockCard } from './Block'
import { BOARD, flowLayout } from './layout'
import type { BoardState } from './useBoard'

const MAX_WIDGETS = 2
const HOME = { x: BOARD.INSET + BOARD.PAD, y: BOARD.TOP + BOARD.PAD, scale: 1 }
const NOTICE_MS = 4000

/** A sheet's 「⋯」 menu with its one item (R17). The run's target cannot be deleted; the reason sits in the item's title. */
function SheetMenu({ name, busy, className, onRemove }: { name: string; busy: boolean; className: string; onRemove: () => void }) {
  const S = useT().studio
  return <DropdownMenu>
    <DropdownMenu.Trigger render={<button type="button" className={className} aria-label={S.board.more(name)} title={S.board.more(name)} />}><MoreIcon size={16} /></DropdownMenu.Trigger>
    <DropdownMenu.Content align="start" sideOffset={6} className="glass-card">
      <DropdownMenu.Item disabled={busy} title={busy ? S.board.removeBusy : undefined} onClick={onRemove}>{S.board.remove}</DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu>
}

export function Board({ board, materials, drawing, focus, onOpenSource }: {
  board: BoardState
  materials: TopicMaterial[]
  drawing: string | null
  focus: { blockId: string; nonce: number } | null
  onOpenSource: (itemId: string, page?: number) => void
}) {
  const S = useT().studio
  const viewport = useRef<HTMLDivElement>(null), world = useRef<HTMLDivElement>(null), strip = useRef<HTMLSpanElement>(null)
  const [camera, setCamera] = useState(HOME)
  const [width, setWidth] = useState(0)
  const [heights, setHeights] = useState<Record<string, number>>({})
  const [widgets, setWidgets] = useState<string[]>([])
  const [focused, setFocused] = useState<string | null>(null)
  // ---- R17: a sheet with blocks waits here for the user's confirmation; a card whose sheet was deleted shows a short notice ----
  const [pending, setPending] = useState<{ sheet: Sheet; number: number; blocks: number } | null>(null)
  const [removing, setRemoving] = useState(false), [notice, setNotice] = useState(false)
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)
  const view = board.view, blocks = view?.blocks ?? []
  const byId = useMemo(() => new Map(materials.map(item => [item.id, item])), [materials])
  const titles = useMemo(() => new Map(blocks.map(block => [block.id, block.title])), [blocks])
  const layout = useMemo(() => flowLayout(blocks, heights, width), [blocks, heights, width])
  const positioned = blocks.map(block => ({ ...block, ...(layout.placed.get(block.id) ?? {}) }))
  const selectedSheet = board.sheets.find(sheet => sheet.id === board.selected)
  const tabs = board.sheets.length > 1 || (selectedSheet && selectedSheet.state !== 'live')

  // ---- 视口宽度决定列数；换一张白板回到左上角 100%。阅读器铺满时白板隐藏（宽 0），保留原来的排列 ----
  useLayoutEffect(() => {
    const node = viewport.current
    if (!node) return
    const measure = () => { if (node.clientWidth) setWidth(node.clientWidth) }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(node)
    return () => observer?.disconnect()
  }, [])
  useEffect(() => { setCamera(HOME) }, [view?.sheet.id])
  // ---- the selected tab stays in sight when the strip scrolls (narrow board, many sheets): it is where the next message writes ----
  useLayoutEffect(() => {
    const row = strip.current, on = row?.querySelector<HTMLElement>('.board-tab.is-on')
    if (!row || !on) return
    if (on.offsetLeft < row.scrollLeft) row.scrollLeft = on.offsetLeft
    else if (on.offsetLeft + on.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollLeft = on.offsetLeft + on.offsetWidth - row.clientWidth
  }, [board.selected, board.sheets.length, width])

  // ---- 小部件名额：默认前两块运行，点开的挤掉最早的 ----
  useEffect(() => {
    const ids = blocks.filter(block => block.kind === 'widget' && block.state === 'current').map(block => block.id)
    setWidgets(previous => { const kept = previous.filter(id => ids.includes(id)); return kept.length ? kept : ids.slice(0, MAX_WIDGETS) })
  }, [view?.sheet.id, blocks.length])
  const activate = useCallback((id: string) => setWidgets(previous => [...previous.filter(item => item !== id), id].slice(-MAX_WIDGETS)), [])

  // ---- 量高：块内容（Markdown、小部件）渲染后高度才准；列宽变了高度跟着变 ----
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
  }, [blocks, widgets, layout.width])

  /** 看全貌：把整块白板缩进视口（只缩小不放大，最小 30%） */
  const fit = useCallback(() => {
    const box = viewport.current?.getBoundingClientRect()
    if (!box || !layout.height) { setCamera(HOME); return }
    const outerW = layout.span + 2 * BOARD.PAD, outerH = layout.height + 2 * BOARD.PAD
    const scale = Math.max(0.3, Math.min(1, (box.width - 2 * BOARD.INSET) / outerW, (box.height - BOARD.TOP - BOARD.INSET) / outerH))
    setCamera({ x: BOARD.INSET + BOARD.PAD * scale, y: BOARD.TOP + BOARD.PAD * scale, scale })
  }, [layout.span, layout.height])

  // ---- 跳到某块：移到视口中间并短暂高亮 ----
  useEffect(() => {
    if (!focus) return
    const target = positioned.find(block => block.id === focus.blockId), box = viewport.current?.getBoundingClientRect()
    if (!target || !box) return
    setCamera(camera => ({ ...camera, x: Math.min(HOME.x, box.width / 2 - (target.x + target.w / 2) * camera.scale), y: Math.min(HOME.y, box.height / 3 - target.y * camera.scale) }))
    setFocused(target.id)
    const timer = window.setTimeout(() => setFocused(null), 2400)
    return () => clearTimeout(timer)
  }, [focus?.nonce, view?.sheet.id])
  // ---- a card may point into a sheet the user deleted: ask the service once per click; it never jumps elsewhere ----
  useEffect(() => {
    if (!focus) return
    let active = true, timer: number | undefined
    setNotice(false)
    void board.locate(focus.blockId).then(kind => {
      if (!active || kind !== 'deleted') return
      setNotice(true)
      timer = window.setTimeout(() => setNotice(false), NOTICE_MS)
    })
    return () => { active = false; if (timer !== undefined) clearTimeout(timer) }
  }, [focus?.nonce])

  /** Empty sheets go at once; one with blocks comes back with the count and waits for the dialog. */
  async function remove(sheet: Sheet, number: number) {
    const result = await board.remove(sheet.id)
    if (result?.kind === 'confirm') setPending({ sheet, number, blocks: result.blocks })
  }
  async function confirmRemove() {
    if (!pending) return
    setRemoving(true)
    try { await board.remove(pending.sheet.id, true) } finally { setRemoving(false); setPending(null) }
  }

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

  return <section className="studio-board" aria-label={S.views.board}>
    <div className="board-viewport" ref={viewport} onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
      <div className="board-world" ref={world} style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` }}>
        {view && blocks.length > 0 && <div className="board-frame" style={{ width: layout.span + BOARD.PAD * 2, height: layout.height + BOARD.PAD * 2, left: -BOARD.PAD, top: -BOARD.PAD }}>
          <span className="board-frame-label">{view.sheet.used >= view.sheet.capacity ? S.board.frameFull : S.board.frameNote}</span>
        </div>}
        {positioned.map(block => <BlockCard key={block.id} block={block} materials={byId} supersededTitle={block.supersededBy ? titles.get(block.supersededBy) : undefined}
          widgetActive={widgets.includes(block.id)} onActivateWidget={activate} onOpenSource={onOpenSource} focused={focused === block.id} drawing={drawing === block.id} />)}
      </div>
      {view && !blocks.length && <p className="board-empty">{S.board.empty}</p>}
      {!view && !board.sheets.length && !board.error && <p className="board-empty">{S.board.noLive}</p>}
      {view && view.sheet.state !== 'live' && <p className="board-empty board-hint">{S.board.foldedHint}</p>}
      {drawing && <div className="board-drawing" role="status"><span className="board-drawing-dot" />{drawing === 'new' ? S.board.drawing : S.board.updating}</div>}
      {notice && <div className="board-drawing board-notice" role="status">{S.board.blockGone}</div>}
      {board.error && <p className="mw-error board-error" role="alert">{board.error}</p>}
    </div>
    <nav className="board-sheets" aria-label={S.board.tabs}>
      {tabs && <span className="board-tabs" ref={strip}>{board.sheets.map((sheet, index) => {
        const name = sheet.state !== 'live' ? `${sheet.title} · ${S.board.folded}` : sheet.title
        const writing = !!drawing && board.target === sheet.id, on = sheet.id === board.selected
        return <span key={sheet.id} className={on ? 'board-tab is-on' : 'board-tab'}>
          <button type="button" className={[on && 'on', sheet.state !== 'live' && 'is-folded'].filter(Boolean).join(' ') || undefined}
            aria-pressed={on} aria-label={writing ? `${name} · ${S.board.drawing}` : name} title={name} data-writing={writing || undefined} onClick={() => board.select(sheet.id)}>
            <BoardViewIcon /><span className="board-tab-number">{index + 1}</span>{writing && <span className="board-tab-dot" aria-hidden />}</button>
          <SheetMenu name={name} busy={board.target === sheet.id} className="board-tab-more" onRemove={() => void remove(sheet, index + 1)} />
        </span>
      })}</span>}
      {/* one live sheet hides the strip: its menu sits next to ＋ so the only sheet can still be deleted */}
      {!tabs && board.sheets.length === 1 && <SheetMenu name={board.sheets[0]!.title} busy={board.target === board.sheets[0]!.id} className="icon-btn board-sheet-more" onRemove={() => void remove(board.sheets[0]!, 1)} />}
      <button type="button" className="icon-btn board-sheet-new" title={S.board.newSheet} aria-label={S.board.newSheet} onClick={() => void board.createSheet()}><PlusIcon /></button>
    </nav>
    <div className="board-zoom">
      <button type="button" className="icon-btn" aria-label={S.board.zoomOut} onClick={() => zoomAt(1 / 1.15)}><MinusIcon /></button>
      <span className="board-zoom-value">{Math.round(camera.scale * 100)}%</span>
      <button type="button" className="icon-btn" aria-label={S.board.zoomIn} onClick={() => zoomAt(1.15)}><PlusIcon /></button>
      <button type="button" className="icon-btn" aria-label={S.board.fit} title={S.board.fit} onClick={fit}><ExpandIcon /></button>
    </div>
    {pending && <Dialog.Root open onOpenChange={open => { if (!open && !removing) setPending(null) }}>
      <Dialog className="ext-link-modal board-remove-modal p-0" aria-label={S.board.removeTitle(pending.number, pending.sheet.title)}>
        <h2 className="ext-link-title">{S.board.removeTitle(pending.number, pending.sheet.title)}</h2>
        <p className="ext-link-hint">{S.board.removeBody(pending.blocks)}</p>
        <div className="ext-link-actions">
          <Button variant="secondary" disabled={removing} onClick={() => setPending(null)}>{S.board.removeCancel}</Button>
          <Button variant="destructive" disabled={removing} onClick={() => void confirmRemove()}>{S.board.removeConfirm}</Button>
        </div>
      </Dialog>
    </Dialog.Root>}
  </section>
}

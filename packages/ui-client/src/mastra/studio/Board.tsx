/**
 * [INPUT]: useBoard's sheets and views, topic materials, the sprite's drawing/focus signals, layout.ts's width-based flow
 * [OUTPUT]: Board: the canvas — the top-left overlay (sheet tabs when several: board glyph + number, full title in title/aria-label, folded dimmed, a dot on the run's target while the AI draws, horizontal scroll instead of wrapping; each sheet carries a 「⋯」 menu (hover/focus, always on the selected one, next to ＋ for a lone sheet) to delete it, blocks ask first, the run's target is protected; ＋ opens and selects; no used-count on display — the cap and R11 stay server-side, and a full sheet's frame label says so honestly),
 *           the canvas starts below the overlay (BOARD.TOP ≥ overlay top 12 + height 30 + 12, so first-screen block titles never sit under it), DOM + CSS transform pan/zoom (100% by default, shrink to see it all),
 *           1–3 display columns by viewport width, a frame hugging the content, the easel under the no-sheet line (decoration; a click on it opens it and never pans), the AI-drawing notice, widget concurrency slots, the bottom-right zoom bar, and the sediment row under the canvas (S9)
 * [POS]: the center Board view; read-only for the user since P0 (no circling, pinning or editing). Whichever sheet you watch is where the next message writes (R16); a folded one says the AI will not write there. A card pointing into a deleted sheet only says so and never jumps elsewhere (R17). Columns and positions reflow in the display layer only; server coordinates stay
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import { Dialog } from '@cloudflare/kumo/components/dialog'
import { DropdownMenu } from '@cloudflare/kumo/components/dropdown'
import { BoardViewIcon, MinusIcon, MoreIcon, PlusIcon, ExpandIcon, SettledViewIcon } from '../../components/icons'
import { useT } from '../../i18n/index.ts'
import type { Sheet, SedimentInvite, TopicMaterial } from '../data/client.ts'
import { BlockCard } from './Block'
import { IsoObject } from './objects/IsoObject'
import { easelSvg } from './objects/easel.ts'
import { BOARD, flowLayout } from './layout'
import { OfferRow, TakeawayComposer } from './Takeaways'
import type { BoardState } from './useBoard'
import type { SedimentState } from './useSediment'

// The easel carries no data, so its markup is built once
const EASEL = easelSvg()

const MAX_WIDGETS = 2
const HOME = { x: BOARD.INSET + BOARD.PAD, y: BOARD.TOP + BOARD.PAD, scale: 1 }
const NOTICE_MS = 4000

/** A sheet's 「⋯」 menu with its one item (R17). The run's target cannot be deleted; the reason sits in the item's title. */
function SheetMenu({ name, busy, className, onRemove }: { name: string; busy: boolean; className: string; onRemove: () => void }) {
  const { studio: S, common: { labelled } } = useT()
  return <DropdownMenu>
    <DropdownMenu.Trigger render={<button type="button" className={className} aria-label={S.board.more(name)} title={S.board.more(name)} />}><MoreIcon size={16} /></DropdownMenu.Trigger>
    <DropdownMenu.Content align="start" sideOffset={6} className="glass-card">
      <DropdownMenu.Item disabled={busy} title={busy ? S.board.removeBusy : undefined} onClick={onRemove}>{S.board.remove}</DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu>
}

export function Board({ board, materials, drawing, focus, onOpenSource, sediment, invite }: {
  board: BoardState
  materials: TopicMaterial[]
  drawing: string | null
  focus: { blockId: string; nonce: number } | null
  onOpenSource: (itemId: string, page?: number) => void
  sediment: SedimentState
  /** the selected sheet's sediment invite (S4/S9c): its question and blocks ride above the full-board row */
  invite: SedimentInvite | null
}) {
  const { studio: S, common: { labelled } } = useT()
  const viewport = useRef<HTMLDivElement>(null), world = useRef<HTMLDivElement>(null), strip = useRef<HTMLSpanElement>(null)
  const [camera, setCamera] = useState(HOME)
  const [width, setWidth] = useState(0)
  const [heights, setHeights] = useState<Record<string, number>>({})
  const [widgets, setWidgets] = useState<string[]>([])
  const [focused, setFocused] = useState<string | null>(null)
  // ---- R17: a sheet with blocks waits here for the user's confirmation; a card whose sheet was deleted shows a short notice ----
  const [pending, setPending] = useState<{ sheet: Sheet; number: number; blocks: number; settled: number } | null>(null)
  const [removing, setRemoving] = useState(false), [notice, setNotice] = useState(false)
  // ---- S9b: a block-level "write a takeaway from this block" opens the row with that block pre-linked ----
  const [fromBlock, setFromBlock] = useState<string | null>(null)
  // ---- S9c: "Skip" hides the full-board row for this sheet until the sheet changes (updatedAt moves) ----
  const [skipped, setSkipped] = useState<{ sheetId: string; updatedAt: string } | null>(null)
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)
  const view = board.view, blocks = view?.blocks ?? []
  const byId = useMemo(() => new Map(materials.map(item => [item.id, item])), [materials])
  const titles = useMemo(() => new Map(blocks.map(block => [block.id, block.title])), [blocks])
  const layout = useMemo(() => flowLayout(blocks, heights, width), [blocks, heights, width])
  const positioned = blocks.map(block => ({ ...block, ...(layout.placed.get(block.id) ?? {}) }))
  const selectedSheet = board.sheets.find(sheet => sheet.id === board.selected)
  const tabs = board.sheets.length > 1 || (selectedSheet && selectedSheet.state !== 'live')

  // ---- The viewport width picks the column count; switching sheets returns to the top-left at 100%. A full reader hides the board (width 0) and keeps the layout ----
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

  // ---- Widget slots: the first two run by default; opening one evicts the oldest ----
  useEffect(() => {
    const ids = blocks.filter(block => block.kind === 'widget' && block.state === 'current').map(block => block.id)
    setWidgets(previous => { const kept = previous.filter(id => ids.includes(id)); return kept.length ? kept : ids.slice(0, MAX_WIDGETS) })
  }, [view?.sheet.id, blocks.length])
  const activate = useCallback((id: string) => setWidgets(previous => [...previous.filter(item => item !== id), id].slice(-MAX_WIDGETS)), [])

  // ---- Height measurement: block content (Markdown, widgets) renders before its height is true; a changed column width changes it again ----
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

  /** Fit to view: shrink the whole sheet into the viewport (shrink only, never grow, floor 30%). */
  const fit = useCallback(() => {
    const box = viewport.current?.getBoundingClientRect()
    if (!box || !layout.height) { setCamera(HOME); return }
    const outerW = layout.span + 2 * BOARD.PAD, outerH = layout.height + 2 * BOARD.PAD
    const scale = Math.max(0.3, Math.min(1, (box.width - 2 * BOARD.INSET) / outerW, (box.height - BOARD.TOP - BOARD.INSET) / outerH))
    setCamera({ x: BOARD.INSET + BOARD.PAD * scale, y: BOARD.TOP + BOARD.PAD * scale, scale })
  }, [layout.span, layout.height])

  // ---- Jump to a block: center it in the viewport and highlight it briefly ----
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
    if (result?.kind === 'confirm') setPending({ sheet, number, blocks: result.blocks, settled: result.settled })
  }
  async function confirmRemove() {
    if (!pending) return
    setRemoving(true)
    try { await board.remove(pending.sheet.id, true) } finally { setRemoving(false); setPending(null) }
  }

  // ---- S9c: the full-board row — the selected sheet is full, the user hasn't skipped this version of it ----
  const sheetFull = !!view && view.sheet.used >= view.sheet.capacity && !sediment.unsupported
  const skipCovers = skipped && view && skipped.sheetId === view.sheet.id && skipped.updatedAt === view.sheet.updatedAt
  const invited = useMemo(() => invite ? blocks.filter(block => invite.blockIds.includes(block.id) && block.state === 'current') : [], [invite, blocks])
  const showFullRow = sheetFull && !skipCovers && fromBlock === null
  const showBlockRow = fromBlock !== null
  // the pre-linked evidence carries the rev the UI saw: a run that changed the block since gets a 409 and the typed line stays (S10)
  const preLinked = useMemo(() => {
    const ids = showFullRow ? invited.map(block => block.id) : fromBlock ? [fromBlock] : []
    return ids.map(id => blocks.find(block => block.id === id)).filter((block): block is NonNullable<typeof block> => !!block).map(block => ({ id: block.id, rev: block.rev, title: block.title }))
  }, [showFullRow, showBlockRow, invited, fromBlock, blocks])
  useEffect(() => { if (sediment.revConflict) board.refresh() }, [sediment.revConflict])

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
    if ((event.target as Element).closest('[data-block], button, a, iframe, input, .iso-host')) return
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
          widgetActive={widgets.includes(block.id)} onActivateWidget={activate} onOpenSource={onOpenSource} focused={focused === block.id} drawing={drawing === block.id}
          onTakeaway={block.state === 'current' && !sediment.unsupported ? () => setFromBlock(block.id) : undefined} />)}
      </div>
      {view && !blocks.length && <p className="board-empty">{S.board.empty}</p>}
      {!view && !board.sheets.length && !board.error && <p className="board-empty">{S.board.noLive}</p>}
      {!view && !board.sheets.length && !board.error && <IsoObject markup={EASEL} className="board-easel" />}
      {view && view.sheet.state !== 'live' && <p className="board-empty board-hint">{S.board.foldedHint}</p>}
      {drawing && <div className="board-drawing" role="status"><span className="board-drawing-dot" />{drawing === 'new' ? S.board.drawing : S.board.updating}</div>}
      {notice && <div className="board-drawing board-notice" role="status">{S.board.blockGone}</div>}
    <div className="board-zoom">
      <button type="button" className="icon-btn" aria-label={S.board.zoomOut} onClick={() => zoomAt(1 / 1.15)}><MinusIcon /></button>
      <span className="board-zoom-value">{Math.round(camera.scale * 100)}%</span>
      <button type="button" className="icon-btn" aria-label={S.board.zoomIn} onClick={() => zoomAt(1.15)}><PlusIcon /></button>
      <button type="button" className="icon-btn" aria-label={S.board.fit} title={S.board.fit} onClick={fit}><ExpandIcon /></button>
    </div>
      {board.error && <p className="mw-error board-error" role="alert">{board.error}</p>}
    </div>
      {/* S9b/c: the from-block entry and the full-board one-line input (the invite question and invited blocks pre-linked, skippable); offers sit above the input (S9) */}
      {(showFullRow || showBlockRow) && <div className="board-sediment-row" data-testid="board-sediment-row">
        {sediment.offers.length > 0 && <p className="sediment-offers-note">{S.sediment.offerNote}</p>}
        {sediment.offers.slice(0, 1).map(offer => <OfferRow key={offer.id} offer={offer}
          onKeep={async text => await sediment.confirm(offer.id, text)} onDismiss={() => void sediment.dismiss(offer.id)} />)}
        {showFullRow && <div className="board-sediment-head">
          <span className="board-sediment-full">{S.board.frameFull}</span>
          {invite && <span className="board-sediment-invite">{labelled(S.sediment.inviteBy, invite.question)}</span>}
          {preLinked.length > 0 && <span className="board-sediment-links">{preLinked.map(block => block.title).join(' · ')}</span>}
        </div>}
        {showBlockRow && <div className="board-sediment-head"><span className="board-sediment-links">{preLinked.map(block => block.title).join(' · ')}</span></div>}
        <TakeawayComposer autoFocus placeholder={S.sediment.placeholder}
          onSubmit={async text => { const kept = await sediment.create({ text, blocks: preLinked.map(block => ({ id: block.id, rev: block.rev })) }); if (kept) setFromBlock(null); return kept }}
          onCancel={() => setFromBlock(null)} />
        {showFullRow && <button type="button" className="board-sediment-skip" onClick={() => view && setSkipped({ sheetId: view.sheet.id, updatedAt: view.sheet.updatedAt })}>{S.sediment.skip}</button>}
        {sediment.error && <p className="mw-error" role="alert">{sediment.revConflict ? S.sediment.linkStale : sediment.error}</p>}
      </div>}
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
    {pending && <Dialog.Root open onOpenChange={open => { if (!open && !removing) setPending(null) }}>
      <Dialog className="ext-link-modal board-remove-modal p-0" aria-label={S.board.removeTitle(pending.number, pending.sheet.title)}>
        <h2 className="ext-link-title">{S.board.removeTitle(pending.number, pending.sheet.title)}</h2>
        <p className="ext-link-hint">{S.board.removeBody(pending.blocks)}</p>
        {pending.settled > 0 && <p className="ext-link-hint">{S.board.removeSettled(pending.settled)}</p>}
        <div className="ext-link-actions">
          <Button variant="secondary" disabled={removing} onClick={() => setPending(null)}>{S.board.removeCancel}</Button>
          <Button variant="destructive" disabled={removing} onClick={() => void confirmRemove()}>{S.board.removeConfirm}</Button>
        </div>
      </Dialog>
    </Dialog.Root>}
  </section>
}

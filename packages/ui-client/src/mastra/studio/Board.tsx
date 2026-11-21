/**
 * [INPUT]: useBoard's sheets, scene and erase actions; the lazily loaded BoardCanvas; the sprite's drawing/focus signals; the selected sheet's sediment invite; Kumo Button/Dialog/DropdownMenu
 * [OUTPUT]: Board: the board view — the canvas of the selected sheet (one BoardCanvas per sheet), the easel alone in the middle when there is no sheet or a live sheet
 *           has no stroke yet (decoration: on a canvas strokes go through it, with no sheet it opens on a click like the other objects; it leaves at the first stroke or when the AI starts drawing there), the folded-sheet words,
 *           one line in the canvas's place when it fails to load or render (CanvasBoundary; the strip and the app stay), the AI-drawing notice, the 「AI 擦了 N 笔」 banner with restore and keep (R5), the gone-element notice for a card whose element left (R17), the sediment row
 *           for the AI's invite question (S9c, skippable), and the sheet strip under them (board glyph + number, full title in title/aria-label, folded dimmed,
 *           a dot on the run's target while the AI draws, horizontal scroll instead of wrapping; each tab's 「⋯」 deletes it, content asks first in a dialog,
 *           the run's target is protected; ＋ opens and selects)
 * [POS]: the center Board view; user and AI draw on the same canvas (R2). Whichever sheet you watch is where the next message writes (R16); a folded one
 *        says the AI will not write there. The strip sits below the canvas, not over it, so Excalidraw's own toolbar and menus never meet it at any width.
 *        Overlays here use solid surfaces: nothing on the canvas shows through. Excalidraw's asset path is set before its chunk loads; it is the fonts' only source, as the build strips the esm.sh fallback (vite.config.ts)
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { Component, Suspense, lazy, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import { Dialog } from '@cloudflare/kumo/components/dialog'
import { DropdownMenu } from '@cloudflare/kumo/components/dropdown'
import { BoardViewIcon, MoreIcon, PlusIcon } from '../../components/icons'
import { useT } from '../../i18n/index.ts'
import type { LumenApi, Sheet, SedimentInvite } from '../data/client.ts'
import { DeskObject } from './objects/DeskObject'
import { TakeawayComposer } from './Takeaways'
import type { BoardState } from './useBoard'
import type { SedimentState } from './useSediment'

const BoardCanvas = lazy(() => {
  Object.assign(window, { EXCALIDRAW_ASSET_PATH: new URL('excalidraw/', document.baseURI).href })
  return import('./BoardCanvas')
})

/** A canvas that fails to load or render (a missing chunk, an editor crash) leaves one line in its place; the strip, tabs and the rest of the app stay */
class CanvasBoundary extends Component<{ sheetId: string; fallback: (error: unknown) => ReactNode; children: ReactNode }, { error: unknown; sheetId: string }> {
  state = { error: null as unknown, sheetId: this.props.sheetId }
  static getDerivedStateFromError(error: unknown) { return { error } }
  static getDerivedStateFromProps(props: { sheetId: string }, state: { error: unknown; sheetId: string }) {
    // Another sheet gets a fresh try
    return props.sheetId === state.sheetId ? null : { error: null, sheetId: props.sheetId }
  }
  render() { return this.state.error ? this.props.fallback(this.state.error) : this.props.children }
}

// The easel carries no data, so its markup is built once
const NOTICE_MS = 4000

/** A sheet's 「⋯」 menu with its one item (R17). The run's target cannot be deleted; the reason sits in the item's title. */
function SheetMenu({ name, busy, className, onRemove }: { name: string; busy: boolean; className: string; onRemove: () => void }) {
  const { studio: S } = useT()
  return <DropdownMenu>
    <DropdownMenu.Trigger render={<button type="button" className={className} aria-label={S.board.more(name)} title={S.board.more(name)} />}><MoreIcon size={16} /></DropdownMenu.Trigger>
    <DropdownMenu.Content align="start" side="top" sideOffset={6} className="glass-card">
      <DropdownMenu.Item disabled={busy} title={busy ? S.board.removeBusy : undefined} onClick={onRemove}>{S.board.remove}</DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu>
}

export function Board({ api, board, drawing, focus, sediment, invite }: {
  api: LumenApi
  board: BoardState
  drawing: string | null
  /** A conversation card's element (its draw's first id) */
  focus: { elementId: string; nonce: number } | null
  sediment: SedimentState
  /** the selected sheet's sediment invite (S4/S9c): its question opens the row under the canvas */
  invite: SedimentInvite | null
}) {
  const { studio: S, common: { labelled } } = useT()
  const strip = useRef<HTMLSpanElement>(null)
  // ---- R17: a sheet with content waits here for the user's confirmation; a card whose element left shows a short notice ----
  const [pending, setPending] = useState<{ sheet: Sheet; number: number; count: number; settled: number } | null>(null)
  const [removing, setRemoving] = useState(false), [notice, setNotice] = useState(false)
  const [here, setHere] = useState<{ elementId: string; nonce: number } | null>(null)
  // ---- S9c: "Skip" hides the invite row until the AI asks again (a newer invite) ----
  const [skipped, setSkipped] = useState<string | null>(null)
  // ---- the canvas reports a blank sheet as the user draws; before it does, the scene says ----
  const [blank, setBlank] = useState<{ sheetId: string; blank: boolean } | null>(null)
  const scene = board.scene
  const erased = scene?.erasures ?? []

  // ---- the selected tab stays in sight when the strip scrolls (narrow board, many sheets): it is where the next message writes ----
  useLayoutEffect(() => {
    const row = strip.current, on = row?.querySelector<HTMLElement>('.board-tab.is-on')
    if (!row || !on) return
    if (on.offsetLeft < row.scrollLeft) row.scrollLeft = on.offsetLeft
    else if (on.offsetLeft + on.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollLeft = on.offsetLeft + on.offsetWidth - row.clientWidth
  }, [board.selected, board.sheets.length])

  // ---- A card: find the element's sheet, select it and let the canvas bring the element into view; a gone element only says so ----
  useEffect(() => {
    if (!focus) return
    let active = true, timer: number | undefined
    setNotice(false)
    void board.locate(focus.elementId).then(result => {
      if (!active) return
      if (result.kind === 'found') {
        if (result.sheetId !== board.selected) board.select(result.sheetId)
        setHere(focus)
        return
      }
      if (result.kind !== 'deleted') return
      setNotice(true)
      timer = window.setTimeout(() => setNotice(false), NOTICE_MS)
    })
    return () => { active = false; if (timer !== undefined) clearTimeout(timer) }
  }, [focus?.nonce])

  /** Empty sheets go at once; one with content comes back with the count and waits for the dialog. */
  async function remove(sheet: Sheet, number: number) {
    const result = await board.remove(sheet.id)
    if (result?.kind === 'confirm') setPending({ sheet, number, count: result.blocks, settled: result.settled })
  }
  async function confirmRemove() {
    if (!pending) return
    setRemoving(true)
    try { await board.remove(pending.sheet.id, true) } finally { setRemoving(false); setPending(null) }
  }

  const showInvite = !!invite && !!scene && invite.sheetId === scene.sheet.id && skipped !== invite.createdAt && !sediment.unsupported
  const noSheet = !scene && !board.sheets.length && !board.error
  const blankSheet = !!scene && scene.sheet.state === 'live' && !(drawing && board.target === scene.sheet.id) && !scene.ops.length
    && (blank?.sheetId === scene.sheet.id ? blank.blank : scene.elements.every(element => element.isDeleted))

  return <section className="studio-board" aria-label={S.views.board}>
    <div className="board-viewport">
      {scene && <CanvasBoundary sheetId={scene.sheet.id} fallback={error => <p className="mw-error board-error" role="alert">{S.board.canvasFailed(error instanceof Error ? error.message : String(error))}</p>}>
        <Suspense fallback={null}>
          <BoardCanvas key={scene.sheet.id} api={api} scene={scene} readOnly={scene.sheet.state !== 'live'} focus={here}
            onSettled={board.refresh} onError={board.report} onBlank={value => setBlank({ sheetId: scene.sheet.id, blank: value })} />
        </Suspense>
      </CanvasBoundary>}
      {(noSheet || blankSheet) && <DeskObject slot="board" className={blankSheet ? 'board-easel is-on-canvas' : 'board-easel'} />}
      {scene && scene.sheet.state !== 'live' && <p className="board-empty board-hint">{S.board.foldedHint}</p>}
      {drawing && <div className="board-drawing" role="status"><span className="board-drawing-dot" />{drawing === 'new' ? S.board.drawing : S.board.updating}</div>}
      {notice && <div className="board-drawing board-notice" role="status">{S.board.elementGone}</div>}
      {erased.length > 0 && <div className="board-erased" role="status">
        <span className="board-erased-text">{S.board.erased(erased.reduce((n, item) => n + item.elementIds.length, 0), erased.map(item => item.reason))}</span>
        <button type="button" className="board-erased-act" onClick={() => void board.restore()}>{S.board.restoreErased}</button>
        <button type="button" className="board-erased-act" onClick={() => void board.dismiss()}>{S.board.keepErased}</button>
      </div>}
      {board.error && <p className="mw-error board-error" role="alert">{board.error}</p>}
    </div>
    {/* S9c: the AI's invite question opens a one-line input; offers live in the Takeaways view */}
    {showInvite && <div className="board-sediment-row" data-testid="board-sediment-row">
      <div className="board-sediment-head"><span className="board-sediment-invite">{labelled(S.sediment.inviteBy, invite!.question)}</span></div>
      <TakeawayComposer autoFocus placeholder={S.sediment.placeholder}
        onSubmit={async text => { const kept = await sediment.create({ text }); if (kept) setSkipped(invite!.createdAt); return kept }}
        onCancel={() => setSkipped(invite!.createdAt)} />
      <button type="button" className="board-sediment-skip" onClick={() => setSkipped(invite!.createdAt)}>{S.sediment.skip}</button>
      {sediment.error && <p className="mw-error" role="alert">{sediment.error}</p>}
    </div>}
    <nav className="board-sheets" aria-label={S.board.tabs}>
      {board.sheets.length > 0 && <span className="board-tabs" ref={strip}>{board.sheets.map((sheet, index) => {
        const name = sheet.state !== 'live' ? `${sheet.title} · ${S.board.folded}` : sheet.title
        const writing = !!drawing && board.target === sheet.id, on = sheet.id === board.selected
        return <span key={sheet.id} className={on ? 'board-tab is-on' : 'board-tab'}>
          <button type="button" className={[on && 'on', sheet.state !== 'live' && 'is-folded'].filter(Boolean).join(' ') || undefined}
            aria-pressed={on} aria-label={writing ? `${name} · ${S.board.drawing}` : name} title={name} data-writing={writing || undefined} onClick={() => board.select(sheet.id)}>
            <BoardViewIcon /><span className="board-tab-number">{index + 1}</span>{writing && <span className="board-tab-dot" aria-hidden />}</button>
          <SheetMenu name={name} busy={board.target === sheet.id} className="board-tab-more" onRemove={() => void remove(sheet, index + 1)} />
        </span>
      })}</span>}
      <button type="button" className="icon-btn board-sheet-new" title={S.board.newSheet} aria-label={S.board.newSheet} onClick={() => void board.createSheet()}><PlusIcon /></button>
    </nav>
    {pending && <Dialog.Root open onOpenChange={open => { if (!open && !removing) setPending(null) }}>
      <Dialog className="ext-link-modal board-remove-modal p-0" aria-label={S.board.removeTitle(pending.number, pending.sheet.title)}>
        <h2 className="ext-link-title">{S.board.removeTitle(pending.number, pending.sheet.title)}</h2>
        <p className="ext-link-hint">{S.board.removeBody(pending.count)}</p>
        {pending.settled > 0 && <p className="ext-link-hint">{S.board.removeSettled(pending.settled)}</p>}
        <div className="ext-link-actions">
          <Button variant="secondary" disabled={removing} onClick={() => setPending(null)}>{S.board.removeCancel}</Button>
          <Button variant="destructive" disabled={removing} onClick={() => void confirmRemove()}>{S.board.removeConfirm}</Button>
        </div>
      </Dialog>
    </Dialog.Root>}
  </section>
}

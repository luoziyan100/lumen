/**
 * [INPUT]: useSediment's entries and offers, i18n, the trusted jump callback (evidence chip → the block on its board), the flower press and IsoObject
 * [OUTPUT]: Takeaways: the S8 view — entries newest first (dashed frame + Unverified, the quoted marker expands the original, evidence chips jump or report the deleted board),
 *           inline edit, delete asks once, a one-line empty state under the flower press; OfferRow renders an offer (deleted fragments struck in the original, click restores / re-deletes, Keep/Dismiss,
 *           the original expandable); TakeawayComposer is the one input (Enter keeps, Esc cancels)
 * [POS]: the center Takeaways view; the text passes only through the user's hand (R13), and the final wording before an offer's confirm is assembled here for the service's re-check (S9)
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useRef, useState } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import type { SedimentEntry, SedimentOffer } from '../data/client.ts'
import { useT } from '../../i18n/index.ts'
import { SettledViewIcon } from '../../components/icons'
import type { SedimentState } from './useSediment'
import { IsoObject } from './objects/IsoObject'
import { pressSvg } from './objects/press.ts'

const PRESS = pressSvg()

/** Strike state of an offer: fragment index → still deleted? */
export function offerStruck(offer: SedimentOffer): boolean[] {
  return offer.fragments.map(() => true)
}

/** The user's final text: the original minus the still-struck fragments, whitespace runs collapsed to one space (the service re-checks under the same rule). */
export function finalText(offer: SedimentOffer, struck: boolean[]): string {
  let text = ''
  let at = 0
  offer.fragments.forEach((fragment, index) => {
    if (!struck[index]) return
    text += offer.original.slice(at, fragment.start)
    at = fragment.end
  })
  text += offer.original.slice(at)
  return text.replace(/\s+/g, ' ').trim()
}

/** One offer: the user's own words with the deletions struck; click restores, click again re-deletes; Keep/Dismiss; the original expands. */
export function OfferRow({ offer, onKeep, onDismiss }: { offer: SedimentOffer; onKeep: (text: string) => void; onDismiss: () => void }) {
  const S = useT().studio.sediment
  const [struck, setStruck] = useState<boolean[]>(() => offerStruck(offer))
  const [expanded, setExpanded] = useState(false)
  // the fragments are spans into the original: render the original with the struck spans as toggle buttons
  const parts: React.ReactNode[] = []
  let at = 0
  offer.fragments.forEach((fragment, index) => {
    if (fragment.start > at) parts.push(<span key={`t${index}`}>{offer.original.slice(at, fragment.start)}</span>)
    parts.push(<button type="button" key={`f${index}`} className={`sediment-strike${struck[index] ? '' : ' is-restored'}`}
      aria-label={S.restore} title={S.restore} onClick={() => setStruck(previous => previous.map((value, row) => row === index ? !value : value))}>
      {fragment.text}
    </button>)
    at = fragment.end
  })
  if (at < offer.original.length) parts.push(<span key="tail">{offer.original.slice(at)}</span>)
  return <div className="sediment-offer" data-testid="sediment-offer">
    <blockquote className="sediment-quote">{parts}</blockquote>
    <div className="sediment-offer-actions">
      <Button variant="secondary" size="sm" onClick={() => onKeep(finalText(offer, struck))}>{S.offerKeep}</Button>
      <Button variant="ghost" size="sm" onClick={onDismiss}>{S.offerDismiss}</Button>
      <button type="button" className="sediment-original-toggle" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{S.original}</button>
    </div>
    {expanded && <blockquote className="sediment-quote sediment-quote-original">{offer.original}</blockquote>}
  </div>
}

/** The one input of S9: a single line + Enter keeps, Esc cancels; AI text is never pre-filled. A failure (a rev conflict included) never clears it — your typed words are yours. */
export function TakeawayComposer({ placeholder, autoFocus, onSubmit, onCancel }: {
  placeholder: string
  autoFocus?: boolean
  onSubmit: (text: string) => Promise<boolean> | boolean
  onCancel: () => void
}) {
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (autoFocus) input.current?.focus() }, [autoFocus])
  return <form className="sediment-compose" onSubmit={event => {
    event.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return
    void Promise.resolve(onSubmit(trimmed)).then(kept => { if (kept !== false) setText('') })
  }}>
    <input ref={input} className="sediment-input" value={text} placeholder={placeholder} aria-label={placeholder}
      onChange={event => setText(event.target.value)}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); onCancel() } }} />
  </form>
}

/** One entry: dashed frame + Unverified; the quoted marker expands the original; evidence chips jump or report the deletion; inline edit, delete asks once. */
function EntryCard({ entry, index, onJump, onEdit, onRemove }: {
  entry: SedimentEntry
  index: number
  onJump: (blockId: string, sheetId: string) => void
  onEdit: (entryId: string, text: string) => Promise<boolean>
  onRemove: (entryId: string) => Promise<boolean>
}) {
  const S = useT().studio.sediment, cancel = useT().common.cancel
  const [editing, setEditing] = useState(false), [expanded, setExpanded] = useState(false), [asking, setAsking] = useState(false), [busy, setBusy] = useState(false)
  return <article className={`sediment-entry${index === 0 ? ' is-newest' : ''}`} data-testid="sediment-entry">
    <header className="sediment-entry-head">
      <span className="sediment-state">{S.unverified}</span>
      {entry.origin === 'quoted'
        ? <button type="button" className="sediment-origin" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{S.quoted}</button>
        : <span className="sediment-origin sediment-origin-typed">{S.typed}</span>}
    </header>
    {editing
      ? <TakeawayComposer autoFocus placeholder={entry.text} onSubmit={async text => await onEdit(entry.id, text)} onCancel={() => setEditing(false)} />
      : <p className="sediment-text">{entry.text}</p>}
    {expanded && entry.quote && <blockquote className="sediment-quote sediment-quote-original">{entry.quote.original}</blockquote>}
    {entry.links.length > 0 && <div className="sediment-evidence">
      {entry.links.map(link => link.deleted
        ? <span key={link.blockId} className="sediment-chip is-gone" title={S.evidenceGone}>{SettledViewIcon && <SettledViewIcon />}{link.title} · {S.evidenceGone}</span>
        : <button type="button" key={link.blockId} className="sediment-chip" title={S.jump(link.title)} onClick={() => onJump(link.blockId, link.sheetId)}>
            <SettledViewIcon />{link.title}
          </button>)}
    </div>}
    <footer className="sediment-entry-foot">
      <button type="button" className="sediment-act" onClick={() => setEditing(true)}>{S.edit}</button>
      {asking
        ? <span className="sediment-ask">
            <span>{S.deleteAsk}</span>
            <button type="button" className="sediment-act" disabled={busy} onClick={async () => { setBusy(true); await onRemove(entry.id); setBusy(false); setAsking(false) }}>{S.delete}</button>
            <button type="button" className="sediment-act" onClick={() => setAsking(false)}>{cancel}</button>
          </span>
        : <button type="button" className="sediment-act sediment-act-danger" onClick={() => setAsking(true)}>{S.delete}</button>}
    </footer>
  </article>
}

/** The S8 view itself: entries newest first, the empty state, pending offers above, and the "Keep a takeaway" action. */
export function Takeaways({ sediment, onJump }: {
  sediment: SedimentState
  onJump: (blockId: string, sheetId: string) => void
}) {
  const S = useT().studio.sediment, viewLabel = useT().studio.views.settled
  const [composing, setComposing] = useState(false)
  if (sediment.unsupported) return <div className="sediment-view" role="status"><p className="sediment-empty">{S.unsupported}</p></div>
  return <section className="sediment-view" aria-label={viewLabel}>
    <div className="sediment-list" data-testid="sediment-list">
      {sediment.offers.length > 0 && <p className="sediment-offers-note">{S.offerNote}</p>}
      {sediment.offers.map(offer => <OfferRow key={offer.id} offer={offer}
        onKeep={async text => await sediment.confirm(offer.id, text)}
        onDismiss={() => void sediment.dismiss(offer.id)} />)}
      {/* The press stands over the empty line and leaves with it: an entry, an offer or the open composer removes both */}
      {sediment.items.length === 0 && sediment.offers.length === 0 && !composing && <>
        <IsoObject markup={PRESS} className="sediment-press" />
        <p className="sediment-empty">{S.empty}</p>
      </>}
      {composing
        ? <TakeawayComposer autoFocus placeholder={S.placeholder} onSubmit={async text => { const kept = await sediment.create({ text }); if (kept) setComposing(false); return kept }} onCancel={() => setComposing(false)} />
        : <Button variant="secondary" size="sm" className="sediment-keep" onClick={() => setComposing(true)}>{S.keep}</Button>}
      {sediment.items.map((entry, index) => <EntryCard key={entry.id} entry={entry} index={index} onJump={onJump} onEdit={sediment.edit} onRemove={sediment.remove} />)}
    </div>
    {sediment.error && <p className="mw-error sediment-error" role="alert">{sediment.revConflict ? S.linkStale : sediment.error}</p>}
  </section>
}

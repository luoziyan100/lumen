/**
 * [INPUT]: components/Markdown for replies, useReading's state, the topic's questions (useTopicAsks), the pure helpers of reading-ask.ts, i18n `studio.reading`, the host's send/keep/open-source callbacks
 * [OUTPUT]: ReadingView: the centre 「解读 / Reading」 view — one centred serif column (≤700px) with numbered sections, each paragraph ending in its source chip
 *           (「原文 p.N」 opens split reading at that page; inference chips are dashed); the person's footprints (thin underlines on sentences asked about, inline spans with role="button" that wrap like text and open on click/Enter/Space);
 *           selecting text inside one paragraph opens AskWindow under the selection
 *           and kept clear of the sprite's figure (padding on the side it sits);
 *           AskWindow: the quote (two lines), the exchange so far (the person's words and the streamed reply, rendered by components/Markdown as Block.tsx does), a one-line growing input, send, and 「存为我的沉淀」 (only typed words)
 * [POS]: the reading half of P1-2's first loop. It sends nothing itself: the host posts visible user messages through the conversation's own path, and replies come from the
 *        shared conversation subscription; nothing here is a second channel
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import { CloseIcon, SendIcon } from '../../components/icons'
import { Markdown } from '../../components/Markdown'
import { useT } from '../../i18n/index.ts'
import type { Identity, ReadingParagraph, ReadingSection } from '../data/client.ts'
import { footprintRanges, readingAsks, sectionLabel, squash, type Ask } from './reading-ask.ts'
import type { ReadingState } from './useReading.ts'
import type { SpriteBox } from './Sprite'
import './reading.css'

/** What the window is about: one quote in one paragraph, anchored to the selection's box inside the column. */
export interface AskTarget {
  quote: string
  section: string
  paragraphId: string
  /** The selection box relative to the column */
  box: { top: number; bottom: number; left: number }
  /** The conversation of an earlier exchange on this quote (follow-ups continue it); null for a fresh question */
  identity: Identity | null
}

const WINDOW_WIDTH = 360, GAP = 8
/** Air between the sprite's figure and the nearest line; the text never narrows below MIN_TEXT for it */
const SPRITE_AIR = 12, MIN_TEXT = 360

/** Padding that keeps the reading's lines out from under the sprite's figure: on the side the figure sits, as wide as it reaches into the view */
function spritePadding(view: DOMRect, figure: SpriteBox | null): { start: number; end: number } {
  if (!figure || figure.bottom <= view.top || figure.top >= view.bottom || figure.right <= view.left || figure.left >= view.right) return { start: 0, end: 0 }
  const room = Math.max(0, view.width - MIN_TEXT)
  return (figure.left + figure.right) / 2 >= (view.left + view.right) / 2
    ? { start: 0, end: Math.min(room, Math.ceil(view.right - figure.left + SPRITE_AIR)) }
    : { start: Math.min(room, Math.ceil(figure.right - view.left + SPRITE_AIR)), end: 0 }
}

function elementOf(node: Node | null): Element | null {
  return node instanceof Element ? node : node?.parentElement ?? null
}

function SourceChip({ paragraph, onOpen }: { paragraph: ReadingParagraph; onOpen: (page?: number) => void }) {
  const S = useT().studio.reading
  if (paragraph.source.kind === 'inference') return <span className="source-chip source-chip-inferred reading-chip">{S.inference}</span>
  const { page, quote } = paragraph.source
  return <button type="button" className="source-chip reading-chip" title={`${S.openSource} · “${quote}”`} onClick={() => onOpen(page)}>{page ? S.page(page) : S.paper}</button>
}

/** A paragraph's text with the person's footprints as thin underlines. A footprint is an inline span acting as a button, so a quote that starts mid-line wraps
 *  like the text around it (a real <button> is an atomic inline box and would push the whole quote to its own line). */
function ParagraphText({ paragraph, quotes, onFootprint }: { paragraph: ReadingParagraph; quotes: string[]; onFootprint: (quote: string, element: HTMLElement) => void }) {
  const S = useT().studio.reading
  const parts: ReactNode[] = []
  let at = 0
  for (const range of footprintRanges(paragraph.text, quotes)) {
    if (range.start > at) parts.push(paragraph.text.slice(at, range.start))
    parts.push(<span role="button" tabIndex={0} key={range.start} className="reading-footprint" title={S.footprint} aria-label={S.footprint}
      onClick={event => onFootprint(range.quote, event.currentTarget)}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onFootprint(range.quote, event.currentTarget) } }}>{paragraph.text.slice(range.start, range.end)}</span>)
    at = range.end
  }
  if (at < paragraph.text.length) parts.push(paragraph.text.slice(at))
  return <span className="reading-text" data-paragraph={paragraph.id}>{parts}</span>
}

export function AskWindow({ target, asks, busy, onSend, onKeep, onClose, column }: {
  target: AskTarget
  /** Earlier exchanges on this quote, oldest first */
  asks: Ask[]
  /** The conversation the next message goes to is running or waiting: the composer's rule, no send until it ends */
  busy: boolean
  onSend: (words: string) => Promise<string | null>
  onKeep: (words: string) => Promise<string | null>
  onClose: () => void
  column: HTMLElement | null
}) {
  const S = useT().studio.reading
  const [words, setWords] = useState(''), [error, setError] = useState(''), [note, setNote] = useState(''), [sending, setSending] = useState(false)
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null)
  const frame = useRef<HTMLElement>(null), input = useRef<HTMLTextAreaElement>(null)
  // Focus once placed: the window stays visibility:hidden until then, and a hidden field cannot take focus
  const placed = !!place
  useEffect(() => { if (placed) input.current?.focus({ preventScroll: true }) }, [target.quote, placed])
  // Esc closes the window wherever the focus is (a mouse selection can leave it outside); another field keeps its own Esc
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const field = event.target instanceof Element ? event.target.closest('input, textarea, select, [contenteditable="true"]') : null
      if (event.key !== 'Escape' || event.defaultPrevented || (field && !frame.current?.contains(field))) return
      event.preventDefault(); onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // ---- Under the selection when it fits in the visible part of the scroller, else above it; never over the sentence ----
  useLayoutEffect(() => {
    const element = frame.current, scroller = column?.closest('.reading-scroll') as HTMLElement | null
    if (!element || !column) return
    const height = element.offsetHeight, width = Math.min(WINDOW_WIDTH, column.clientWidth)
    const left = Math.max(0, Math.min(target.box.left, column.clientWidth - width))
    const visibleBottom = scroller ? scroller.scrollTop + scroller.clientHeight - column.offsetTop : Infinity
    const below = target.box.bottom + GAP, above = target.box.top - GAP - height
    const top = below + height <= visibleBottom || above < 0 ? below : above
    setPlace(previous => previous?.top === top && previous.left === left ? previous : { top, left })
  }, [target, column, asks.length, words, error, note])
  useEffect(() => { if (place) frame.current?.scrollIntoView?.({ block: 'nearest' }) }, [place?.top])

  const grow = () => { const area = input.current; if (area) { area.style.height = 'auto'; area.style.height = `${Math.min(area.scrollHeight, 120)}px` } }
  async function send() {
    const text = words.trim()
    if (!text || busy || sending) return
    setSending(true); setError(''); setNote('')
    const failure = await onSend(text)
    setSending(false)
    if (failure) { setError(failure); return }
    setWords(''); requestAnimationFrame(grow)
  }
  async function keep() {
    // Only what the person typed: the input, else their own words of the last exchange — never the quote, never the reply (R13)
    const text = words.trim() || asks.at(-1)?.words.trim() || ''
    setError(''); setNote('')
    if (!text) { setNote(S.ask.keepEmpty); return }
    const failure = await onKeep(text)
    if (failure) setError(S.ask.keepFailed + failure)
    else { setNote(S.ask.kept); if (words.trim()) setWords('') }
  }
  return <section ref={frame} className="reading-ask" role="dialog" aria-label={S.ask.label} data-placed={!!place}
    style={{ top: place?.top ?? target.box.bottom + GAP, left: place?.left ?? 0, width: `min(${WINDOW_WIDTH}px, 100%)` }}
>
    <header className="reading-ask-head">
      <blockquote className="reading-ask-quote" title={target.quote}>{target.quote}</blockquote>
      <button type="button" className="icon-btn" aria-label={S.ask.close} title={S.ask.close} onClick={onClose}><CloseIcon /></button>
    </header>
    {asks.length > 0 && <div className="reading-ask-log">{asks.map(ask => <div key={ask.messageId} className="reading-ask-turn">
      <p className="reading-ask-you"><b>{S.ask.you}</b>{ask.words}</p>
      {ask.reply ? <div className="reading-ask-reply"><Markdown>{ask.reply}</Markdown></div> : <p className="reading-ask-reply is-waiting" role="status">{S.ask.thinking}</p>}
    </div>)}</div>}
    <div className="reading-ask-input">
      <textarea ref={input} rows={1} value={words} aria-label={S.ask.placeholder} placeholder={S.ask.placeholder}
        onChange={event => { setWords(event.target.value); grow() }}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send() } }} />
      <button type="button" className="reading-ask-send" aria-label={S.ask.send} title={busy ? S.busy : S.ask.send} disabled={!words.trim() || busy || sending} onClick={() => void send()}><SendIcon /></button>
    </div>
    <div className="reading-ask-foot">
      <Button variant="ghost" size="sm" onClick={() => void keep()}>{S.ask.keep}</Button>
      {(error || note) && <span className={error ? 'reading-ask-error' : 'reading-ask-note'} role={error ? 'alert' : 'status'}>{error || note}</span>}
    </div>
  </section>
}

export function ReadingView({ state, requested, asks, busyFor, onSend, onKeep, onOpenSource, sprite }: {
  state: ReadingState
  /** A write was asked for the shown material and no section has landed yet */
  requested: boolean
  asks: Ask[]
  /** Whether the conversation a message would go to is running or waiting (null = the open one, or a new one) */
  busyFor: (identity: Identity | null) => boolean
  onSend: (target: AskTarget, words: string) => Promise<string | null>
  onKeep: (words: string) => Promise<string | null>
  onOpenSource: (itemId: string, page?: number) => void
  /** The sprite's figure in the viewport (null when docked or absent) */
  sprite: SpriteBox | null
}) {
  const { studio: { reading: S } } = useT()
  const column = useRef<HTMLDivElement>(null)
  // ---- Keep text out from under the sprite: re-measure when the figure moves or the view resizes (panes, window) ----
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)
  const [pad, setPad] = useState({ start: 0, end: 0 })
  useLayoutEffect(() => {
    if (!scroller) return
    const measure = () => {
      const next = spritePadding(scroller.getBoundingClientRect(), sprite)
      setPad(previous => previous.start === next.start && previous.end === next.end ? previous : next)
    }
    measure()
    const resize = new ResizeObserver(measure)
    resize.observe(scroller)
    return () => resize.disconnect()
  }, [scroller, sprite?.left, sprite?.top, sprite?.right, sprite?.bottom])
  const [target, setTarget] = useState<AskTarget | null>(null)
  const close = useCallback(() => setTarget(null), [])
  const reading = state.reading
  useEffect(() => setTarget(null), [state.itemId])
  const mine = reading ? readingAsks(reading, asks) : []

  function boxOf(rect: DOMRect) {
    const host = column.current!.getBoundingClientRect()
    return { top: rect.top - host.top, bottom: rect.bottom - host.top, left: rect.left - host.left }
  }
  function sectionOf(paragraphId: string): ReadingSection | undefined {
    return reading?.sections.find(section => section.paragraphs.some(paragraph => paragraph.id === paragraphId))
  }
  // ---- Only a selection that starts and ends inside one paragraph's text opens the window ----
  function onSelect() {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.rangeCount || !column.current) return
    const range = selection.getRangeAt(0)
    const start = elementOf(range.startContainer)?.closest('[data-paragraph]'), end = elementOf(range.endContainer)?.closest('[data-paragraph]')
    if (!start || start !== end || !column.current.contains(start)) return
    const quote = squash(selection.toString())
    const section = sectionOf(start.getAttribute('data-paragraph')!)
    if (quote.length < 2 || !section) return
    setTarget({ quote, section: sectionLabel(section), paragraphId: start.getAttribute('data-paragraph')!, box: boxOf(range.getBoundingClientRect()), identity: null })
  }
  function onFootprint(quote: string, element: HTMLElement) {
    const paragraphId = element.closest('[data-paragraph]')!.getAttribute('data-paragraph')!
    const section = sectionOf(paragraphId)
    const last = mine.filter(ask => ask.quote === quote).at(-1)
    if (!section) return
    setTarget({ quote, section: sectionLabel(section), paragraphId, box: boxOf(element.getBoundingClientRect()), identity: last?.identity ?? null })
  }

  if (!reading) return <div className="studio-later reading-empty" role="status"><p>{requested ? S.waiting : S.empty}</p>{state.error && <p className="mw-error" role="alert">{state.error}</p>}</div>
  const exchange = target ? mine.filter(ask => ask.quote === target.quote) : []
  const conversation = target ? exchange.at(-1)?.identity ?? target.identity : null
  return <div ref={setScroller} className="reading-scroll" style={{ paddingInlineStart: pad.start, paddingInlineEnd: pad.end }}>
    <div ref={column} className="reading-column" onMouseUp={onSelect} onKeyUp={event => { if (event.shiftKey) onSelect() }}>
      <header className="reading-head">
        <p className="reading-kicker">{S.byline(reading.itemTitle)}</p>
        <h1 className="reading-title">{reading.itemTitle}</h1>
        <p className="reading-note">{S.note}</p>
      </header>
      {state.error && <p className="mw-error" role="alert">{state.error}</p>}
      {reading.sections.map(section => <section key={section.id} className="reading-section" data-section={section.id}>
        <h2><span className="reading-num">{section.ord}</span>{section.title}</h2>
        {section.paragraphs.map(paragraph => <p key={paragraph.id} className={`reading-para${paragraph.source.kind === 'inference' ? ' is-inference' : ''}`}>
          <ParagraphText paragraph={paragraph} quotes={mine.filter(ask => squash(paragraph.text).includes(ask.quote)).map(ask => ask.quote)} onFootprint={onFootprint} />
          {' '}<SourceChip paragraph={paragraph} onOpen={page => onOpenSource(reading.itemId, page)} />
        </p>)}
      </section>)}
      {requested && <p className="reading-more" role="status">{S.more}</p>}
      {target && <AskWindow target={target} asks={exchange} busy={busyFor(conversation)} column={column.current}
        onSend={words => onSend({ ...target, identity: conversation }, words)} onKeep={onKeep} onClose={close} />}
    </div>
  </div>
}

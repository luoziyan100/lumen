/**
 * [INPUT]: components/Markdown for replies, components/MermaidBlock for inline diagrams, ReadingWidget for an active interactive widget (WidgetFrame, its controls and failure line), widget-params' value rules and question lines, MODEL_TEXT.widgetFix, objects/ (IsoObject, typewriterSvg/paperLines), useReading's state, the topic's questions (useTopicAsks), the pure helpers of reading-ask.ts, i18n `studio.reading`, the host's send/widget-send/keep/open-source callbacks
 * [OUTPUT]: ReadingView: the centre 「解读 / Reading」 view — a centred 960px column whose prose, headings, quotes, tables and diagrams stay within 700px while interactive HTML widgets (`WidgetFrame`, up to 3 active by default, bidirectional via onSendMessage) use the full 960px column width and can expand in place via `position: fixed` (same mounted WidgetFrame/iframe so interactive state survives expand/collapse, same-height placeholder, solid light stage, closes AskWindow first so one Esc handles it, including Esc pressed while focus is inside the expanded iframe via `onEscape`); a paper block is followed by its quote in the paper's own words, ending in the source chip
 *           (「原文 p.N」 opens split reading at that page), an inference block ends in a dashed chip; the quote line opens no window; the person's footprints (thin underlines on sentences asked about, inline spans with role="button" that wrap like text and open on click/Enter/Space);
 *           selecting text inside one prose paragraph opens AskWindow under the selection. An answer shows in one place only: with the conversation open (chatShown) the window is
 *           the quote and the input, closes once the question is sent and a footprint asks the host to reveal its question there (onReveal); with it closed the exchange runs in the
 *           window, and opening the conversation closes a window that shows answers. Esc, × and a press outside close it
 *           and kept clear of the sprite's figure (padding on the side it sits);
 *           with no reading, ReadingStart: the typewriter alone, centred (title on the paper, typing while a requested reading has no section; no text, no button: writing starts from the Materials row);
 *           widgets: the view keeps each widget's param values (fitted to its declaration, saved per place), runtime failures (「请 AI 修正」 sends widgetFix) and questions; a widget question opens AskWindow
 *           under the widget, anchored to its live box, its exchange is every question on that widget and its quote is rebuilt from the current values when sent;
 *           AskWindow: the quote (two lines), the exchange so far (the person's words and the streamed reply, rendered by components/Markdown as Block.tsx does), a one-line growing input, send, and, once a question was asked, 「把我的话记成沉淀」 (only the person's words)
 * [POS]: the living reading stage. It sends nothing itself: the host posts visible user messages through the conversation's own path (for both AskWindow questions and widget __widgetSendMessage actions), and replies come from the
 *        shared conversation subscription; nothing here is a second channel
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import { CloseIcon, SendIcon } from '../../components/icons'
import { Markdown } from '../../components/Markdown'
import { MermaidBlock } from '../../components/MermaidBlock'
import { useT } from '../../i18n/index.ts'
import { MODEL_TEXT } from '../../i18n/locales/model.ts'
import type { Identity, ReadingParagraph, ReadingSection, ReadingTextBlock, ReadingWidgetBlock, TopicMaterial, WidgetParam } from '../data/client.ts'
import { IsoObject } from './objects/IsoObject'
import { paperLines, typewriterSvg } from './objects/typewriter.ts'
import { footprintRanges, prose, readingAsks, sectionLabel, squash, type Ask, type Prose } from './reading-ask.ts'
import type { ReadingState } from './useReading.ts'
import { ReadingWidget } from './ReadingWidget'
import { fitValues, loadValues, paramsStoreKey, saveValues, widgetQuote, widgetTitleOf, type ParamValue, type ParamValues } from './widget-params.ts'
import type { SpriteBox } from './Sprite'
import './reading.css'

const WIDGET_SLOTS = 3

/** What the window is about: one quote in one paragraph, anchored to the selection's box inside the column. */
export interface AskTarget {
  quote: string
  section: string
  paragraphId: string
  /** The selection box relative to the column */
  box: { top: number; bottom: number; left: number }
  /** The conversation of an earlier exchange on this quote (follow-ups continue it); null for a fresh question */
  identity: Identity | null
  /** Set when the question is about a widget: its exchange is every question on that widget, and the quote is rebuilt from its values when sent */
  widget?: { title: string; key: string; params?: WidgetParam[]; stage: HTMLElement }
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
  const { page } = paragraph.source
  return <button type="button" className="source-chip reading-chip" title={S.openSource} onClick={() => onOpen(page)}>{page ? S.page(page) : S.paper}</button>
}

function marked({ text, marks }: Prose, from: number, to: number): ReactNode[] {
  const parts: ReactNode[] = []
  let at = from
  for (const mark of marks) {
    const start = Math.max(mark.start, from), end = Math.min(mark.end, to)
    if (start >= end) continue
    if (start > at) parts.push(text.slice(at, start))
    parts.push(mark.kind === 'code' ? <code key={start}>{text.slice(start, end)}</code> : <strong key={start}>{text.slice(start, end)}</strong>)
    at = end
  }
  if (at < to) parts.push(text.slice(at, to))
  return parts
}

/** A paragraph's text with the person's footprints as thin underlines. A footprint is an inline span acting as a button, so a quote that starts mid-line wraps
 *  like the text around it (a real <button> is an atomic inline box and would push the whole quote to its own line). */
function ParagraphText({ id, shown, quotes, onFootprint }: { id: string; shown: Prose; quotes: string[]; onFootprint: (quote: string, element: HTMLElement) => void }) {
  const S = useT().studio.reading
  const parts: ReactNode[] = []
  let at = 0
  for (const range of footprintRanges(shown.text, quotes)) {
    if (range.start > at) parts.push(...marked(shown, at, range.start))
    parts.push(<span role="button" tabIndex={0} key={`f${range.start}`} className="reading-footprint" title={S.footprint} aria-label={S.footprint}
      onClick={event => onFootprint(range.quote, event.currentTarget)}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onFootprint(range.quote, event.currentTarget) } }}>{marked(shown, range.start, range.end)}</span>)
    at = range.end
  }
  if (at < shown.text.length) parts.push(...marked(shown, at, shown.text.length))
  return <span className="reading-text" data-paragraph={id}>{parts}</span>
}

export function AskWindow({ target, asks, log = true, busy, onSend, onKeep, onClose, column }: {
  target: AskTarget
  log?: boolean
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
    const onDown = (event: PointerEvent) => { if (!frame.current?.contains(event.target as Node)) onClose() }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown, true)
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown, true) }
  }, [onClose])

  // ---- Under the selection when it fits in the visible part of the scroller, else above it; never over the sentence. A widget's window always opens under the widget and scrolls into view ----
  useLayoutEffect(() => {
    const element = frame.current, scroller = column?.closest('.reading-scroll') as HTMLElement | null
    if (!element || !column) return
    const height = element.offsetHeight, width = Math.min(WINDOW_WIDTH, column.clientWidth)
    const live = target.widget?.stage.getBoundingClientRect(), host = column.getBoundingClientRect()
    const box = live ? { top: live.top - host.top, bottom: live.bottom - host.top, left: live.left - host.left } : target.box
    const left = Math.max(0, Math.min(box.left, column.clientWidth - width))
    const visibleBottom = scroller ? scroller.scrollTop + scroller.clientHeight - column.offsetTop : Infinity
    const below = box.bottom + GAP, above = box.top - GAP - height
    const top = target.widget || below + height <= visibleBottom || above < 0 ? below : above
    setPlace(previous => previous?.top === top && previous.left === left ? previous : { top, left })
  })
  useEffect(() => { if (place) frame.current?.scrollIntoView?.({ block: 'nearest' }) }, [place?.top])

  // ---- A widget can still change height (late iframe resize, controls): the window follows its live box ----
  const [, setResized] = useState(0)
  useEffect(() => {
    const stage = target.widget?.stage
    if (!stage || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setResized(count => count + 1))
    observer.observe(stage)
    return () => observer.disconnect()
  }, [target.widget?.stage])

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
    const text = words.trim() || asks.at(-1)!.words.trim()
    setError(''); setNote('')
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
    {log && asks.length > 0 && <div className="reading-ask-log">{asks.map(ask => <div key={ask.messageId} className="reading-ask-turn">
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
      {asks.length > 0 && <Button variant="ghost" size="sm" onClick={() => void keep()}>{S.ask.keep}</Button>}
      {(error || note) && <span className={error ? 'reading-ask-error' : 'reading-ask-note'} role={error ? 'alert' : 'status'}>{error || note}</span>}
    </div>
  </section>
}

/** The empty Reading view is the typewriter alone (an empty state is one object, no text, no button): the material's title on its paper, typing while a
 *  requested reading has no section yet. Writing starts from the Materials row; a failure to load the reading still shows as an error */
function ReadingStart({ item, requested, error }: { item: TopicMaterial | null; requested: boolean; error: string }) {
  const markup = useMemo(() => typewriterSvg({ lines: paperLines(item?.title ?? '') }), [item?.title])
  return <div className="studio-later reading-empty reading-start">
    <IsoObject markup={markup} className="reading-typewriter" typing={requested} />
    {error && <p className="mw-error" role="alert">{error}</p>}
  </div>
}

function VisualBlock({ block, stage, onActivate, onOpenSource }: {
  block: Exclude<ReadingParagraph, ReadingTextBlock>
  /** The active widget (ReadingWidget); null while the widget waits for 「打开」 */
  stage: ReactNode
  onActivate: (id: string) => void
  onOpenSource: (page?: number) => void
}) {
  const S = useT().studio.reading
  const chip = <SourceChip paragraph={block} onOpen={onOpenSource} />
  const body = block.kind === 'table'
    ? <div className="reading-table-wrap"><table className="reading-table">
      <thead><tr>{block.columns.map((column, index) => <th key={index}>{column}</th>)}</tr></thead>
      <tbody>{block.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}>{cell}</td>)}</tr>)}</tbody>
    </table></div>
    : block.kind === 'diagram'
      ? <div className="reading-diagram"><MermaidBlock chart={block.mermaid} /></div>
      : stage
        ?? <div className="reading-widget-idle"><span>{block.title || S.widgetIdle}</span><Button variant="secondary" size="sm" onClick={() => onActivate(block.id)}>{S.widgetRun}</Button></div>
  return <figure className={`reading-block reading-block-${block.kind}`} data-block-id={block.id}>
    {block.kind !== 'widget' && block.title && <h3 className="reading-block-title">{block.title}</h3>}
    {body}
    {block.caption && <figcaption className="reading-block-caption">{block.caption}</figcaption>}
    {block.source.kind === 'paper'
      ? <blockquote className="reading-quote reading-block-quote">{block.source.quote}{' '}{chip}</blockquote>
      : <div className="reading-block-foot">{chip}</div>}
  </figure>
}

export function ReadingView({ state, requested, startItem, asks, busyFor, onSend, onWidgetSend, onKeep, onOpenSource, sprite, chatShown = false, onReveal }: {
  state: ReadingState
  /** A write was asked for the shown material and no section has landed yet */
  requested: boolean
  /** The material whose title the empty view's typewriter shows on its paper */
  startItem: TopicMaterial | null
  asks: Ask[]
  /** Whether the conversation a message would go to is running or waiting (null = the open one, or a new one) */
  busyFor: (identity: Identity | null) => boolean
  onSend: (target: AskTarget, words: string) => Promise<string | null>
  /** A widget called window.__widgetSendMessage(text): route it through the topic's normal conversation path */
  onWidgetSend?: (text: string) => Promise<string | null>
  onKeep: (words: string) => Promise<string | null>
  onOpenSource: (itemId: string, page?: number) => void
  /** The sprite's figure in the viewport (null when docked or absent) */
  sprite: SpriteBox | null
  chatShown?: boolean
  onReveal?: (ask: Ask) => void
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
  const [extraWidgets, setExtraWidgets] = useState<string[]>([])
  const [expanded, setExpanded] = useState<{ id: string; height: number } | null>(null)
  const savedScroll = useRef<number | null>(null)
  const [widgetError, setWidgetError] = useState('')
  const [paramValues, setParamValues] = useState<Record<string, ParamValues>>({})
  const [failures, setFailures] = useState<Record<string, string>>({})
  const close = useCallback(() => setTarget(null), [])
  const answering = useRef(false)
  useEffect(() => { if (chatShown && answering.current) setTarget(null) }, [chatShown])
  const reading = state.reading
  useEffect(() => { setTarget(null); setExtraWidgets([]); setExpanded(null); savedScroll.current = null; setWidgetError(''); setFailures({}) }, [state.itemId])
  const restoreScroll = useCallback(() => {
    const top = savedScroll.current
    savedScroll.current = null
    if (top === null || !scroller) return
    requestAnimationFrame(() => { scroller.scrollTop = top })
  }, [scroller])
  const collapseWidget = useCallback(() => {
    setExpanded(null)
    restoreScroll()
  }, [restoreScroll])
  const toggleExpand = useCallback((id: string, slot: HTMLElement | null) => {
    if (expanded?.id === id) {
      collapseWidget()
      return
    }
    // Close AskWindow before opening the expanded stage so only one Esc handler is ever live
    setTarget(null)
    if (scroller) savedScroll.current = scroller.scrollTop
    setExpanded({ id, height: Math.ceil(slot?.getBoundingClientRect().height ?? 0) })
  }, [expanded?.id, scroller, collapseWidget])
  useEffect(() => {
    if (!expanded) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      collapseWidget()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded, collapseWidget])
  const mine = reading ? readingAsks(reading, asks) : []
  const activeWidgets = useMemo(() => {
    if (!reading) return new Set<string>()
    const auto = reading.sections.flatMap(section => section.paragraphs)
      .filter(paragraph => paragraph.kind === 'widget').slice(0, WIDGET_SLOTS).map(paragraph => paragraph.id)
    return new Set([...auto, ...extraWidgets])
  }, [reading, extraWidgets])
  const activateWidget = useCallback((id: string) => setExtraWidgets(previous => previous.includes(id) ? previous : [...previous, id]), [])
  const sendWidget = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed || !onWidgetSend) return
    setWidgetError('')
    void onWidgetSend(trimmed).then(failure => { if (failure) setWidgetError(failure) })
  }, [onWidgetSend])

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
  // ---- Widget values live here (and in localStorage), fitted to the current declaration on every read, so a rewrite or an expand never resets them ----
  function valuesFor(key: string, params: WidgetParam[] | undefined): ParamValues | undefined {
    if (!params?.length) return undefined
    return paramValues[key] ? fitValues(params, paramValues[key]) : loadValues(key, params)
  }
  function setValue(key: string, params: WidgetParam[], name: string, value: ParamValue) {
    const next = fitValues(params, { ...valuesFor(key, params), [name]: value })
    setParamValues(previous => ({ ...previous, [key]: next }))
    saveValues(key, next)
  }
  const widgetAsks = (title: string, section: string) => mine.filter(ask => ask.section === section && widgetTitleOf(ask.quote) === title)
  function openWidgetAsk(block: ReadingWidgetBlock, section: ReadingSection, key: string, stage: HTMLElement, footprint: boolean) {
    const title = block.title || S.widgetIdle, label = sectionLabel(section)
    const last = widgetAsks(title, label).at(-1)
    setTarget({ quote: widgetQuote(title, block.params, valuesFor(key, block.params) ?? {}), section: label, paragraphId: block.id, box: boxOf(stage.getBoundingClientRect()),
      identity: last?.identity ?? null, widget: { title, key, params: block.params, stage } })
    if (footprint && chatShown && last) onReveal?.(last)
  }
  function fixWidget(block: ReadingWidgetBlock, section: ReadingSection) {
    if (!onWidgetSend || !reading) return
    setWidgetError('')
    void onWidgetSend(MODEL_TEXT.widgetFix(reading.itemTitle, sectionLabel(section), block.title || S.widgetIdle, failures[block.id] ?? '')).then(failure => {
      if (failure) setWidgetError(failure)
      else setFailures(({ [block.id]: _, ...rest }) => rest)
    })
  }
  function onFootprint(quote: string, element: HTMLElement) {
    const paragraphId = element.closest('[data-paragraph]')!.getAttribute('data-paragraph')!
    const section = sectionOf(paragraphId)
    const last = mine.filter(ask => ask.quote === quote).at(-1)
    if (!section) return
    setTarget({ quote, section: sectionLabel(section), paragraphId, box: boxOf(element.getBoundingClientRect()), identity: last?.identity ?? null })
    if (chatShown && last) onReveal?.(last)
  }

  if (!reading) return <ReadingStart item={startItem} requested={requested} error={state.error} />
  const exchange = !target ? [] : target.widget ? widgetAsks(target.widget.title, target.section) : mine.filter(ask => ask.quote === target.quote)
  const conversation = target ? exchange.at(-1)?.identity ?? target.identity : null
  answering.current = !chatShown && exchange.length > 0
  return <div ref={setScroller} className="reading-scroll" style={{ paddingInlineStart: pad.start, paddingInlineEnd: pad.end }}>
    <div ref={column} className="reading-column" onMouseUp={onSelect} onKeyUp={event => { if (event.shiftKey) onSelect() }}>
      <header className="reading-head">
        <h1 className="reading-title">{reading.itemTitle}</h1>
      </header>
      {(state.error || widgetError) && <p className="mw-error" role="alert">{state.error || widgetError}</p>}
      {reading.sections.map(section => { let ordinal = 0; return <section key={section.id} className="reading-section" data-section={section.id}>
        <h2><span className="reading-num">{section.ord}</span>{section.title}</h2>
        {section.paragraphs.map(paragraph => {
          if (!('text' in paragraph)) {
            let stage: ReactNode = null
            if (paragraph.kind === 'widget' && activeWidgets.has(paragraph.id)) {
              const block = paragraph, key = paramsStoreKey(reading.topicId, reading.itemId, section.id, ++ordinal), isExpanded = expanded?.id === block.id
              stage = <ReadingWidget block={block} expanded={isExpanded} slotHeight={isExpanded ? expanded.height : 0} values={valuesFor(key, block.params)}
                failure={failures[block.id] ?? null} asked={widgetAsks(block.title || S.widgetIdle, sectionLabel(section)).length > 0}
                onToggleExpand={toggleExpand} onCollapse={collapseWidget} onWidgetSend={sendWidget}
                onValue={(name, value) => setValue(key, block.params!, name, value)}
                onAsk={element => openWidgetAsk(block, section, key, element, false)} onFootprint={element => openWidgetAsk(block, section, key, element, true)}
                onRuntimeError={message => setFailures(previous => ({ ...previous, [block.id]: message }))} onFix={() => fixWidget(block, section)} />
            } else if (paragraph.kind === 'widget') ordinal++
            return <VisualBlock key={paragraph.id} block={paragraph} stage={stage} onActivate={activateWidget} onOpenSource={page => onOpenSource(reading.itemId, page)} />
          }
          const chip = <SourceChip paragraph={paragraph} onOpen={page => onOpenSource(reading.itemId, page)} />
          const shown = prose(paragraph.text), flat = squash(shown.text)
          const text = <ParagraphText id={paragraph.id} shown={shown} quotes={mine.filter(ask => flat.includes(ask.quote)).map(ask => ask.quote)} onFootprint={onFootprint} />
          if (paragraph.source.kind === 'inference') return <p key={paragraph.id} className="reading-para is-inference">{text}{' '}{chip}</p>
          // The quote stands under its paragraph, in the paper's own words, so a sentence that leads into it ("…the key line:") points at something the reader can see
          return <Fragment key={paragraph.id}>
            <p className="reading-para">{text}</p>
            <blockquote className="reading-quote">{paragraph.source.quote}{' '}{chip}</blockquote>
          </Fragment>
        })}
      </section> })}
      {requested && <p className="reading-more" role="status">{S.more}</p>}
      {target && <AskWindow target={target} asks={exchange} log={!chatShown} busy={busyFor(conversation)} column={column.current}
        onSend={async words => {
          const quote = target.widget ? widgetQuote(target.widget.title, target.widget.params, valuesFor(target.widget.key, target.widget.params) ?? {}) : target.quote
          const failure = await onSend({ ...target, quote, identity: conversation }, words)
          if (!failure && chatShown) close()
          return failure
        }} onKeep={onKeep} onClose={close} />}
    </div>
  </div>
}

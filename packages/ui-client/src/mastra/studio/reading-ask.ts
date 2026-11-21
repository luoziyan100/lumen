/**
 * [INPUT]: native messages (feed's messageRole/messageText), MODEL_TEXT's question format and its READING_PLACE line, widget-params' widgetTitleOf, the service error catalog
 * [OUTPUT]: prose (a prose block's shown text and its bold, code and formula marks; a formula keeps its `$…$` source in the shown text, so quotes carry the TeX), wholeMath (a range widened so it never cuts a formula), askText / askWidgetText / parseAsk (a reading question and back; a widget question's quote keeps its two lines), asksOf (each question with the assistant reply that followed it), readingAsks (the questions of one reading: about its sentences or its widgets), footprintRanges (where a quote stands exactly in a paragraph),
 *           sentences / likeness / placeFootprints (every sentence question's place: exact, edited on the closest sentence of its block or section, or at a block's edge; never dropped), readingSignal (completed reading_write / reading_insert / reading_patch calls, the refresh signal), latestReadingWrite (the current turn's latest completed reading write's callId/itemId for auto-focus), answered (a request has an assistant message after it), sendErrorText (a native send refusal in the UI language)
 * [POS]: pure helpers behind the Reading view. Footprints are not stored anywhere: they are rebuilt from the conversation's own messages, so a reload or another device
 *        shows the same underlines and nothing new is persisted
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import type { MastraDBMessage } from '@mastra/client-js'
import { serviceErrorText, t } from '../../i18n/index.ts'
import { MODEL_TEXT, READING_PLACE } from '../../i18n/locales/model.ts'
import { messageRole, messageText } from '../data/feed.ts'
import type { Identity, Reading, ReadingSection } from '../data/client.ts'
import { widgetTitleOf } from './widget-params.ts'

/** Whitespace runs collapse to one space; quotes match on this form. */
export const squash = (text: string) => text.replace(/\s+/g, ' ').trim()

export interface ProseMark { start: number; end: number; kind: 'strong' | 'code' | 'math'; tex?: string; display?: boolean }
export interface Prose { text: string; marks: ProseMark[] }
const MARKS = /`([^`\n]+)`|\*\*(?!\s)([^*\n]+?)(?<!\s)\*\*|(?<!\\)\$\$([^$]+?)\$\$|(?<![\\$])\$(?![\s$])([^$\n]+?)(?<![\s\\])\$(?![\d$])/g
export function prose(source: string): Prose {
  const marks: ProseMark[] = []
  let text = '', at = 0
  for (const match of source.matchAll(MARKS)) {
    text += source.slice(at, match.index)
    const tex = match[3] ?? match[4]
    if (tex !== undefined) {
      marks.push({ start: text.length, end: text.length + match[0].length, kind: 'math', tex: tex.trim(), display: match[3] !== undefined })
      text += match[0]
    } else {
      const inner = match[1] ?? match[2]!
      marks.push({ start: text.length, end: text.length + inner.length, kind: match[1] !== undefined ? 'code' : 'strong' })
      text += inner
    }
    at = match.index + match[0].length
  }
  return { text: text + source.slice(at), marks }
}

/** A range widened so it never cuts a formula: a formula is drawn whole or not at all. */
export function wholeMath(marks: ProseMark[], start: number, end: number): { start: number; end: number } {
  for (const mark of marks) {
    if (mark.kind !== 'math') continue
    if (start > mark.start && start < mark.end) start = mark.start
    if (end > mark.start && end < mark.end) end = mark.end
  }
  return { start, end }
}

/** Where the question sits: the section's number and title, as the reading shows them. */
export const sectionLabel = (section: Pick<ReadingSection, 'ord' | 'title'>) => `${section.ord}. ${section.title}`

export function askText(quote: string, section: string, item: string, words: string, blockId?: string) {
  return MODEL_TEXT.askReading(squash(quote), section, item, words.trim(), blockId)
}

/** A question asked from a widget: its quote is the two program lines of widgetQuote, each kept on its own line */
export function askWidgetText(quote: string, section: string, item: string, words: string) {
  return MODEL_TEXT.askReading(quote.split('\n').map(squash).filter(Boolean).join('\n'), section, item, words.trim())
}

/** A user message written by askText, read back; anything else is null. */
export function parseAsk(text: string): { quote: string; item: string; section: string; blockId?: string; words: string } | null {
  const lines = text.split('\n')
  let at = 0
  const quote: string[] = []
  while (at < lines.length && lines[at]!.startsWith('> ')) quote.push(lines[at++]!.slice(2))
  const place = quote.length ? READING_PLACE.exec(lines[at] ?? '') : null
  if (!place) return null
  return { quote: squash(quote.join(' ')).replaceAll('**', ''), item: place[1]!, section: place[2]!, ...(place[3] ? { blockId: place[3] } : {}), words: lines.slice(at + 1).join('\n').trim() }
}

export interface Ask {
  messageId: string
  identity: Identity
  quote: string
  item: string
  section: string
  /** The asked paragraph's block id; questions written before 2026-11-21 have none */
  blockId?: string
  words: string
  /** Assistant text after the question, up to the next user message; grows while it streams */
  reply: string
  createdAt: number
}

/** Every question in one conversation with the reply that followed it. */
export function asksOf(messages: MastraDBMessage[], identity: Identity): Ask[] {
  const asks: Ask[] = []
  let open: Ask | null = null
  for (const message of messages) {
    const role = messageRole(message)
    if (role === 'user') {
      const parsed = parseAsk(messageText(message))
      open = parsed ? { messageId: message.id, identity, ...parsed, reply: '', createdAt: +new Date(message.createdAt) } : null
      if (open) asks.push(open)
    } else if (role === 'assistant' && open) {
      const text = messageText(message).trim()
      if (text) open.reply += `${open.reply ? '\n\n' : ''}${text}`
    }
  }
  return asks
}

/** Whether two ask lists show the same thing (the shell re-renders only when a question or its reply changed) */
export function sameAsks(a: Ask[], b: Ask[]): boolean {
  return a.length === b.length && a.every((ask, i) => ask.messageId === b[i]!.messageId && ask.reply === b[i]!.reply && ask.identity.taskId === b[i]!.identity.taskId)
}

/** Character ranges of a paragraph that the person asked about (their footprints), in order and without overlap. */
export function footprintRanges(text: string, quotes: string[]): { start: number; end: number; quote: string }[] {
  const ranges: { start: number; end: number; quote: string }[] = []
  for (const quote of new Set(quotes)) {
    if (!quote) continue
    let start = text.indexOf(quote), end = start + quote.length
    if (start < 0) {
      // The paragraph may hold a line break where the quote holds a space: search the squashed text and map back
      const index: number[] = []
      let flat = '', space = false
      for (let i = 0; i < text.length; i++) {
        if (/\s/.test(text[i]!)) { if (!space && flat) { flat += ' '; index.push(i) } space = true; continue }
        space = false; flat += text[i]; index.push(i)
      }
      const found = flat.indexOf(quote)
      if (found < 0) continue
      start = index[found]!; end = index[found + quote.length - 1]! + 1
    }
    if (ranges.some(range => start < range.end && end > range.start)) continue
    ranges.push({ start, end, quote })
  }
  return ranges.sort((a, b) => a.start - b.start)
}

export interface Footprint { start: number; end: number; quote: string; edited: boolean }
/** Where one paragraph shows the person's footprints: ranges in its shown text, and the quotes that only fit at its edge */
export interface ParagraphFootprints { ranges: Footprint[]; margin: string[] }

/** The full-width 。！？； (escaped: no CJK literal outside the catalogs) */
const FULL_STOPS = /[\u3002\uff01\uff1f\uff1b]/

/** Sentence ranges of a shown text, trimmed: a sentence ends after 。！？； at once, after . ! ? ; only before whitespace or the end, so 3.5 and e.g. stay whole. */
export function sentences(text: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = []
  const push = (start: number, end: number) => {
    while (start < end && /\s/.test(text[start]!)) start++
    while (end > start && /\s/.test(text[end - 1]!)) end--
    if (end > start) ranges.push({ start, end })
  }
  let from = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (FULL_STOPS.test(c) || ('.!?;'.includes(c) && (i + 1 === text.length || /\s/.test(text[i + 1]!)))) { push(from, i + 1); from = i + 1 }
  }
  push(from, text.length)
  return ranges
}

function grams(text: string): Map<string, number> {
  const flat = squash(text).toLowerCase(), counts = new Map<string, number>()
  const size = flat.length > 1 ? 2 : 1
  for (let i = 0; i + size <= flat.length; i++) counts.set(flat.slice(i, i + size), (counts.get(flat.slice(i, i + size)) ?? 0) + 1)
  return counts
}

/** Dice similarity of character bigrams: language-neutral, so CJK and Latin sentences compare the same way. */
export function likeness(a: string, b: string): number {
  const x = grams(a), y = grams(b)
  let shared = 0, total = 0
  for (const [gram, n] of x) { shared += Math.min(n, y.get(gram) ?? 0); total += n }
  for (const n of y.values()) total += n
  return total ? 2 * shared / total : 0
}

/** Where each question about a sentence shows, so a footprint never disappears (owner decision 2026-11-21). The sentence is still there: a footprint on it.
 *  An exact quote marks its own block when the question names one that still exists, else every paragraph that holds it (as before block ids).
 *  It changed: a footprint marked edited on the closest sentence, in its own block when the question carries a block id that still exists, else in the section it was asked in
 *  (else anywhere in the reading). Nothing shares a character pair with it, or the place is taken: a mark at that block's edge. "Closest" only picks the place, so there is no threshold. */
export function placeFootprints(reading: Reading, asks: Ask[]): Map<string, ParagraphFootprints> {
  const paragraphs = reading.sections.flatMap(section => section.paragraphs.flatMap(paragraph => 'text' in paragraph ? [{ id: paragraph.id, section: sectionLabel(section), text: prose(paragraph.text).text }] : []))
  const placed = new Map<string, ParagraphFootprints>(paragraphs.map(paragraph => [paragraph.id, { ranges: [], margin: [] }]))
  const free = (id: string, start: number, end: number) => !placed.get(id)!.ranges.some(range => start < range.end && end > range.start)
  const seen = new Set<string>(), changed: { ask: Ask; own?: typeof paragraphs[number] }[] = []
  const edge = (id: string, quote: string) => { const entry = placed.get(id)!; if (!entry.margin.includes(quote)) entry.margin.push(quote) }
  for (const ask of asks) {
    const key = `${ask.quote}\n${ask.blockId ?? ask.section}`
    if (ask.item !== reading.itemTitle || !ask.quote || seen.has(key) || widgetTitleOf(ask.quote) !== null) continue
    seen.add(key)
    const own = ask.blockId ? paragraphs.find(paragraph => paragraph.id === ask.blockId) : undefined
    const hits = (own ? [own] : paragraphs).flatMap(paragraph => footprintRanges(paragraph.text, [ask.quote]).map(range => ({ id: paragraph.id, range })))
    if (!hits.length) { changed.push({ ask, own }); continue }
    for (const { id, range } of hits) {
      if (placed.get(id)!.ranges.some(other => other.quote === ask.quote && other.start === range.start)) continue
      if (free(id, range.start, range.end)) placed.get(id)!.ranges.push({ ...range, edited: false })
      else edge(id, ask.quote)
    }
  }
  for (const { ask, own } of changed) {
    const inSection = paragraphs.filter(paragraph => paragraph.section === ask.section)
    const pool = own ? [own] : inSection.length ? inSection : paragraphs
    let best: { id: string; start: number; end: number; score: number } | null = null
    for (const paragraph of pool) for (const sentence of sentences(paragraph.text)) {
      const score = likeness(ask.quote, paragraph.text.slice(sentence.start, sentence.end))
      if (score > (best?.score ?? 0)) best = { id: paragraph.id, ...sentence, score }
    }
    if (best && free(best.id, best.start, best.end)) placed.get(best.id)!.ranges.push({ start: best.start, end: best.end, quote: ask.quote, edited: true })
    else if (best ?? pool[0]) edge((best ?? pool[0]!).id, ask.quote)
  }
  for (const entry of placed.values()) entry.ranges.sort((a, b) => a.start - b.start)
  return placed
}

/** Questions that belong to this reading: asked about its material's sentences (they always show somewhere, see placeFootprints), or asked from one of its widgets
 *  (same section label and widget title; an untitled widget goes by the `widgetIdle` name, as its question did). */
export function readingAsks(reading: Reading, asks: Ask[]): Ask[] {
  const prosed = reading.sections.some(section => section.paragraphs.some(paragraph => 'text' in paragraph))
  const idle = t().studio.reading.widgetIdle
  const widgets = new Set(reading.sections.flatMap(section => section.paragraphs.flatMap(paragraph => paragraph.kind === 'widget' ? [`${sectionLabel(section)}\n${paragraph.title || idle}`] : [])))
  return asks.filter(ask => {
    if (ask.item !== reading.itemTitle) return false
    const widget = widgetTitleOf(ask.quote)
    return widget !== null ? widgets.has(`${ask.section}\n${widget}`) : prosed
  })
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
}

const READING_WRITES = new Set(['reading_write', 'reading_insert', 'reading_patch'])

/** The ids of completed reading_write, reading_insert and reading_patch calls: a new id means a section or block landed or changed, so the view refetches (no second event protocol). */
export function readingSignal(messages: MastraDBMessage[]): string {
  const done: string[] = []
  for (const message of messages) for (const part of message.content.parts) {
    if (part.type !== 'tool-invocation' || !READING_WRITES.has(part.toolInvocation.toolName) || !('result' in part.toolInvocation)) continue
    if (!record(part.toolInvocation.result).error) done.push(part.toolInvocation.toolCallId)
  }
  return done.join(',')
}

/** The latest completed reading_write / reading_insert / reading_patch call and its material id, so the centre stage can auto-focus what the AI just wrote. */
export function latestReadingWrite(messages: MastraDBMessage[]): { callId: string; itemId: string } | null {
  // Only the current turn: a write in older history is not news, however late that history loads
  let turn = messages.length
  while (turn > 0 && messageRole(messages[turn - 1]!) !== 'user') turn--
  let latest: { callId: string; itemId: string } | null = null
  for (const message of messages.slice(turn)) for (const part of message.content.parts) {
    if (part.type !== 'tool-invocation' || !READING_WRITES.has(part.toolInvocation.toolName) || !('result' in part.toolInvocation)) continue
    if (record(part.toolInvocation.result).error) continue
    const itemId = record(part.toolInvocation.args).itemId
    if (typeof itemId === 'string' && itemId) latest = { callId: part.toolInvocation.toolCallId, itemId }
  }
  return latest
}

/** The conversation holds this user message and an assistant message after it: with no run live, that run is over even if it was never seen running */
export function answered(messages: MastraDBMessage[], request: string): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!
    if (messageRole(message) === 'user' && messageText(message) === request) return messages.slice(i + 1).some(next => messageRole(next) === 'assistant')
  }
  return false
}

/** A native send refused by the service (R1's 409 among others) carries Lumen's JSON body: show it in the UI language, as the composer's other errors are. */
export function sendErrorText(error: unknown): string {
  const body = record(error).body
  if (body && typeof body === 'object') return serviceErrorText(body, t().data.requestFailed(Number(record(error).status) || 0))
  return error instanceof Error ? error.message : String(error)
}

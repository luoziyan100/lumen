/**
 * [INPUT]: native messages (feed's messageRole/messageText), MODEL_TEXT's question format and its READING_PLACE line, the service error catalog
 * [OUTPUT]: askText / parseAsk (a reading question and back), asksOf (each question with the assistant reply that followed it), footprintRanges (where a paragraph shows
 *           the person's footprints), readingSignal (completed reading_write calls, the refresh signal), sendErrorText (a native send refusal in the UI language)
 * [POS]: pure helpers behind the Reading view. Footprints are not stored anywhere: they are rebuilt from the conversation's own messages, so a reload or another device
 *        shows the same underlines and nothing new is persisted
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import type { MastraDBMessage } from '@mastra/client-js'
import { serviceErrorText, t } from '../../i18n/index.ts'
import { MODEL_TEXT, READING_PLACE } from '../../i18n/locales/model.ts'
import { messageRole, messageText } from '../data/feed.ts'
import type { Identity, Reading, ReadingSection } from '../data/client.ts'

/** Whitespace runs collapse to one space; quotes match on this form. */
export const squash = (text: string) => text.replace(/\s+/g, ' ').trim()

/** Where the question sits: the section's number and title, as the reading shows them. */
export const sectionLabel = (section: Pick<ReadingSection, 'ord' | 'title'>) => `${section.ord}. ${section.title}`

export function askText(quote: string, section: string, item: string, words: string) {
  return MODEL_TEXT.askReading(squash(quote), section, item, words.trim())
}

/** A user message written by askText, read back; anything else is null. */
export function parseAsk(text: string): { quote: string; item: string; section: string; words: string } | null {
  const lines = text.split('\n')
  let at = 0
  const quote: string[] = []
  while (at < lines.length && lines[at]!.startsWith('> ')) quote.push(lines[at++]!.slice(2))
  const place = quote.length ? READING_PLACE.exec(lines[at] ?? '') : null
  if (!place) return null
  return { quote: squash(quote.join(' ')), item: place[1]!, section: place[2]!, words: lines.slice(at + 1).join('\n').trim() }
}

export interface Ask {
  messageId: string
  identity: Identity
  quote: string
  item: string
  section: string
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

/** Questions that belong to this reading: asked about its material, with a quote found in one of its paragraphs. */
export function readingAsks(reading: Reading, asks: Ask[]): Ask[] {
  const texts = reading.sections.flatMap(section => section.paragraphs.map(paragraph => squash(paragraph.text)))
  return asks.filter(ask => ask.item === reading.itemTitle && texts.some(text => text.includes(ask.quote)))
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
}

/** The ids of completed reading_write calls: a new id means a section landed, so the view refetches (no second event protocol). */
export function readingSignal(messages: MastraDBMessage[]): string {
  const done: string[] = []
  for (const message of messages) for (const part of message.content.parts) {
    if (part.type !== 'tool-invocation' || part.toolInvocation.toolName !== 'reading_write' || !('result' in part.toolInvocation)) continue
    if (!record(part.toolInvocation.result).error) done.push(part.toolInvocation.toolCallId)
  }
  return done.join(',')
}

/** A native send refused by the service (R1's 409 among others) carries Lumen's JSON body: show it in the UI language, as the composer's other errors are. */
export function sendErrorText(error: unknown): string {
  const body = record(error).body
  if (body && typeof body === 'object') return serviceErrorText(body, t().data.requestFailed(Number(record(error).status) || 0))
  return error instanceof Error ? error.message : String(error)
}

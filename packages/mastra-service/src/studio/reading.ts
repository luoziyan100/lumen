/**
 * [INPUT]: studio/db's connection and transaction, the R15 refusal, the library item row mapper
 * [OUTPUT]: ReadingStore (write = append or replace one section in one transaction; view; list, newest first), READING_LIMITS, readingInput (the zod shape the tool shares),
 *           normalizeQuote / quoteFound (the whitespace rule for quote checks)
 * [POS]: the only writer of readings. The AI reaches it through reading_write after the tool has checked every quote against the material's text;
 *        the user only reads it over HTTP. A reading belongs to one (topic, library item) pair; P1 keeps no versions
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { randomBytes, randomUUID } from 'node:crypto'
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite'
import { z } from 'zod'
import { transaction } from './db.ts'
import { notReferenced, StudioError } from './errors.ts'
import type { Reading, ReadingParagraph, ReadingSection, ReadingSummary } from './types.ts'

export const READING_LIMITS = { sections: 12, paragraphs: 8, paragraphChars: 600, title: 120, quoteMin: 8, quoteMax: 400 } as const

// The structural shape only; the caps are checked by hand below so a refusal names the section or paragraph the model has to fix
const source = z.union([
  z.object({ kind: z.literal('paper'), page: z.number().int().min(1).optional(), quote: z.string().max(READING_LIMITS.quoteMax) }).strict(),
  z.object({ kind: z.literal('inference') }).strict(),
])
export const readingInput = z.object({
  sectionId: z.string().max(64).optional(),
  title: z.string().trim().min(1).max(READING_LIMITS.title),
  paragraphs: z.array(z.object({ text: z.string(), source }).strict()).min(1),
})
export type ReadingInput = z.infer<typeof readingInput>

/** The quote rule: NFKC, whitespace runs collapse to one space. Length counts on this form; matching ignores whitespace entirely, because PDF extraction breaks lines and spaces CJK text unpredictably. */
export function normalizeQuote(text: string) {
  return text.normalize('NFKC').replace(/\s+/g, ' ').trim()
}
export function quoteFound(haystack: string, quote: string) {
  const squeeze = (text: string) => text.normalize('NFKC').replace(/\s+/g, '')
  return squeeze(haystack).includes(squeeze(quote))
}

const shortId = (prefix: string) => prefix + randomBytes(5).toString('hex')

function section(row: Record<string, SQLOutputValue>): ReadingSection {
  return { id: String(row.id), ord: Number(row.ord), title: String(row.title), paragraphs: JSON.parse(String(row.paragraphs)) as ReadingParagraph[], updatedAt: String(row.updated_at) }
}

export class ReadingStore {
  private readonly db: DatabaseSync

  constructor(db: DatabaseSync) { this.db = db }

  /** Append (no sectionId) or replace one section. Caps and the reference check share the transaction with the write, so a refused call leaves nothing behind. */
  write(topicId: string, itemId: string, input: ReadingInput, origin: { threadId: string | null; runId: string | null }): { reading: Reading; sectionId: string; replaced: boolean } {
    const parsed = readingInput.parse(input)
    parsed.paragraphs.forEach((paragraph, index) => {
      const text = paragraph.text.trim()
      if (!text) throw new StudioError(`第 ${index + 1} 段是空的；每段写一件事`, 400, 'reading.invalid', { paragraph: index + 1 })
      if (text.length > READING_LIMITS.paragraphChars)
        throw new StudioError(`第 ${index + 1} 段有 ${text.length} 字，一段最多 ${READING_LIMITS.paragraphChars} 字；拆成两段，或删掉不必要的话`, 400, 'reading.paragraph_too_long', { paragraph: index + 1, chars: text.length, limit: READING_LIMITS.paragraphChars })
    })
    if (parsed.paragraphs.length > READING_LIMITS.paragraphs)
      throw new StudioError(`一节最多 ${READING_LIMITS.paragraphs} 段，这一节给了 ${parsed.paragraphs.length} 段；拆成两节，或把相近的段合并`, 400, 'reading.too_many_paragraphs', { paragraphs: parsed.paragraphs.length, limit: READING_LIMITS.paragraphs })
    const paragraphs: ReadingParagraph[] = parsed.paragraphs.map(paragraph => ({ id: shortId('p'), text: paragraph.text.trim(),
      source: paragraph.source.kind === 'paper' ? { kind: 'paper', ...(paragraph.source.page ? { page: paragraph.source.page } : {}), quote: normalizeQuote(paragraph.source.quote) } : { kind: 'inference' } }))
    const now = new Date().toISOString()
    return transaction(this.db, () => {
      if (!this.db.prepare('SELECT 1 FROM topic_materials WHERE topic_id = ? AND item_id = ?').get(topicId, itemId)) throw notReferenced(itemId)
      let readingId = this.db.prepare('SELECT id FROM readings WHERE topic_id = ? AND item_id = ?').get(topicId, itemId)?.id as string | undefined
      if (!readingId) {
        readingId = randomUUID()
        this.db.prepare('INSERT INTO readings (id, topic_id, item_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(readingId, topicId, itemId, now, now)
      }
      let sectionId = parsed.sectionId
      if (sectionId) {
        const changed = this.db.prepare(`UPDATE reading_sections SET title = ?, paragraphs = ?, thread_id = ?, run_id = ?, updated_at = ? WHERE id = ? AND reading_id = ?`)
          .run(parsed.title, JSON.stringify(paragraphs), origin.threadId, origin.runId, now, sectionId, readingId).changes
        if (!changed) throw new StudioError(`这份解读里没有一节的 id 是 ${sectionId}；用 reading_view 看现有各节的 id，或不给 sectionId 接在最后`, 404, 'reading.section_not_found', { sectionId })
      } else {
        const count = Number(this.db.prepare('SELECT COUNT(*) AS n FROM reading_sections WHERE reading_id = ?').get(readingId)!.n)
        if (count >= READING_LIMITS.sections)
          throw new StudioError(`一份解读最多 ${READING_LIMITS.sections} 节，已经写满；要改就给 sectionId 整节换掉`, 400, 'reading.too_many_sections', { limit: READING_LIMITS.sections })
        sectionId = shortId('s')
        this.db.prepare(`INSERT INTO reading_sections (id, reading_id, ord, title, paragraphs, thread_id, run_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(sectionId, readingId, count + 1, parsed.title, JSON.stringify(paragraphs), origin.threadId, origin.runId, now, now)
      }
      this.db.prepare('UPDATE readings SET updated_at = ? WHERE id = ?').run(now, readingId)
      return { reading: this.view(topicId, itemId)!, sectionId, replaced: !!parsed.sectionId }
    })
  }

  view(topicId: string, itemId: string): Reading | null {
    const row = this.db.prepare(`SELECT r.*, i.title AS item_title FROM readings r JOIN library_items i ON i.id = r.item_id WHERE r.topic_id = ? AND r.item_id = ?`).get(topicId, itemId)
    if (!row) return null
    const sections = this.db.prepare('SELECT * FROM reading_sections WHERE reading_id = ? ORDER BY ord').all(String(row.id)).map(section)
    return { id: String(row.id), topicId, itemId, itemTitle: String(row.item_title), sections, createdAt: String(row.created_at), updatedAt: String(row.updated_at) }
  }

  /** Newest first: the reading view falls back to the first one when no material is picked. */
  list(topicId: string): ReadingSummary[] {
    return this.db.prepare(`SELECT r.item_id, i.title, r.updated_at, (SELECT COUNT(*) FROM reading_sections s WHERE s.reading_id = r.id) AS sections
      FROM readings r JOIN library_items i ON i.id = r.item_id WHERE r.topic_id = ? ORDER BY r.updated_at DESC, r.item_id`).all(topicId)
      .map(row => ({ itemId: String(row.item_id), title: String(row.title), sections: Number(row.sections), updatedAt: String(row.updated_at) }))
  }
}

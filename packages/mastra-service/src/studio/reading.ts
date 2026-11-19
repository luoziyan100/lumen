/**
 * [INPUT]: studio/db's connection and transaction, the R15 refusal, studio/types's ReadingParagraph union
 * [OUTPUT]: ReadingStore (write = append or replace one section; insert = add one prose/table/diagram/widget block into an existing section after a given block or at the end; view; list, newest first),
 *           READING_LIMITS, readingBlockInput, readingInput, readingInsertInput, normalizeQuote / quoteFound
 * [POS]: the only writer of readings. The AI reaches it through reading_write / reading_insert after the tool has checked every paper quote against the material's text;
 *        the user only reads it over HTTP. A reading belongs to one (topic, library item) pair; pre-visual rows without `kind` read as prose text
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { randomBytes, randomUUID } from 'node:crypto'
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite'
import { z } from 'zod'
import { transaction } from './db.ts'
import { notReferenced, StudioError } from './errors.ts'
import type { Reading, ReadingParagraph, ReadingSection, ReadingSource, ReadingSummary } from './types.ts'

export const READING_LIMITS = {
  sections: 12,
  paragraphs: 8,
  /** Maximum items in a section after follow-up reading_insert additions */
  sectionMax: 12,
  paragraphChars: 600,
  title: 120,
  caption: 300,
  quoteMin: 8,
  quoteMax: 400,
  columns: 8,
  rows: 30,
  cell: 300,
  mermaidBytes: 8 * 1024,
  widgetBytes: 64 * 1024,
} as const

// The structural shape only; the caps are checked by hand below so a refusal names the paragraph or block the model has to fix
const source = z.union([
  z.object({ kind: z.literal('paper'), page: z.number().int().min(1).optional(), quote: z.string().max(READING_LIMITS.quoteMax) }).strict(),
  z.object({ kind: z.literal('inference') }).strict(),
])

const optionalTitle = z.string().trim().max(READING_LIMITS.title).optional()
const optionalCaption = z.string().trim().max(READING_LIMITS.caption).optional()

const textBlockInput = z.object({ kind: z.literal('text').optional(), text: z.string(), source }).strict()
const tableBlockInput = z.object({
  kind: z.literal('table'),
  title: optionalTitle,
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  caption: optionalCaption,
  source,
}).strict()
const diagramBlockInput = z.object({
  kind: z.literal('diagram'),
  title: optionalTitle,
  mermaid: z.string(),
  caption: optionalCaption,
  source,
}).strict()
const widgetBlockInput = z.object({
  kind: z.literal('widget'),
  title: optionalTitle,
  html: z.string(),
  caption: optionalCaption,
  source,
}).strict()

export const readingBlockInput = z.union([textBlockInput, tableBlockInput, diagramBlockInput, widgetBlockInput])
export type ReadingBlockInput = z.infer<typeof readingBlockInput>

export const readingInput = z.object({
  sectionId: z.string().max(64).optional(),
  title: z.string().trim().min(1).max(READING_LIMITS.title),
  paragraphs: z.array(readingBlockInput).min(1),
})
export type ReadingInput = z.infer<typeof readingInput>

export const readingInsertInput = z.object({
  sectionId: z.string().min(1).max(64),
  afterId: z.string().min(1).max(64).optional(),
  block: readingBlockInput,
})
export type ReadingInsertInput = z.infer<typeof readingInsertInput>

/** The quote rule: NFKC, whitespace runs collapse to one space. Length counts on this form; matching ignores whitespace entirely, because PDF extraction breaks lines and spaces CJK text unpredictably. */
export function normalizeQuote(text: string) {
  return text.normalize('NFKC').replace(/\s+/g, ' ').trim()
}
export function quoteFound(haystack: string, quote: string) {
  const squeeze = (text: string) => text.normalize('NFKC').replace(/\s+/g, '')
  return squeeze(haystack).includes(squeeze(quote))
}

const shortId = (prefix: string) => prefix + randomBytes(5).toString('hex')

function normalizeSource(value: z.infer<typeof source>): ReadingSource {
  return value.kind === 'paper'
    ? { kind: 'paper', ...(value.page ? { page: value.page } : {}), quote: normalizeQuote(value.quote) }
    : { kind: 'inference' }
}

/** Validate and normalize one reading block (prose, table, Mermaid diagram or interactive HTML widget); refusals name its 1-based position. */
function normalizeBlock(block: ReadingBlockInput, index: number): ReadingParagraph {
  const n = index + 1
  const normalizedSource = normalizeSource(block.source)
  if ('text' in block) {
    const text = block.text.trim()
    if (!text) throw new StudioError(`第 ${n} 段是空的；每段写一件事`, 400, 'reading.invalid', { paragraph: n })
    if (text.length > READING_LIMITS.paragraphChars)
      throw new StudioError(`第 ${n} 段有 ${text.length} 字，一段最多 ${READING_LIMITS.paragraphChars} 字；拆成两段，或删掉不必要的话`, 400, 'reading.paragraph_too_long', { paragraph: n, chars: text.length, limit: READING_LIMITS.paragraphChars })
    return { id: shortId('p'), text, source: normalizedSource }
  }
  const title = block.title?.trim() || undefined
  const caption = block.caption?.trim() || undefined
  if (block.kind === 'table') {
    const columns = block.columns.map(cell => cell.trim())
    if (!columns.length || columns.length > READING_LIMITS.columns)
      throw new StudioError(`第 ${n} 块表格需要 1–${READING_LIMITS.columns} 列`, 400, 'reading.block_invalid', { paragraph: n, kind: 'table' })
    if (columns.some(cell => cell.length > READING_LIMITS.cell))
      throw new StudioError(`第 ${n} 块表格的表头单格不能超过 ${READING_LIMITS.cell} 字`, 400, 'reading.block_invalid', { paragraph: n, kind: 'table' })
    if (block.rows.length > READING_LIMITS.rows)
      throw new StudioError(`第 ${n} 块表格最多 ${READING_LIMITS.rows} 行`, 400, 'reading.block_invalid', { paragraph: n, kind: 'table' })
    const rows = block.rows.map(row => row.map(cell => cell.trim()))
    if (rows.some(row => row.length !== columns.length))
      throw new StudioError(`第 ${n} 块表格每一行的格数要和列数一致`, 400, 'reading.block_invalid', { paragraph: n, kind: 'table' })
    if (rows.some(row => row.some(cell => cell.length > READING_LIMITS.cell)))
      throw new StudioError(`第 ${n} 块表格的单元格不能超过 ${READING_LIMITS.cell} 字`, 400, 'reading.block_invalid', { paragraph: n, kind: 'table' })
    return { id: shortId('p'), kind: 'table', ...(title ? { title } : {}), columns, rows, ...(caption ? { caption } : {}), source: normalizedSource }
  }
  if (block.kind === 'diagram') {
    const mermaid = block.mermaid.trim()
    if (!mermaid) throw new StudioError(`第 ${n} 块图示的 mermaid 源码是空的`, 400, 'reading.block_invalid', { paragraph: n, kind: 'diagram' })
    if (Buffer.byteLength(mermaid) > READING_LIMITS.mermaidBytes)
      throw new StudioError(`第 ${n} 块图示超过 ${Math.round(READING_LIMITS.mermaidBytes / 1024)}KB；拆小一点`, 400, 'reading.block_invalid', { paragraph: n, kind: 'diagram' })
    return { id: shortId('p'), kind: 'diagram', ...(title ? { title } : {}), mermaid, ...(caption ? { caption } : {}), source: normalizedSource }
  }
  const html = block.html.trim()
  if (!html) throw new StudioError(`第 ${n} 块小部件的 html 是空的`, 400, 'reading.block_invalid', { paragraph: n, kind: 'widget' })
  if (Buffer.byteLength(html) > READING_LIMITS.widgetBytes)
    throw new StudioError(`第 ${n} 块小部件超过 ${Math.round(READING_LIMITS.widgetBytes / 1024)}KB；保持轻量`, 400, 'reading.block_invalid', { paragraph: n, kind: 'widget' })
  return { id: shortId('p'), kind: 'widget', ...(title ? { title } : {}), html, ...(caption ? { caption } : {}), source: normalizedSource }
}

function section(row: Record<string, SQLOutputValue>): ReadingSection {
  return { id: String(row.id), ord: Number(row.ord), title: String(row.title), paragraphs: JSON.parse(String(row.paragraphs)) as ReadingParagraph[], updatedAt: String(row.updated_at) }
}

export class ReadingStore {
  private readonly db: DatabaseSync

  constructor(db: DatabaseSync) { this.db = db }

  /** Append (no sectionId) or replace one section. Caps and the reference check share the transaction with the write, so a refused call leaves nothing behind. */
  write(topicId: string, itemId: string, input: ReadingInput, origin: { threadId: string | null; runId: string | null }): { reading: Reading; sectionId: string; replaced: boolean } {
    const parsed = readingInput.parse(input)
    if (parsed.paragraphs.length > READING_LIMITS.paragraphs)
      throw new StudioError(`一节最多 ${READING_LIMITS.paragraphs} 段，这一节给了 ${parsed.paragraphs.length} 段；拆成两节，或把相近的段合并`, 400, 'reading.too_many_paragraphs', { paragraphs: parsed.paragraphs.length, limit: READING_LIMITS.paragraphs })
    const paragraphs: ReadingParagraph[] = parsed.paragraphs.map((paragraph, index) => normalizeBlock(paragraph, index))
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

  /** Insert one block into an existing section right after `afterId` (or at the end when omitted), without rewriting the rest of the section. */
  insert(topicId: string, itemId: string, input: ReadingInsertInput, origin: { threadId: string | null; runId: string | null }): { reading: Reading; sectionId: string; blockId: string; count: number } {
    const parsed = readingInsertInput.parse(input)
    const block = normalizeBlock(parsed.block, 0)
    const now = new Date().toISOString()
    return transaction(this.db, () => {
      if (!this.db.prepare('SELECT 1 FROM topic_materials WHERE topic_id = ? AND item_id = ?').get(topicId, itemId)) throw notReferenced(itemId)
      const readingId = this.db.prepare('SELECT id FROM readings WHERE topic_id = ? AND item_id = ?').get(topicId, itemId)?.id as string | undefined
      if (!readingId) throw new StudioError('这份材料在这个主题里还没有解读；先用 reading_write 写一节', 404, 'reading.not_found')
      const row = this.db.prepare('SELECT id, paragraphs FROM reading_sections WHERE id = ? AND reading_id = ?').get(parsed.sectionId, readingId) as Record<string, SQLOutputValue> | undefined
      if (!row) throw new StudioError(`这份解读里没有一节的 id 是 ${parsed.sectionId}；用 reading_view 看现有各节的 id`, 404, 'reading.section_not_found', { sectionId: parsed.sectionId })
      const paragraphs = JSON.parse(String(row.paragraphs)) as ReadingParagraph[]
      if (paragraphs.length >= READING_LIMITS.sectionMax)
        throw new StudioError(`这一节已有 ${paragraphs.length} 块，最多 ${READING_LIMITS.sectionMax} 块；精简后再插，或用 reading_write 整节整理`, 400, 'reading.section_full', { limit: READING_LIMITS.sectionMax })
      let at = paragraphs.length
      if (parsed.afterId) {
        const found = paragraphs.findIndex(item => item.id === parsed.afterId)
        if (found < 0) throw new StudioError(`这一节里没有 id 为 ${parsed.afterId} 的段落或区块；用 reading_view 看当前各块的 id`, 404, 'reading.block_invalid', { paragraph: 1, afterId: parsed.afterId })
        at = found + 1
      }
      paragraphs.splice(at, 0, block)
      this.db.prepare('UPDATE reading_sections SET paragraphs = ?, thread_id = ?, run_id = ?, updated_at = ? WHERE id = ? AND reading_id = ?')
        .run(JSON.stringify(paragraphs), origin.threadId, origin.runId, now, parsed.sectionId, readingId)
      this.db.prepare('UPDATE readings SET updated_at = ? WHERE id = ?').run(now, readingId)
      return { reading: this.view(topicId, itemId)!, sectionId: parsed.sectionId, blockId: block.id, count: paragraphs.length }
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

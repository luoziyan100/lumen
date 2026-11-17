/**
 * [INPUT]: studio/db transactions, current blocks/sheets state (settled is derived from links), sediment DTOs from types
 * [OUTPUT]: SedimentStore: entry create/list/edit (an edit appends a revision row)/remove (the last link gone returns the block to current), offers add/list/consume (confirm takes the
 *           final text and re-checks delete-only)/dismiss, per-sheet invites (latest replaces), and the speech-habits table (S14: kept/restored counted only on confirm, listable and deletable);
 *           quotePlan — R13's delete-only subsequence planner (pure, no tic list, returns the deleted fragments)
 * [POS]: the only sediment store. Entry text is written only through user HTTP (R13); AI tools only leave invites and offers; links and settled share one transaction (S3),
 *        and links carry no foreign key on purpose: after a sheet delete they keep their stored titles for display while entries and text stay (R17)
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { randomUUID } from 'node:crypto'
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite'
import { transaction } from './db.ts'
import { StudioError } from './errors.ts'
import { estimateTokens } from './board-tools.ts'
import type { SedimentEntry, SedimentFragment, SedimentInvite, SedimentLink, SedimentOffer, SedimentOrigin, SpeechHabit } from './types.ts'

type Row = Record<string, SQLOutputValue>

/** One plain line: 1–280 characters after trim, no newlines (the UI is a single-line input anyway). */
export const ENTRY_TEXT_LIMIT = 280

export function entryText(value: string): string {
  const text = value.trim()
  if (!text || [...text].length > ENTRY_TEXT_LIMIT || /[\r\n]/.test(text))
    throw new StudioError(`沉淀是一行大白话，最长 ${ENTRY_TEXT_LIMIT} 字`, 400, 'sediment.text_invalid')
  return text
}

// ---------------------------------------------------------------------------
// R13 quote check (amended 2026-11-16): there is no fixed tic list — the AI judges what
// a verbal tic is; the service only enforces "delete only": the quote must be obtainable
// from one message by deleting characters (a subsequence, language-independent) while
// whitespace runs may collapse to one space; the planner also returns the deleted
// fragments (the S9 strikethrough and the S14 habit table both feed on them).
// ---------------------------------------------------------------------------
interface Unit { text: string; ws: boolean; start: number; end: number }

/** Units: each non-whitespace character is one unit; a whitespace run collapses into one unit. */
function units(text: string): Unit[] {
  const list: Unit[] = []
  let index = 0
  while (index < text.length) {
    const start = index
    if (/\s/.test(text[index]!)) {
      while (index < text.length && /\s/.test(text[index]!)) index++
      list.push({ text: ' ', ws: true, start, end: index })
    } else {
      list.push({ text: text[index]!, ws: false, start: index, end: index + 1 })
      index++
    }
  }
  return list
}

/**
 * The delete-only planner (pure): can `quote` be obtained from `original` by deleting characters?
 * Returns the deleted fragments (spans into the original, adjacent deletions merged) or 'empty' | 'span'.
 * Alignment is leftmost-greedy: when several deletions yield the same quote, the earlier duplicate goes.
 */
export function quotePlan(original: string, quote: string): SedimentFragment[] | 'empty' | 'span' {
  const candidate = quote.trim()
  if (!candidate) return 'empty'
  const source = units(original), target = units(candidate)
  const deleted: SedimentFragment[] = []
  let at = 0
  const drop = (unit: Unit) => {
    const last = deleted.at(-1)
    if (last && last.end === unit.start) last.end = unit.end, last.text = original.slice(last.start, unit.end)
    else deleted.push({ start: unit.start, end: unit.end, text: original.slice(unit.start, unit.end) })
  }
  for (const unit of target) {
    // skip forward to the next matching unit; everything skipped becomes a deleted fragment
    while (at < source.length && source[at]!.text !== unit.text) drop(source[at]!), at++
    if (at === source.length) return 'span'
    at++
  }
  while (at < source.length) drop(source[at]!), at++
  return deleted
}

function entry(row: Row, links: SedimentLink[]): SedimentEntry {
  return {
    id: String(row.id), topicId: String(row.topic_id), text: String(row.text), origin: row.origin as SedimentOrigin, state: String(row.state),
    quote: row.quote_thread_id === null ? null : { threadId: String(row.quote_thread_id), messageId: String(row.quote_message_id),
      original: String(row.quote_original), fragments: JSON.parse(String(row.quote_fragments ?? '[]')) as SedimentFragment[] },
    links, createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  }
}

function offer(row: Row): SedimentOffer {
  return {
    id: String(row.id), topicId: String(row.topic_id), threadId: String(row.thread_id), messageId: String(row.message_id),
    text: String(row.text), original: String(row.original), fragments: JSON.parse(String(row.fragments ?? '[]')) as SedimentFragment[],
    blockIds: JSON.parse(String(row.block_ids)) as string[], createdAt: String(row.created_at),
  }
}

function invite(row: Row): SedimentInvite {
  return {
    sheetId: String(row.sheet_id), blockIds: JSON.parse(String(row.block_ids)) as string[], question: String(row.question),
    threadId: row.thread_id === null ? null : String(row.thread_id), runId: row.run_id === null ? null : String(row.run_id), createdAt: String(row.created_at),
  }
}

export interface CreateEntryInput {
  text: string
  origin: SedimentOrigin
  /** required for quoted: which user message of which conversation, the full original, and the deleted fragments (the S2 source) */
  quote?: { threadId: string; messageId: string; original: string; fragments?: SedimentFragment[] }
  /** Evidence blocks to pre-link (carrying the rev the UI saw; S10 decides conflicts) */
  blocks?: { id: string; rev: number }[]
}

/** Keep only fragments with visible characters: whitespace-only deletions show no strikethrough and never enter the habit table. */
const visible = (fragments: SedimentFragment[]) => fragments.filter(fragment => fragment.text.trim())

export class SedimentStore {
  private readonly db: DatabaseSync

  constructor(db: DatabaseSync) { this.db = db }

  /** Create an entry (S1–S3): text validation, the delete-only check for quotes, links and settled in one transaction. */
  create(topicId: string, input: CreateEntryInput): SedimentEntry {
    const text = entryText(input.text)
    const fragments = this.validateQuote(topicId, input, text)
    return transaction(this.db, () => this.insert(topicId, input, text, input.quote?.fragments ?? fragments))
  }

  /** S2: the same check runs again on confirm, against the user's final text after the strikethrough choices. */
  private validateQuote(topicId: string, input: CreateEntryInput, text: string): SedimentFragment[] {
    if (input.origin !== 'quoted') return []
    const quote = input.quote
    if (!quote) throw new StudioError('引用的沉淀要带上它出自的消息', 400, 'sediment.quote_source')
    if (!quote.threadId.startsWith(`${topicId}:`))
      throw new StudioError(`引用的对话 ${quote.threadId} 不属于这个主题`, 400, 'sediment.quote_source', { threadId: quote.threadId })
    const plan = quotePlan(quote.original, text)
    if (plan === 'empty' || plan === 'span') throw new StudioError(
      '引用不是原话：只能是你在这条消息里说过的话删掉一些字，不能改字、补字或调顺序', 400, 'sediment.quote_invalid')
    return visible(plan)
  }

  /** No-transaction core: the caller is already inside one (offerConfirm), or create() wraps it. */
  private insert(topicId: string, input: CreateEntryInput, text: string, fragments: SedimentFragment[] = []): SedimentEntry {
    const id = randomUUID(), now = new Date().toISOString()
    this.db.prepare(`INSERT INTO sediment_entries (id, topic_id, text, origin, state, quote_thread_id, quote_message_id, quote_original, quote_fragments, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'unverified', ?, ?, ?, ?, ?, ?)`)
      .run(id, topicId, text, input.origin, input.quote?.threadId ?? null, input.quote?.messageId ?? null, input.quote?.original ?? null,
        JSON.stringify(fragments), now, now)
    this.link(topicId, id, input.blocks ?? [])
    return this.get(topicId, id)
  }

  /** Entries newest first; pending offers oldest first. */
  list(topicId: string): { items: SedimentEntry[]; offers: SedimentOffer[] } {
    const links = new Map<string, SedimentLink[]>()
    for (const row of this.db.prepare(`SELECT l.* FROM sediment_links l JOIN sediment_entries e ON e.id = l.entry_id
      WHERE e.topic_id = ? ORDER BY l.created_at, l.entry_id`).all(topicId) as Row[]) {
      const live = this.db.prepare('SELECT 1 FROM blocks WHERE id = ?').get(String(row.block_id))
      const link: SedimentLink = { blockId: String(row.block_id), title: String(row.block_title), sheetId: String(row.sheet_id), deleted: !live }
      const list = links.get(String(row.entry_id)) ?? []
      list.push(link); links.set(String(row.entry_id), list)
    }
    const items = (this.db.prepare('SELECT * FROM sediment_entries WHERE topic_id = ? ORDER BY created_at DESC, rowid DESC').all(topicId) as Row[])
      .map(row => entry(row, links.get(String(row.id)) ?? []))
    const offers = (this.db.prepare('SELECT * FROM sediment_offers WHERE topic_id = ? ORDER BY created_at, rowid').all(topicId) as Row[]).map(offer)
    return { items, offers }
  }

  get(topicId: string, entryId: string): SedimentEntry {
    const row = this.db.prepare('SELECT * FROM sediment_entries WHERE id = ? AND topic_id = ?').get(entryId, topicId)
    if (!row) throw new StudioError('没有这条沉淀', 404, 'sediment.entry_not_found')
    const links = (this.db.prepare('SELECT * FROM sediment_links WHERE entry_id = ? ORDER BY created_at').all(entryId) as Row[]).map(linkRow => ({
      blockId: String(linkRow.block_id), title: String(linkRow.block_title), sheetId: String(linkRow.sheet_id),
      deleted: !this.db.prepare('SELECT 1 FROM blocks WHERE id = ?').get(String(linkRow.block_id)),
    }))
    return entry(row, links)
  }

  /** Edit the text (S1): the old wording goes to a revision row; origin never changes (a quoted entry stays quoted, the source stays viewable). */
  edit(topicId: string, entryId: string, text: string): SedimentEntry {
    const next = entryText(text)
    return transaction(this.db, () => {
      const current = this.get(topicId, entryId)
      const revision = Number(this.db.prepare('SELECT COALESCE(MAX(revision), 0) + 1 AS r FROM sediment_revisions WHERE entry_id = ?').get(entryId)!.r)
      this.db.prepare('INSERT INTO sediment_revisions (entry_id, revision, old_text, created_at) VALUES (?, ?, ?, ?)')
        .run(entryId, revision, current.text, new Date().toISOString())
      this.db.prepare('UPDATE sediment_entries SET text = ?, updated_at = ? WHERE id = ?').run(next, new Date().toISOString(), entryId)
      return this.get(topicId, entryId)
    })
  }

  /** Remove an entry: revisions and links go with it; the block returns to current when the last link breaks (S3). */
  remove(topicId: string, entryId: string): void {
    transaction(this.db, () => {
      this.get(topicId, entryId)
      const blocks = (this.db.prepare('SELECT block_id FROM sediment_links WHERE entry_id = ?').all(entryId) as Row[]).map(row => String(row.block_id))
      this.db.prepare('DELETE FROM sediment_entries WHERE id = ?').run(entryId)
      this.release(blocks)
    })
  }

  // -------------------------------------------------------------------------
  // Offers (S4): the AI hands the user's words back; only a confirm (HTTP quoted create)
  // lands them, a dismiss deletes them
  // -------------------------------------------------------------------------
  offerAdd(topicId: string, input: { threadId: string; messageId: string; text: string; original: string; fragments: SedimentFragment[]; blockIds?: string[] }): SedimentOffer {
    const id = randomUUID(), now = new Date().toISOString()
    this.db.prepare('INSERT INTO sediment_offers (id, topic_id, thread_id, message_id, text, original, fragments, block_ids, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, topicId, input.threadId, input.messageId, entryText(input.text), input.original, JSON.stringify(input.fragments), JSON.stringify(input.blockIds ?? []), now)
    return offer(this.db.prepare('SELECT * FROM sediment_offers WHERE id = ?').get(id) as Row)
  }

  /**
   * Confirming an offer creates the quoted entry. `text` is the user's final text after the
   * strikethrough choices (default: the AI's offer); the same check runs again (S2/S9), then the
   * speech habits update: left struck counts as kept, restored counts as restored (S14) — a
   * dismissed offer never passes through here and never counts.
   */
  offerConfirm(topicId: string, offerId: string, text?: string, blocks?: { id: string; rev: number }[]): SedimentEntry {
    return transaction(this.db, () => {
      const row = this.db.prepare('SELECT * FROM sediment_offers WHERE id = ? AND topic_id = ?').get(offerId, topicId)
      if (!row) throw new StudioError('这条原话提议不在了（可能已确认或已丢弃）', 404, 'sediment.offer_not_found')
      const pending = offer(row)
      // offer-borne blocks carry no rev the UI saw (NaN): block state alone decides; extra blocks go through the rev check
      const extra = blocks ?? pending.blockIds.map(id => ({ id, rev: Number.NaN }))
      const input: CreateEntryInput = { text: text ?? pending.text, origin: 'quoted',
        quote: { threadId: pending.threadId, messageId: pending.messageId, original: pending.original }, blocks: extra }
      const finalText = entryText(input.text)
      const kept = this.validateQuote(topicId, input, finalText)
      const created = this.insert(topicId, input, finalText, kept)
      // S14: fragments of the offer still deleted in the final text count as kept, restored ones as restored (matched by span;
      // duplicates of the same text cancel out, leaving the counts unaffected)
      const stillDeleted = new Set(kept.map(fragment => `${fragment.start}:${fragment.end}`))
      const now = new Date().toISOString()
      for (const fragment of pending.fragments) {
        const keptNow = stillDeleted.has(`${fragment.start}:${fragment.end}`)
        this.db.prepare(`INSERT INTO speech_habits (fragment, kept, restored, last_seen) VALUES (?, ?, ?, ?)
          ON CONFLICT (fragment) DO UPDATE SET kept = kept + excluded.kept, restored = restored + excluded.restored, last_seen = excluded.last_seen`)
          .run(fragment.text, keptNow ? 1 : 0, keptNow ? 0 : 1, now)
      }
      this.db.prepare('DELETE FROM sediment_offers WHERE id = ?').run(offerId)
      return created
    })
  }

  offerDismiss(topicId: string, offerId: string): void {
    const removed = this.db.prepare('DELETE FROM sediment_offers WHERE id = ? AND topic_id = ?').run(offerId, topicId).changes
    if (!removed) throw new StudioError('这条原话提议不在了', 404, 'sediment.offer_not_found')
  }

  // -------------------------------------------------------------------------
  // S14 speech habits: one global table, counted only in offerConfirm; the AI reads it,
  // the user can list and delete it
  // -------------------------------------------------------------------------
  habits(): SpeechHabit[] {
    return (this.db.prepare('SELECT * FROM speech_habits ORDER BY last_seen DESC').all() as Row[])
      .map(row => ({ fragment: String(row.fragment), kept: Number(row.kept), restored: Number(row.restored), lastSeen: String(row.last_seen) }))
  }

  /** The model's compact section (~budget tokens): tics and counter-examples one line each, oldest dropped first when over. */
  habitsText(budget: number): string {
    const rows = this.habits()
    const tics = rows.filter(row => row.kept >= 1 && row.kept > row.restored)
    const notTics = rows.filter(row => row.restored > row.kept)
    if (!tics.length && !notTics.length) return ''
    const head = '说话习惯（只由用户的留下/恢复累计，递回原话时参考；拿不准的宁可少删，让用户自己划）：'
    // pack newest first; whatever no longer fits is dropped from the tail (the oldest)
    const pack = (label: string, list: SpeechHabit[], unit: string): string => {
      let out = ''
      for (const row of list) {
        const next = `${out}${out ? '、' : ''}${row.fragment}（${unit}${Math.max(row.kept, row.restored)}）`
        if (estimateTokens(head) + estimateTokens(next) > budget) break
        out = next
      }
      return out ? `${label}${out}` : ''
    }
    const ticLine = pack('口癖：', tics, '留')
    const notLine = pack('用户恢复过（不当口癖删）：', notTics, '复')
    const parts = [ticLine, notLine].filter(Boolean)
    return parts.length ? `${head}${parts.join('；')}` : ''
  }

  habitRemove(fragment: string): void {
    this.db.prepare('DELETE FROM speech_habits WHERE fragment = ?').run(fragment)
  }

  // -------------------------------------------------------------------------
  // Per-sheet invites (S4): the latest replaces the earlier one; they die with the sheet (cascade).
  // -------------------------------------------------------------------------
  invite(sheetId: string, input: { blockIds: string[]; question: string; threadId: string | null; runId: string | null }): SedimentInvite {
    const now = new Date().toISOString()
    this.db.prepare(`INSERT INTO sediment_invites (sheet_id, block_ids, question, thread_id, run_id, created_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (sheet_id) DO UPDATE SET block_ids = excluded.block_ids, question = excluded.question, thread_id = excluded.thread_id,
        run_id = excluded.run_id, created_at = excluded.created_at`)
      .run(sheetId, JSON.stringify(input.blockIds), input.question, input.threadId, input.runId, now)
    return this.inviteOf(sheetId)!
  }

  inviteOf(sheetId: string): SedimentInvite | null {
    const row = this.db.prepare('SELECT * FROM sediment_invites WHERE sheet_id = ?').get(sheetId)
    return row ? invite(row as Row) : null
  }

  // -------------------------------------------------------------------------
  // Internals: links and settled (S3)
  // -------------------------------------------------------------------------
  /** Link evidence blocks: the block must be a current/settled block of this topic (a superseded one is no evidence) and the rev must match (S10); linking settles it. */
  private link(topicId: string, entryId: string, blocks: { id: string; rev: number }[]): void {
    for (const target of blocks) {
      const row = this.db.prepare(`SELECT b.id, b.title, b.sheet_id, b.state, b.rev FROM blocks b JOIN sheets s ON s.id = b.sheet_id
        WHERE b.id = ? AND s.topic_id = ?`).get(target.id, topicId)
      if (!row) throw new StudioError(`白板上没有区块 ${target.id}，挂不上证据`, 400, 'sediment.link_invalid', { blockId: target.id })
      if (row.state === 'superseded') throw new StudioError(`「${row.title}」已被取代，不能当证据；换成还在的区块`, 400, 'sediment.link_invalid', { blockId: target.id })
      // the offer-confirm path has no rev the UI saw (NaN): block state alone decides the link
      if (!Number.isNaN(target.rev) && Number(target.rev) !== Number(row.rev))
        throw new StudioError(`「${row.title}」在你看到之后被改过（现在第 ${row.rev} 版，你看的是第 ${target.rev} 版）：刷新白板后再挂`, 409, 'sediment.link_stale', { blockId: target.id, rev: Number(row.rev), baseRev: target.rev })
      this.db.prepare('INSERT OR IGNORE INTO sediment_links (entry_id, block_id, block_title, sheet_id, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(entryId, target.id, String(row.title), String(row.sheet_id), new Date().toISOString())
      if (row.state === 'current') this.db.prepare(`UPDATE blocks SET state = 'settled' WHERE id = ?`).run(target.id)
    }
  }

  /** A released block returns from settled to current once no entry links it any more. */
  private release(blocks: string[]): void {
    for (const blockId of blocks) {
      const held = this.db.prepare('SELECT 1 FROM sediment_links WHERE block_id = ? LIMIT 1').get(blockId)
      if (!held) this.db.prepare(`UPDATE blocks SET state = 'current' WHERE id = ? AND state = 'settled'`).run(blockId)
    }
  }
}

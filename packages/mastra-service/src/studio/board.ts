/**
 * [INPUT]: studio/db connections and transactions, the content/source contracts of studio/content, the topic reference list
 * [OUTPUT]: BoardStore: sheet create/list/delete (R17: user only; guard, confirmation and neighbour re-selection in one transaction, the confirmation carrying the affected takeaway count), which sheet a block is on, the user's selection, the per-run fixed target (R16), block draw/update/supersede (settled blocks refuse both: the user keeps them as evidence), capacity counting current+settled, per-run/per-conversation change collection and version snapshots; insertSheet
 * [POS]: the board's only write path (R4); the topic comes from the caller's trusted identity, and the write target (R16), capacity (R11), rev concurrency and source boundary (R15) are all decided inside one transaction
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { randomBytes, randomUUID } from 'node:crypto'
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite'
import { blockTitle, parseContent, parseSources } from './content.ts'
import { transaction } from './db.ts'
import { StudioError } from './errors.ts'
import type { Block, BlockKind, BlockSource, Sheet, SheetVersion, SheetView, WriteOrigin } from './types.ts'

type Row = Record<string, SQLOutputValue>
export const DEFAULT_CAPACITY = 8

// ---------------------------------------------------------------------------
// Auto layout: a three-column waterfall, the AI never touches coordinates; `near` only picks the column. Heights are estimates; the front end re-renders with measured heights
// ---------------------------------------------------------------------------
const COLUMN_WIDTH = 400, GAP = 32, COLUMNS = 3

function estimateHeight(kind: BlockKind, content: unknown): number {
  if (kind === 'text') return Math.min(640, 72 + Math.ceil((content as { markdown: string }).markdown.length / 26) * 22)
  if (kind === 'ladder') return 64 + (content as { rungs: unknown[] }).rungs.length * 44
  if (kind === 'table') return 64 + ((content as { rows: unknown[] }).rows.length + 1) * 34
  return 320
}

function sheet(row: Row): Sheet {
  return { id: String(row.id), topicId: String(row.topic_id), title: String(row.title), state: row.state as Sheet['state'],
    capacity: Number(row.capacity), used: Number(row.used ?? 0), ord: Number(row.ord), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }
}

function block(row: Row): Block {
  return { id: String(row.id), sheetId: String(row.sheet_id), kind: row.kind as BlockKind, title: String(row.title), content: JSON.parse(String(row.content)),
    x: Number(row.x), y: Number(row.y), w: Number(row.w), h: Number(row.h), state: row.state as Block['state'],
    supersededBy: row.superseded_by === null ? null : String(row.superseded_by), rev: Number(row.rev), sources: JSON.parse(String(row.sources)) as BlockSource[],
    threadId: row.thread_id === null ? null : String(row.thread_id), runId: row.run_id === null ? null : String(row.run_id),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at) }
}

/** Since P1 `used` counts current+settled (S3: blocks kept as evidence still fill the sheet; only superseded ones free room). */
const SHEET_COLUMNS = `s.*, (SELECT COUNT(*) FROM blocks b WHERE b.sheet_id = s.id AND b.state IN ('current','settled')) AS used`

/** Open a new live sheet with the next ord; the first sheet of a new topic and the user's ＋ share this path. */
export function insertSheet(db: DatabaseSync, topicId: string, title: string, now: string): string {
  const id = randomUUID()
  const ord = Number(db.prepare('SELECT COALESCE(MAX(ord), 0) + 1 AS ord FROM sheets WHERE topic_id = ?').get(topicId)!.ord)
  db.prepare(`INSERT INTO sheets (id, topic_id, title, state, capacity, ord, created_at, updated_at) VALUES (?, ?, ?, 'live', ?, ?, ?, ?)`)
    .run(id, topicId, title, DEFAULT_CAPACITY, ord, now, now)
  return id
}

export interface DrawInput { kind: BlockKind; title: string; content: unknown; sources?: unknown; near?: string }
export interface UpdateInput { blockId: string; title?: string; content?: unknown; sources?: unknown; baseRev: number }

export class BoardStore {
  private readonly db: DatabaseSync

  constructor(db: DatabaseSync) { this.db = db }

  sheets(topicId: string): Sheet[] {
    return this.db.prepare(`SELECT ${SHEET_COLUMNS} FROM sheets s WHERE s.topic_id = ? ORDER BY s.ord`).all(topicId).map(sheet)
  }

  sheet(sheetId: string): Sheet {
    const row = this.db.prepare(`SELECT ${SHEET_COLUMNS} FROM sheets s WHERE s.id = ?`).get(sheetId)
    if (!row) throw new StudioError('没有这张白板', 404, 'board.sheet_not_found')
    return sheet(row)
  }

  /** The user's ＋: the new sheet also becomes the topic's selection (R16). */
  createSheet(topicId: string, title?: string): Sheet {
    const now = new Date().toISOString()
    const id = transaction(this.db, () => {
      const count = Number(this.db.prepare('SELECT COUNT(*) AS n FROM sheets WHERE topic_id = ?').get(topicId)!.n)
      // After a delete (R17) the count can fall below a default title already in use: take the first free number
      const used = new Set(this.db.prepare('SELECT title FROM sheets WHERE topic_id = ?').all(topicId).map(row => String(row.title)))
      let number = count + 1
      while (used.has(`白板 ${number}`)) number++
      const created = insertSheet(this.db, topicId, title?.trim() || `白板 ${number}`, now)
      this.storeSelection(topicId, created, now)
      this.touchTopic(topicId, now)
      return created
    })
    return this.sheet(id)
  }

  // -------------------------------------------------------------------------
  // R17: only the user deletes a sheet (HTTP, no board tool). Guard, block count, neighbour selection and the delete share one transaction
  // -------------------------------------------------------------------------
  /**
   * busy: threads whose run is running or waiting, read just before; since: when that read started. A target row created at or after
   * `since` counts as busy too, so a run that captured this sheet while the activity was being read still blocks the delete.
   */
  deleteSheet(topicId: string, sheetId: string, guard: { confirmed: boolean; busy: ReadonlySet<string>; since: string }): { deleted: string; selected: string | null } {
    return transaction(this.db, () => {
      const target = this.sheet(sheetId)
      if (target.topicId !== topicId) throw new StudioError('没有这张白板', 404, 'board.sheet_not_found')
      const held = this.db.prepare('SELECT thread_id, created_at FROM run_targets WHERE sheet_id = ?').all(sheetId)
        .some(row => guard.busy.has(String(row.thread_id)) || String(row.created_at) >= guard.since)
      if (held) throw new StudioError(`白板「${target.title}」正被 AI 这一轮写着，不能删；等这一轮结束或把它停下再删。`, 409, 'board.sheet_in_use', { title: target.title }, { reason: 'target' })
      const blocks = Number(this.db.prepare('SELECT COUNT(*) AS n FROM blocks WHERE sheet_id = ?').get(sheetId)!.n)
      if (blocks && !guard.confirmed) {
        // S3: when settled blocks go with the sheet, the takeaways linked to them lose this evidence link (entries and text stay)
        const settled = Number(this.db.prepare(`SELECT COUNT(DISTINCT l.entry_id) AS n FROM sediment_links l
          JOIN blocks b ON b.id = l.block_id WHERE b.sheet_id = ?`).get(sheetId)!.n)
        throw new StudioError(`白板「${target.title}」上有 ${blocks} 块内容，删除要先确认，删了不能恢复。`, 409, 'board.confirm_delete', { title: target.title, blocks }, { reason: 'confirm', blocks, ...(settled ? { settled } : {}) })
      }
      // ---- the sheet the next message would write to is going away: move to the next sheet by ord, else the previous one, else none ----
      const selected = this.selectedSheet(topicId)?.id === sheetId
      const neighbour = this.db.prepare('SELECT id FROM sheets WHERE topic_id = ? AND ord > ? ORDER BY ord LIMIT 1').get(topicId, target.ord)
        ?? this.db.prepare('SELECT id FROM sheets WHERE topic_id = ? AND ord < ? ORDER BY ord DESC LIMIT 1').get(topicId, target.ord)
      // Explicit deletes (the cascades would do the same): nothing soft-deleted, and a failure at any step rolls back all of them.
      // sediment_links deliberately carries no FK to blocks: the links keep their stored titles and the entries stay (S3/R17)
      for (const table of ['blocks', 'sheet_versions', 'run_targets', 'sheet_selection', 'sediment_invites']) this.db.prepare(`DELETE FROM ${table} WHERE sheet_id = ?`).run(sheetId)
      this.db.prepare('DELETE FROM sheets WHERE id = ?').run(sheetId)
      const now = new Date().toISOString()
      if (selected && neighbour) this.storeSelection(topicId, String(neighbour.id), now)
      this.touchTopic(topicId, now)
      return { deleted: sheetId, selected: this.selectedSheet(topicId)?.id ?? null }
    })
  }

  /** Where a block lives, for conversation cards (R17: a card whose sheet was deleted says so). */
  blockSheet(blockId: string): { blockId: string; sheetId: string; topicId: string } {
    const row = this.db.prepare('SELECT b.sheet_id, s.topic_id FROM blocks b JOIN sheets s ON s.id = b.sheet_id WHERE b.id = ?').get(blockId)
    if (!row) throw new StudioError('这块所在的白板已删除', 404, 'board.block_sheet_deleted', undefined, { reason: 'deleted' })
    return { blockId, sheetId: String(row.sheet_id), topicId: String(row.topic_id) }
  }

  view(sheetId: string): SheetView {
    const target = this.sheet(sheetId)
    return { sheet: target, blocks: this.db.prepare('SELECT * FROM blocks WHERE sheet_id = ? ORDER BY rowid').all(sheetId).map(block) }
  }

  /** The newest live sheet: the target for clients that never sent a selection (B3), and the old `writable` field. */
  writableSheet(topicId: string): Sheet {
    const row = this.db.prepare(`SELECT ${SHEET_COLUMNS} FROM sheets s WHERE s.topic_id = ? AND s.state = 'live' ORDER BY s.ord DESC LIMIT 1`).get(topicId)
    if (!row) throw new StudioError('这个主题现在没有进行中的白板；请用户点 ＋ 新开一张', 409, 'board.no_live_sheet')
    return sheet(row)
  }

  // -------------------------------------------------------------------------
  // R16: the user selects a sheet; a run writes to the sheet selected when it started, for the whole run
  // -------------------------------------------------------------------------
  /** The stored selection, if it still names a sheet of this topic. */
  selection(topicId: string): string | null {
    const row = this.db.prepare(`SELECT c.sheet_id FROM sheet_selection c JOIN sheets s ON s.id = c.sheet_id AND s.topic_id = c.topic_id WHERE c.topic_id = ?`).get(topicId)
    return row ? String(row.sheet_id) : null
  }

  select(topicId: string, sheetId: string): void {
    if (this.sheet(sheetId).topicId !== topicId) throw new StudioError('没有这张白板', 404, 'board.sheet_not_found')
    this.storeSelection(topicId, sheetId, new Date().toISOString())
  }

  /** What the next run would write to: the selection, else the newest live sheet (clients that never select), else none. */
  selectedSheet(topicId: string): Sheet | null {
    const selected = this.selection(topicId)
    if (selected) return this.sheet(selected)
    try { return this.writableSheet(topicId) } catch (error) { if (error instanceof StudioError && error.status === 409) return null; throw error }
  }

  /** The run's fixed target. Only the run's own path calls this (start, instructions, its writes): the first call captures the selection; later calls (resume, restart) read the stored one. */
  runTarget(threadId: string): Sheet | null {
    const stored = this.storedTarget(threadId)
    if (stored !== undefined) return stored
    const topicId = threadId.split(':')[0]!
    // Sessions outside any topic (no catalog row) have no board, so nothing to capture
    if (!this.db.prepare('SELECT 1 FROM topics WHERE id = ?').get(topicId)) return null
    const target = this.selectedSheet(topicId)
    this.db.prepare('INSERT OR IGNORE INTO run_targets (thread_id, topic_id, sheet_id, created_at) VALUES (?, ?, ?, ?)').run(threadId, topicId, target?.id ?? null, new Date().toISOString())
    return this.runTarget(threadId)
  }

  /** Reads that may happen outside the run (a background expert's board_view): the stored target if any, else today's selection; never captures. */
  peekTarget(threadId: string): Sheet | null {
    const stored = this.storedTarget(threadId)
    if (stored !== undefined) return stored
    const topicId = threadId.split(':')[0]!
    return this.db.prepare('SELECT 1 FROM topics WHERE id = ?').get(topicId) ? this.selectedSheet(topicId) : null
  }

  /** The run is over (complete, stopped or failed; not suspended): the next run captures the selection again. */
  endRun(threadId: string): void {
    this.db.prepare('DELETE FROM run_targets WHERE thread_id = ?').run(threadId)
  }

  /** Targets currently held by runs of this topic, newest first (R1 allows one active conversation per topic). */
  runTargets(topicId: string): { threadId: string; sheetId: string | null }[] {
    return this.db.prepare('SELECT thread_id, sheet_id FROM run_targets WHERE topic_id = ? ORDER BY created_at DESC').all(topicId)
      .map(row => ({ threadId: String(row.thread_id), sheetId: row.sheet_id === null ? null : String(row.sheet_id) }))
  }

  /** undefined: nothing on record for this thread. */
  private storedTarget(threadId: string): Sheet | null | undefined {
    const row = this.db.prepare('SELECT sheet_id FROM run_targets WHERE thread_id = ?').get(threadId)
    return row ? (row.sheet_id === null ? null : this.sheet(String(row.sheet_id))) : undefined
  }

  /** sheetId undefined: today's newest live sheet. null: the run has no sheet. Otherwise the run's target, which must be live. */
  private target(topicId: string, sheetId: string | null | undefined): Sheet {
    if (sheetId === undefined) return this.writableSheet(topicId)
    if (sheetId === null) throw new StudioError('这个主题现在没有进行中的白板；请用户点 ＋ 新开一张', 409, 'board.no_live_sheet')
    const target = this.sheet(sheetId)
    if (target.topicId !== topicId) throw new StudioError('没有这张白板', 404, 'board.sheet_not_found')
    if (target.state !== 'live') throw new StudioError(
      `用户这一轮选中的白板「${target.title}」已经收起，只读：这一轮不写白板。在对话里告诉用户这一点；要画的话，请用户选一张进行中的白板或点 ＋ 新开一张，再发消息。`, 409, 'board.selected_sheet_closed', { title: target.title })
    return target
  }

  draw(topicId: string, input: DrawInput, origin: WriteOrigin, sheetId?: string | null): { blockId: string; rev: number; sheetId: string; used: number; capacity: number } {
    const content = parseContent(input.kind, input.content)
    const title = this.title(input.title)
    const sources = this.sources(topicId, input.sources)
    return transaction(this.db, () => {
      const target = this.target(topicId, sheetId)
      if (target.used >= target.capacity) throw new StudioError(
        `这张白板满了（${target.used}/${target.capacity}）。不要往外挤，也不要换到别的白板：用 sediment_invite 指出这张里值得留下的几块，问用户一句，请用户用自己的话沉淀；已沉淀的块仍占格子，被取代的可以用 board_supersede 标灰腾位。要接着画，请用户点 ＋ 开一张新的再发消息，开哪张由用户选。`, 409, 'board.sheet_full', { used: target.used, capacity: target.capacity })
      const place = this.place(target.id, input.kind, content, input.near)
      const id = `b${randomBytes(5).toString('hex')}`, now = new Date().toISOString()
      this.db.prepare(`INSERT INTO blocks (id, sheet_id, kind, title, content, x, y, w, h, state, superseded_by, rev, sources, thread_id, run_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'current', NULL, 1, ?, ?, ?, ?, ?)`)
        .run(id, target.id, input.kind, title, JSON.stringify(content), place.x, place.y, place.w, place.h, JSON.stringify(sources), origin.threadId, origin.runId, now, now)
      this.touchSheet(target, now)
      return { blockId: id, rev: 1, sheetId: target.id, used: target.used + 1, capacity: target.capacity }
    })
  }

  update(topicId: string, input: UpdateInput, origin: WriteOrigin, sheetId?: string | null): { blockId: string; rev: number } {
    const title = input.title === undefined ? undefined : this.title(input.title)
    const sources = input.sources === undefined ? undefined : this.sources(topicId, input.sources)
    return transaction(this.db, () => {
      const current = this.ownedBlock(topicId, input.blockId, sheetId)
      if (current.block.state === 'settled') throw new StudioError(
        `「${current.block.title}」已被用户留作沉淀的证据，不能改；要更新理解就画一块新的，让旧的留在原地`, 409, 'board.block_not_current', { title: current.block.title, state: current.block.state })
      if (current.block.state !== 'current') throw new StudioError(`「${current.block.title}」已经不是当前区块（${current.block.state}），不能再改；需要的话画一块新的`, 409, 'board.block_not_current', { title: current.block.title, state: current.block.state })
      if (input.baseRev !== current.block.rev) throw new StudioError(
        `「${current.block.title}」已经被改过：现在是第 ${current.block.rev} 版，你基于第 ${input.baseRev} 版。先用 board_view 看最新内容再改。`, 409, 'board.block_stale', { title: current.block.title, rev: current.block.rev, baseRev: input.baseRev })
      const content = input.content === undefined ? current.block.content : parseContent(current.block.kind, input.content)
      const now = new Date().toISOString(), rev = current.block.rev + 1
      this.db.prepare(`UPDATE blocks SET title = ?, content = ?, sources = ?, rev = ?, thread_id = ?, run_id = ?, updated_at = ? WHERE id = ?`)
        .run(title ?? current.block.title, JSON.stringify(content), JSON.stringify(sources ?? current.block.sources), rev, origin.threadId, origin.runId, now, current.block.id)
      this.touchSheet(current.sheet, now)
      return { blockId: current.block.id, rev }
    })
  }

  supersede(topicId: string, input: { blockId: string; by?: string }, origin: WriteOrigin, sheetId?: string | null): { blockId: string; rev: number } {
    return transaction(this.db, () => {
      const current = this.ownedBlock(topicId, input.blockId, sheetId)
      if (current.block.state === 'settled') throw new StudioError(
        `「${current.block.title}」已被用户留作沉淀的证据，留在原地就好；它不占新的理解`, 409, 'board.block_already_replaced', { title: current.block.title, state: current.block.state })
      if (current.block.state !== 'current') throw new StudioError(`「${current.block.title}」已经是 ${current.block.state}，不用再取代`, 409, 'board.block_already_replaced', { title: current.block.title, state: current.block.state })
      if (input.by !== undefined) {
        if (input.by === input.blockId) throw new StudioError('一块不能取代它自己', 400, 'board.replace_self')
        const replacement = this.db.prepare(`SELECT state FROM blocks WHERE id = ? AND sheet_id = ?`).get(input.by, current.sheet.id)
        if (!replacement || replacement.state !== 'current') throw new StudioError(`取代它的区块 ${input.by} 不在这张白板的当前区块里`, 400, 'board.replacement_missing', { by: input.by })
      }
      const now = new Date().toISOString(), rev = current.block.rev + 1
      this.db.prepare(`UPDATE blocks SET state = 'superseded', superseded_by = ?, rev = ?, thread_id = ?, run_id = ?, updated_at = ? WHERE id = ?`)
        .run(input.by ?? null, rev, origin.threadId, origin.runId, now, current.block.id)
      this.touchSheet(current.sheet, now)
      return { blockId: current.block.id, rev }
    })
  }

  /** The sheets this run wrote to (R7: only changed ones get a version). */
  changedSheets(runId: string): string[] {
    return this.db.prepare('SELECT DISTINCT sheet_id FROM blocks WHERE run_id = ? ORDER BY sheet_id').all(runId).map(row => String(row.sheet_id))
  }

  /** Sheets this conversation changed since its last version; a resumed suspension gets a new runId, so we collect by conversation, not runId — it survives restarts. */
  pendingSheets(threadId: string): string[] {
    return this.db.prepare(`SELECT DISTINCT sheet_id FROM blocks WHERE thread_id = ?
      AND updated_at > COALESCE((SELECT MAX(created_at) FROM sheet_versions WHERE thread_id = ?), '') ORDER BY sheet_id`).all(threadId, threadId).map(row => String(row.sheet_id))
  }

  writeVersion(sheetId: string, origin: WriteOrigin): SheetVersion {
    return transaction(this.db, () => {
      const snapshot = this.view(sheetId)
      const version = Number(this.db.prepare('SELECT COALESCE(MAX(version), 0) + 1 AS v FROM sheet_versions WHERE sheet_id = ?').get(sheetId)!.v)
      const now = new Date().toISOString()
      this.db.prepare('INSERT INTO sheet_versions VALUES (?, ?, ?, ?, ?, ?)').run(sheetId, version, origin.threadId, origin.runId, JSON.stringify(snapshot), now)
      return { sheetId, version, threadId: origin.threadId, runId: origin.runId, snapshot, createdAt: now }
    })
  }

  versions(sheetId: string): SheetVersion[] {
    return this.db.prepare('SELECT * FROM sheet_versions WHERE sheet_id = ? ORDER BY version').all(sheetId).map(row => ({
      sheetId: String(row.sheet_id), version: Number(row.version), threadId: row.thread_id === null ? null : String(row.thread_id),
      runId: row.run_id === null ? null : String(row.run_id), snapshot: JSON.parse(String(row.snapshot)) as SheetView, createdAt: String(row.created_at) }))
  }

  // -------------------------------------------------------------------------
  // Internals: ownership, the source boundary and layout
  // -------------------------------------------------------------------------
  private title(value: string) {
    const result = blockTitle.safeParse(value)
    if (!result.success) throw new StudioError('区块标题要有，且不超过 80 字', 400, 'board.title_invalid')
    return result.data
  }

  /** R15: sources may only point at materials this topic references or conversations of this topic. */
  private sources(topicId: string, value: unknown): BlockSource[] {
    const sources = parseSources(value)
    const referenced = this.db.prepare('SELECT 1 FROM topic_materials WHERE topic_id = ? AND item_id = ?')
    for (const source of sources) {
      if ('itemId' in source && !referenced.get(topicId, source.itemId))
        throw new StudioError(`出处里的材料 ${source.itemId} 不在这个主题的引用清单里；先用 list_materials 看能引用哪些材料`, 400, 'board.source_material', { itemId: source.itemId })
      if ('threadId' in source && !source.threadId.startsWith(`${topicId}:`))
        throw new StudioError(`出处里的对话 ${source.threadId} 不属于这个主题`, 400, 'board.source_thread', { threadId: source.threadId })
    }
    return sources
  }

  /** With a run target (sheetId defined), only blocks on that sheet can change (R16). */
  private ownedBlock(topicId: string, blockId: string, sheetId?: string | null) {
    const fixed = sheetId === undefined ? undefined : this.target(topicId, sheetId)
    const row = this.db.prepare(`SELECT b.* FROM blocks b JOIN sheets s ON s.id = b.sheet_id WHERE b.id = ? AND s.topic_id = ?`).get(blockId, topicId)
    if (!row) throw new StudioError(`这个主题的白板上没有区块 ${blockId}；用 board_view 看现有区块`, 404, 'board.block_not_found', { blockId })
    const owned = block(row), target = this.sheet(owned.sheetId)
    if (fixed && fixed.id !== target.id) throw new StudioError(
      `区块 ${blockId} 在白板「${target.title}」上，不在这一轮写入的白板「${fixed.title}」上；这一轮只能改「${fixed.title}」上的区块。`, 409, 'board.block_other_sheet', { blockId, sheet: target.title, target: fixed.title })
    if (target.state !== 'live') throw new StudioError('这张白板已经收起，只读', 409, 'board.sheet_closed')
    return { block: owned, sheet: target }
  }

  private place(sheetId: string, kind: BlockKind, content: unknown, near?: string) {
    const rows = this.db.prepare('SELECT id, x, y, h FROM blocks WHERE sheet_id = ?').all(sheetId)
    const bottoms = Array.from({ length: COLUMNS }, () => 0)
    const columnOf = (x: number) => Math.max(0, Math.min(COLUMNS - 1, Math.round(x / (COLUMN_WIDTH + GAP))))
    for (const row of rows) {
      const column = columnOf(Number(row.x))
      bottoms[column] = Math.max(bottoms[column]!, Number(row.y) + Number(row.h) + GAP)
    }
    const anchor = near ? rows.find(row => row.id === near) : undefined
    const column = anchor ? columnOf(Number(anchor.x)) : bottoms.indexOf(Math.min(...bottoms))
    return { x: column * (COLUMN_WIDTH + GAP), y: bottoms[column]!, w: COLUMN_WIDTH, h: estimateHeight(kind, content) }
  }

  private storeSelection(topicId: string, sheetId: string, now: string) {
    this.db.prepare(`INSERT INTO sheet_selection (topic_id, sheet_id, updated_at) VALUES (?, ?, ?)
      ON CONFLICT (topic_id) DO UPDATE SET sheet_id = excluded.sheet_id, updated_at = excluded.updated_at`).run(topicId, sheetId, now)
  }

  private touchSheet(target: Sheet, now: string) {
    this.db.prepare('UPDATE sheets SET updated_at = ? WHERE id = ?').run(now, target.id)
    this.touchTopic(target.topicId, now)
  }

  private touchTopic(topicId: string, now: string) {
    this.db.prepare('UPDATE topics SET updated_at = ? WHERE id = ?').run(now, topicId)
  }
}

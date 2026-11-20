/**
 * [INPUT]: studio/db connections and transactions, the canvas store (studio/canvas)
 * [OUTPUT]: BoardStore: sheet create/list/delete (R17: user only; guard, confirmation and neighbour re-selection in one transaction, the confirmation carrying the
 *           content count — live canvas elements plus old blocks — and the affected takeaway count), the user's selection, the per-run fixed target (R16) and its
 *           live check (writeTarget), the per-conversation R7 candidates and snapshots, and `canvas`, each sheet's co-drawn canvas; insertSheet
 * [POS]: owner of sheets and where a run writes; the topic comes from the caller's trusted identity. What is on a sheet lives in CanvasStore; the old block
 *        writers retired with the canvas (2026-11-19) and the blocks/sheet_versions tables stay, unwritten, for old data and takeaway titles
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { randomUUID } from 'node:crypto'
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite'
import { CanvasStore } from './canvas.ts'
import { transaction } from './db.ts'
import { StudioError } from './errors.ts'
import type { Sheet, WriteOrigin } from './types.ts'

type Row = Record<string, SQLOutputValue>

function sheet(row: Row): Sheet {
  return { id: String(row.id), topicId: String(row.topic_id), title: String(row.title), state: row.state as Sheet['state'],
    used: Number(row.used ?? 0), ord: Number(row.ord), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }
}

/** `used` counts the live canvas elements (a tombstone always carries deleted_by); the sheet has no capacity since 2026-11-19 (R11), the column stays for old rows. */
const SHEET_COLUMNS = `s.*, (SELECT COUNT(*) FROM canvas_elements c WHERE c.sheet_id = s.id AND c.deleted_by IS NULL) AS used`

/** Open a new live sheet with the next ord; the first sheet of a new topic and the user's ＋ share this path. */
export function insertSheet(db: DatabaseSync, topicId: string, title: string, now: string): string {
  const id = randomUUID()
  const ord = Number(db.prepare('SELECT COALESCE(MAX(ord), 0) + 1 AS ord FROM sheets WHERE topic_id = ?').get(topicId)!.ord)
  // capacity keeps its column default: the canvas has none (R11), the column stays for old rows
  db.prepare(`INSERT INTO sheets (id, topic_id, title, state, ord, created_at, updated_at) VALUES (?, ?, ?, 'live', ?, ?, ?)`)
    .run(id, topicId, title, ord, now, now)
  return id
}

export class BoardStore {
  private readonly db: DatabaseSync
  /** The co-drawn canvas of each sheet (2026-11-19); sheets, selection and run targets stay here */
  readonly canvas: CanvasStore

  constructor(db: DatabaseSync) { this.db = db; this.canvas = new CanvasStore(db) }

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
      // Content = live canvas elements plus any old blocks the sheet still carries; the detail keeps its old `blocks` name for clients
      const blocks = this.canvas.count(sheetId) + Number(this.db.prepare('SELECT COUNT(*) AS n FROM blocks WHERE sheet_id = ?').get(sheetId)!.n)
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
      this.canvas.deleteSheet(sheetId)
      this.db.prepare('DELETE FROM sheets WHERE id = ?').run(sheetId)
      const now = new Date().toISOString()
      if (selected && neighbour) this.storeSelection(topicId, String(neighbour.id), now)
      this.touchTopic(topicId, now)
      return { deleted: sheetId, selected: this.selectedSheet(topicId)?.id ?? null }
    })
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
  writeTarget(topicId: string, sheetId: string | null | undefined): Sheet {
    if (sheetId === undefined) return this.writableSheet(topicId)
    if (sheetId === null) throw new StudioError('这个主题现在没有进行中的白板；请用户点 ＋ 新开一张', 409, 'board.no_live_sheet')
    const target = this.sheet(sheetId)
    if (target.topicId !== topicId) throw new StudioError('没有这张白板', 404, 'board.sheet_not_found')
    if (target.state !== 'live') throw new StudioError(
      `用户这一轮选中的白板「${target.title}」已经收起，只读：这一轮不写白板。在对话里告诉用户这一点；要画的话，请用户选一张进行中的白板或点 ＋ 新开一张，再发消息。`, 409, 'board.selected_sheet_closed', { title: target.title })
    return target
  }





  /**
   * R7 candidates at the end of a run: the sheets this conversation drew, changed or erased on since its last snapshot, plus the run's target
   * (the user may have drawn there during the run). A resumed suspension gets a new runId, so this collects by conversation — it survives restarts.
   */
  pendingSheets(threadId: string): string[] {
    const target = this.storedTarget(threadId)
    return [...new Set([...this.canvas.changedBy(threadId), ...(target ? [target.id] : [])])].sort()
  }

  /** R7: one scene snapshot when the scene differs from the last one; null when it does not (user autosaves alone never make a version). */
  writeVersion(sheetId: string, origin: WriteOrigin): { version: number; createdAt: string } | null {
    return this.canvas.snapshot(sheetId, origin)
  }



  // -------------------------------------------------------------------------
  // Internals: ownership, the source boundary and layout
  // -------------------------------------------------------------------------




  private storeSelection(topicId: string, sheetId: string, now: string) {
    this.db.prepare(`INSERT INTO sheet_selection (topic_id, sheet_id, updated_at) VALUES (?, ?, ?)
      ON CONFLICT (topic_id) DO UPDATE SET sheet_id = excluded.sheet_id, updated_at = excluded.updated_at`).run(topicId, sheetId, now)
  }

  private touchTopic(topicId: string, now: string) {
    this.db.prepare('UPDATE topics SET updated_at = ? WHERE id = ?').run(now, topicId)
  }
}

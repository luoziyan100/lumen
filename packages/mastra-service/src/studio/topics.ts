/**
 * [INPUT]: studio/db 的连接与事务、studio/board 的 insertSheet
 * [OUTPUT]: TopicStore：主题增改与列举、主题引用材料（引用/取消/进度/被引用数）
 * [POS]: 主题是基本单元；新主题同事务建第一张进行中白板。引用清单就是 AI 在该主题的材料边界（R15）
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { randomUUID } from 'node:crypto'
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite'
import { insertSheet } from './board.ts'
import { transaction } from './db.ts'
import { StudioError } from './errors.ts'
import { libraryItem } from './library.ts'
import type { Topic, TopicMaterial } from './types.ts'

function topic(row: Record<string, SQLOutputValue>): Topic {
  return { id: String(row.id), title: String(row.title), archived: row.archived === 1, createdAt: String(row.created_at), updatedAt: String(row.updated_at) }
}

export class TopicStore {
  private readonly db: DatabaseSync

  constructor(db: DatabaseSync) { this.db = db }

  list(archived: boolean | 'all' = false): Topic[] {
    const where = archived === 'all' ? '' : 'WHERE archived = ?'
    return this.db.prepare(`SELECT * FROM topics ${where} ORDER BY updated_at DESC, id`).all(...(archived === 'all' ? [] : [Number(archived)])).map(topic)
  }

  get(id: string): Topic {
    const row = this.db.prepare('SELECT * FROM topics WHERE id = ?').get(id)
    if (!row) throw new StudioError('没有这个主题', 404)
    return topic(row)
  }

  create(title: string): Topic {
    const id = randomUUID(), now = new Date().toISOString()
    transaction(this.db, () => {
      this.db.prepare('INSERT INTO topics VALUES (?, ?, 0, ?, ?)').run(id, title, now, now)
      insertSheet(this.db, id, title, now)
    })
    return this.get(id)
  }

  update(id: string, patch: { title?: string; archived?: boolean }): Topic {
    this.get(id)
    this.db.prepare('UPDATE topics SET title = COALESCE(?, title), archived = COALESCE(?, archived), updated_at = ? WHERE id = ?')
      .run(patch.title ?? null, patch.archived === undefined ? null : Number(patch.archived), new Date().toISOString(), id)
    return this.get(id)
  }

  // -------------------------------------------------------------------------
  // 引用：原件在资料库只有一份，读到哪、被引用几处按主题记
  // -------------------------------------------------------------------------
  materials(topicId: string): TopicMaterial[] {
    this.get(topicId)
    const cited = new Map(this.db.prepare(`SELECT json_extract(j.value, '$.itemId') AS item, COUNT(*) AS n
      FROM blocks b JOIN sheets s ON s.id = b.sheet_id, json_each(b.sources) j
      WHERE s.topic_id = ? AND b.state != 'superseded' AND json_extract(j.value, '$.itemId') IS NOT NULL GROUP BY item`)
      .all(topicId).map(row => [String(row.item), Number(row.n)]))
    return this.db.prepare(`SELECT i.*, m.added_at AS ref_added_at, m.read_progress FROM topic_materials m JOIN library_items i ON i.id = m.item_id
      WHERE m.topic_id = ? ORDER BY m.added_at, i.id`).all(topicId)
      .map(row => ({ ...libraryItem(row), addedAt: String(row.ref_added_at), readProgress: Number(row.read_progress), citedBy: cited.get(String(row.id)) ?? 0 }))
  }

  isReferenced(topicId: string, itemId: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM topic_materials WHERE topic_id = ? AND item_id = ?').get(topicId, itemId)
  }

  reference(topicId: string, itemId: string): boolean {
    this.get(topicId)
    if (!this.db.prepare('SELECT 1 FROM library_items WHERE id = ?').get(itemId)) throw new StudioError('资料库里没有这份材料', 404)
    const now = new Date().toISOString()
    const added = this.db.prepare('INSERT OR IGNORE INTO topic_materials (topic_id, item_id, added_at) VALUES (?, ?, ?)').run(topicId, itemId, now).changes > 0
    if (added) this.db.prepare('UPDATE topics SET updated_at = ? WHERE id = ?').run(now, topicId)
    return added
  }

  /** 取消引用不动区块（R10）：引用它的区块由前端显示「出处已移除」。 */
  unreference(topicId: string, itemId: string): boolean {
    this.get(topicId)
    return this.db.prepare('DELETE FROM topic_materials WHERE topic_id = ? AND item_id = ?').run(topicId, itemId).changes > 0
  }

  setProgress(topicId: string, itemId: string, progress: number): void {
    const value = Math.max(0, Math.min(1, progress))
    this.db.prepare('UPDATE topic_materials SET read_progress = MAX(read_progress, ?) WHERE topic_id = ? AND item_id = ?').run(value, topicId, itemId)
  }
}

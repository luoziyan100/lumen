/**
 * [INPUT]: the catalog.sqlite connection and its synchronous transaction (studio/db)
 * [OUTPUT]: DeletionJournal: the R20 pending-deletion record (mark, look up, list for the start-up resume) and the last step of a deletion —
 *           the catalog rows and the record go in one transaction
 * [POS]: the journal of lifecycle/deletion; TopicStore and the session catalog read it to hide what is being deleted. It is a journal, not a soft delete:
 *        a row lives only while the deletion runs (or until the next start finishes it)
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import type { DatabaseSync } from 'node:sqlite'
import { transaction } from './db.ts'

/** taskId null: the whole topic. */
export interface PendingDeletion { topicId: string; taskId: string | null }

export class DeletionJournal {
  private readonly db: DatabaseSync

  constructor(db: DatabaseSync) { this.db = db }

  /** First step of a deletion; marking twice is harmless (a resumed deletion keeps its record). */
  mark(topicId: string, taskId: string | null = null): void {
    this.db.prepare('INSERT OR IGNORE INTO pending_deletions VALUES (?, ?, ?)').run(topicId, taskId ?? '', new Date().toISOString())
  }

  /** Is this topic (or this conversation, or its whole topic) being deleted? */
  pending(topicId: string, taskId?: string): boolean {
    return !!this.db.prepare(`SELECT 1 FROM pending_deletions WHERE topic_id = ? AND task_id IN ('', ?)`).get(topicId, taskId ?? '')
  }

  /** Oldest first, so a resume finishes them in the order they were asked for. */
  list(): PendingDeletion[] {
    return this.db.prepare('SELECT topic_id, task_id FROM pending_deletions ORDER BY created_at, topic_id, task_id').all()
      .map(row => ({ topicId: String(row.topic_id), taskId: row.task_id === '' ? null : String(row.task_id) }))
  }

  /** Last step of a conversation: its run target and its record. Boards, readings and takeaways it produced stay with the topic (R20). */
  finishSession(topicId: string, taskId: string): void {
    transaction(this.db, () => {
      this.db.prepare('DELETE FROM run_targets WHERE thread_id = ?').run(`${topicId}:${taskId}`)
      this.db.prepare('DELETE FROM pending_deletions WHERE topic_id = ? AND task_id = ?').run(topicId, taskId)
    })
  }

  /** Last step of a topic: the topic row (every studio table cascades from it) and every record of the topic. Library items stay. */
  finishTopic(topicId: string): void {
    transaction(this.db, () => {
      this.db.prepare('DELETE FROM topics WHERE id = ?').run(topicId)
      this.db.prepare('DELETE FROM pending_deletions WHERE topic_id = ?').run(topicId)
    })
  }
}

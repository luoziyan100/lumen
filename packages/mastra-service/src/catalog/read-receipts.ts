/**
 * [INPUT]: Node SQLite、产品目录数据根与原生 thread/message 身份
 * [OUTPUT]: ReadReceipts：每个会话最后确认看过的持久消息 ID；空字符串为显式未读游标
 * [POS]: 产品阅读游标与 projects 共用 catalog.sqlite；不复制消息，不修改框架 thread 元数据或排序时间
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'

export class ReadReceipts {
  private readonly db: DatabaseSync

  constructor(root: string) {
    this.db = new DatabaseSync(join(root, 'catalog.sqlite'))
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS read_receipts (
        thread_id TEXT PRIMARY KEY, message_id TEXT NOT NULL
      ) STRICT`)
  }

  get(threadId: string): string | undefined {
    const row = this.db.prepare('SELECT message_id FROM read_receipts WHERE thread_id = ?').get(threadId)
    return row ? String(row.message_id) : undefined
  }

  set(threadId: string, messageId: string): boolean {
    return this.db.prepare(`INSERT INTO read_receipts VALUES (?, ?)
      ON CONFLICT(thread_id) DO UPDATE SET message_id = excluded.message_id
      WHERE read_receipts.message_id != excluded.message_id`).run(threadId, messageId).changes > 0
  }

  clear(threadId: string): boolean { return this.db.prepare('DELETE FROM read_receipts WHERE thread_id = ?').run(threadId).changes > 0 }

  close(): void { this.db.close() }
}

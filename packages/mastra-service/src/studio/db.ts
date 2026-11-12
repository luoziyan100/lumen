/**
 * [INPUT]: Node SQLite、显式数据根
 * [OUTPUT]: openStudioDb：catalog.sqlite 中主题/资料/引用/白板/区块/版本表；transaction：同步立即事务
 * [POS]: studio 存储的唯一建表处；与 catalog/ 的阅读游标共用文件，不碰 Mastra 的 mastra.sqlite
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// 表结构：plan.md §2。区块的 rev/state/sources 在 P0 就落库，给 P1 锁、P2 出处留路
// ---------------------------------------------------------------------------
const SCHEMA = `
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS library_items (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('file','pdf','web')), title TEXT NOT NULL,
  file TEXT NOT NULL, source_url TEXT, sha256 TEXT NOT NULL UNIQUE, media_type TEXT NOT NULL, size INTEGER NOT NULL,
  added_by TEXT NOT NULL CHECK (added_by IN ('you','ai')), created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS topic_materials (
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL, read_progress REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (topic_id, item_id)
) STRICT;
CREATE TABLE IF NOT EXISTS sheets (
  id TEXT PRIMARY KEY, topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE, title TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('live','folded')), capacity INTEGER NOT NULL DEFAULT 8, ord INTEGER NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (topic_id, ord)
) STRICT;
CREATE TABLE IF NOT EXISTS blocks (
  id TEXT PRIMARY KEY, sheet_id TEXT NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('text','ladder','table','widget')), title TEXT NOT NULL, content TEXT NOT NULL,
  x REAL NOT NULL, y REAL NOT NULL, w REAL NOT NULL, h REAL NOT NULL,
  state TEXT NOT NULL DEFAULT 'current' CHECK (state IN ('current','superseded','settled')),
  superseded_by TEXT, rev INTEGER NOT NULL, sources TEXT NOT NULL DEFAULT '[]',
  thread_id TEXT, run_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS blocks_sheet ON blocks (sheet_id);
CREATE INDEX IF NOT EXISTS blocks_run ON blocks (run_id);
CREATE TABLE IF NOT EXISTS sheet_versions (
  sheet_id TEXT NOT NULL REFERENCES sheets(id) ON DELETE CASCADE, version INTEGER NOT NULL,
  thread_id TEXT, run_id TEXT, snapshot TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (sheet_id, version)
) STRICT;
`

export function openStudioDb(root: string): DatabaseSync {
  const db = new DatabaseSync(join(root, 'catalog.sqlite'))
  try {
    db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;')
    db.exec(SCHEMA)
    return db
  } catch (error) { db.close(); throw error }
}

/** 同步立即事务：容量、rev 检查与写入在同一事务内，失败整体回滚，不留半块（R8）。 */
export function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

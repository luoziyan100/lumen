/**
 * [INPUT]: Node SQLite、显式数据根
 * [OUTPUT]: openStudioDb：catalog.sqlite 中主题/资料/引用/白板/区块/版本表，旧库按需加列（资料的作者/年份/arXiv 编号/标题来源，只在服务启动这条路径上做）；
 *           schema=false 时只打开不建表不加列，表结构不全就拒绝（补取等只填数据的工具用）；schemaGaps；transaction：同步立即事务
 * [POS]: studio 存储的唯一建表处；与 catalog/ 的阅读游标共用文件，不碰 Mastra 的 mastra.sqlite
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
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

// ---------------------------------------------------------------------------
// 加列迁移：旧库缺哪列补哪列（与 diagnostics/notes 同一做法），只加可空列，旧行读出为 null，向前兼容
// ---------------------------------------------------------------------------
const COLUMNS: [table: string, column: string, type: string][] = [
  ['library_items', 'authors', 'TEXT'], ['library_items', 'year', 'INTEGER'], ['library_items', 'arxiv_id', 'TEXT'], ['library_items', 'title_source', 'TEXT'],
]

function migrate(db: DatabaseSync) {
  for (const [table, column, type] of COLUMNS)
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some(row => row.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
}

/** 当前代码需要而库里还没有的列（表不存在时整张表的列都算缺） */
export function schemaGaps(db: DatabaseSync): string[] {
  const needed: [string, string][] = [['library_items', 'id'], ['topic_materials', 'item_id'], ...COLUMNS.map(([table, column]) => [table, column] as [string, string])]
  return needed.filter(([table, column]) => !db.prepare(`PRAGMA table_info(${table})`).all().some(row => row.name === column)).map(([table, column]) => `${table}.${column}`)
}

/** 服务启动：建表并补列（幂等，旧库首次启动即补齐）。schema=false：只打开已由服务建好的库，不改表结构，结构不全就拒绝 */
export function openStudioDb(root: string, options: { schema?: boolean } = {}): DatabaseSync {
  const schema = options.schema ?? true, path = join(root, 'catalog.sqlite')
  if (!schema && !existsSync(path)) throw new Error(`没有 ${path}：先用服务启动一次这个数据根`)
  const db = new DatabaseSync(path)
  try {
    db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;')
    if (schema) { db.exec(SCHEMA); migrate(db) }
    else {
      const gaps = schemaGaps(db)
      if (gaps.length) throw new Error(`catalog.sqlite 还没被含本次迁移的服务打开过（缺 ${gaps.join('、')}）：先让服务用新代码启动一次（启动时自动补列），这里不改表结构`)
    }
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

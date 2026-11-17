/**
 * [INPUT]: Node SQLite, an explicit data root
 * [OUTPUT]: openStudioDb: catalog.sqlite tables for topics/library/references/sheets/blocks/versions, the user's selected sheet (sheet_selection) and each run's write target (run_targets),
 *           the sediment tables (entries/revisions/evidence links/offers/per-sheet invites), the global speech_habits and the readings/reading_sections pair — all additive, no legacy column migrations; older libraries get
 *           missing columns on demand (only on this service-start path)
 *           schema=false only opens, never creates or adds columns, and refuses an incomplete schema (for data-only tools like backfill); schemaGaps; transaction: a synchronous immediate transaction
 * [POS]: the only place studio tables are created; shares the file with catalog/ reading cursors, never touches Mastra's mastra.sqlite
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// Schema: plan.md §2. Block rev/state/sources landed in P0 already, leaving room for P1 locks and P2 sources
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
CREATE TABLE IF NOT EXISTS sheet_selection (
  topic_id TEXT PRIMARY KEY REFERENCES topics(id) ON DELETE CASCADE,
  sheet_id TEXT NOT NULL REFERENCES sheets(id) ON DELETE CASCADE, updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS run_targets (
  thread_id TEXT PRIMARY KEY, topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  sheet_id TEXT REFERENCES sheets(id) ON DELETE CASCADE, created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS sheet_versions (
  sheet_id TEXT NOT NULL REFERENCES sheets(id) ON DELETE CASCADE, version INTEGER NOT NULL,
  thread_id TEXT, run_id TEXT, snapshot TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (sheet_id, version)
) STRICT;
-- P1 sediment (R13): entries hold only the user's own words; links carry no foreign key so they keep their titles after a sheet delete (S3); invites cascade with the sheet
CREATE TABLE IF NOT EXISTS sediment_entries (
  id TEXT PRIMARY KEY, topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  text TEXT NOT NULL, origin TEXT NOT NULL CHECK (origin IN ('typed','quoted')),
  state TEXT NOT NULL DEFAULT 'unverified',
  quote_thread_id TEXT, quote_message_id TEXT, quote_original TEXT, quote_fragments TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS sediment_revisions (
  entry_id TEXT NOT NULL REFERENCES sediment_entries(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL, old_text TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (entry_id, revision)
) STRICT;
CREATE TABLE IF NOT EXISTS sediment_links (
  entry_id TEXT NOT NULL REFERENCES sediment_entries(id) ON DELETE CASCADE,
  block_id TEXT NOT NULL, block_title TEXT NOT NULL, sheet_id TEXT NOT NULL,
  created_at TEXT NOT NULL, PRIMARY KEY (entry_id, block_id)
) STRICT;
CREATE INDEX IF NOT EXISTS sediment_links_block ON sediment_links (block_id);
CREATE TABLE IF NOT EXISTS sediment_offers (
  id TEXT PRIMARY KEY, topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL, message_id TEXT NOT NULL, text TEXT NOT NULL, original TEXT NOT NULL,
  fragments TEXT NOT NULL DEFAULT '[]', block_ids TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS sediment_invites (
  sheet_id TEXT PRIMARY KEY REFERENCES sheets(id) ON DELETE CASCADE,
  block_ids TEXT NOT NULL, question TEXT NOT NULL, thread_id TEXT, run_id TEXT, created_at TEXT NOT NULL
) STRICT;
-- P1-2 readings: one per (topic, library item); sections are ordered and replaced whole, their paragraphs stored as JSON like block content
CREATE TABLE IF NOT EXISTS readings (
  id TEXT PRIMARY KEY, topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (topic_id, item_id)
) STRICT;
CREATE TABLE IF NOT EXISTS reading_sections (
  id TEXT PRIMARY KEY, reading_id TEXT NOT NULL REFERENCES readings(id) ON DELETE CASCADE,
  ord INTEGER NOT NULL, title TEXT NOT NULL, paragraphs TEXT NOT NULL,
  thread_id TEXT, run_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (reading_id, ord)
) STRICT;
-- S14 speech habits: one global table, counted only by the user's keep action (kept = deletion left standing, restored = fragment restored); the AI only reads it
CREATE TABLE IF NOT EXISTS speech_habits (
  fragment TEXT PRIMARY KEY, kept INTEGER NOT NULL DEFAULT 0, restored INTEGER NOT NULL DEFAULT 0, last_seen TEXT NOT NULL
) STRICT;
`

// ---------------------------------------------------------------------------
// Column migration: add whichever column an older library lacks (same approach as diagnostics/notes); only nullable columns, old rows read as null, forward compatible
// ---------------------------------------------------------------------------
const COLUMNS: [table: string, column: string, type: string][] = [
  ['library_items', 'authors', 'TEXT'], ['library_items', 'year', 'INTEGER'], ['library_items', 'arxiv_id', 'TEXT'], ['library_items', 'title_source', 'TEXT'],
]

function migrate(db: DatabaseSync) {
  for (const [table, column, type] of COLUMNS)
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some(row => row.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
}

/** Columns the current code needs that the library still lacks (a missing table counts as all its columns missing). */
export function schemaGaps(db: DatabaseSync): string[] {
  const needed: [string, string][] = [['library_items', 'id'], ['topic_materials', 'item_id'], ...COLUMNS.map(([table, column]) => [table, column] as [string, string])]
  return needed.filter(([table, column]) => !db.prepare(`PRAGMA table_info(${table})`).all().some(row => row.name === column)).map(([table, column]) => `${table}.${column}`)
}

/** Service start: create tables and add missing columns (idempotent; an older library is completed on first start). schema=false: only open a library the service has already built, never change the schema, refuse when incomplete */
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

/** A synchronous immediate transaction: capacity and rev checks share the transaction with the writes, a failure rolls back everything and leaves no half block (R8). */
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

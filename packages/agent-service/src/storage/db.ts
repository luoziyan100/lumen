/**
 * [INPUT]: better-sqlite3
 * [OUTPUT]: openDatabase / DB —— 打开 SQLite 并跑增量 migration
 * [POS]: §存储层根。表结构搬自 old_lumen migration v7（tasks/task_events），只增不改
 */
import Database from 'better-sqlite3'

export type DB = Database.Database

const SCHEMA_VERSION = 2

export function openDatabase(filename: string): DB {
  const db = new Database(filename)
  db.pragma('journal_mode = WAL')
  migrate(db)
  return db
}

function migrate(db: DB): void {
  const current = db.pragma('user_version', { simple: true }) as number

  if (current < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id          TEXT PRIMARY KEY,
        project_id  TEXT NOT NULL,
        goal        TEXT NOT NULL,
        status      TEXT NOT NULL,
        last_error  TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        finished_at TEXT
      );
      CREATE TABLE IF NOT EXISTS task_events (
        id           TEXT PRIMARY KEY,
        task_id      TEXT NOT NULL,
        seq          INTEGER NOT NULL,
        kind         TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        UNIQUE(task_id, seq)
      );
      CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id, seq);
      CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
    `)
  }

  if (current < 2) {
    // Evidence Index：工作区产物之上的结构化索引（去重 / 范围查询 / 跨任务记忆）
    db.exec(`
      CREATE TABLE IF NOT EXISTS evidence (
        id         TEXT PRIMARY KEY,
        task_id    TEXT NOT NULL,
        kind       TEXT NOT NULL,
        title      TEXT NOT NULL,
        authors    TEXT,
        doi        TEXT,
        arxiv      TEXT,
        venue      TEXT,
        year       INTEGER,
        dedup_key  TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_evidence_task ON evidence(task_id);
      CREATE INDEX IF NOT EXISTS idx_evidence_venue ON evidence(venue);
    `)
  }

  // 后续 migration：if (current < 3) { ... } 然后更新 SCHEMA_VERSION
  db.pragma(`user_version = ${SCHEMA_VERSION}`)
}

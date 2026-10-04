/**
 * [INPUT]: Node SQLite、应用隔离数据根、目录 DTO
 * [OUTPUT]: ProjectStore：项目持久化、原子字段更新与内部历史时间恢复
 * [POS]: 项目领域存储；时间恢复仅供离线导入，HTTP 创建/更新不接受历史时间
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite'
import { join } from 'node:path'
import type { CatalogQuery, Page, Project, ProjectPatch } from './types.ts'

function project(row: Record<string, SQLOutputValue>): Project {
  return { id: String(row.id), name: String(row.name), archived: row.archived === 1,
    createdAt: String(row.created_at), updatedAt: String(row.updated_at) }
}

export class ProjectStore {
  private readonly db: DatabaseSync

  constructor(root: string) {
    this.db = new DatabaseSync(join(root, 'catalog.sqlite'))
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      ) STRICT`)
    const now = new Date().toISOString()
    this.db.prepare('INSERT OR IGNORE INTO projects VALUES (?, ?, 0, ?, ?)').run('default', '默认项目', now, now)
  }

  get(id: string): Project | undefined {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
    return row ? project(row) : undefined
  }

  list(query: CatalogQuery): Page<Project> {
    const where = query.archived === 'all' ? '' : 'WHERE archived = ?'
    const filter = query.archived === 'all' ? [] : [Number(query.archived)]
    const total = Number(this.db.prepare(`SELECT COUNT(*) AS total FROM projects ${where}`).get(...filter)!.total)
    const rows = this.db.prepare(`SELECT * FROM projects ${where} ORDER BY updated_at DESC, id ASC LIMIT ? OFFSET ?`)
      .all(...filter, query.perPage, query.page * query.perPage)
    return { items: rows.map(project), page: query.page, perPage: query.perPage, total,
      hasMore: (query.page + 1) * query.perPage < total }
  }

  create(id: string, name: string): Project {
    const now = new Date().toISOString()
    this.db.prepare('INSERT INTO projects VALUES (?, ?, 0, ?, ?)').run(id, name, now, now)
    return this.get(id)!
  }

  update(id: string, patch: ProjectPatch): Project {
    this.db.prepare('UPDATE projects SET name = COALESCE(?, name), archived = COALESCE(?, archived), updated_at = ? WHERE id = ?')
      .run(patch.name ?? null, patch.archived === undefined ? null : Number(patch.archived), new Date().toISOString(), id)
    return this.get(id)!
  }

  restoreTimestamps(id: string, timestamps: Pick<Project, 'createdAt' | 'updatedAt'>): Project {
    if (!this.get(id)) throw new Error('Cannot restore timestamps for an unknown project')
    if ([timestamps.createdAt, timestamps.updatedAt].some(value => typeof value !== 'string' || !Number.isFinite(Date.parse(value))))
      throw new Error('Historical project timestamps must be valid dates')
    this.db.prepare('UPDATE projects SET created_at = ?, updated_at = ? WHERE id = ?')
      .run(timestamps.createdAt, timestamps.updatedAt, id)
    return this.get(id)!
  }

  delete(id: string): void { this.db.prepare('DELETE FROM projects WHERE id = ?').run(id) }
  close(): void { this.db.close() }
}

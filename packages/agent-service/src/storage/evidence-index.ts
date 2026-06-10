/**
 * [INPUT]: db.ts 的 DB、node:crypto
 * [OUTPUT]: EvidenceIndex —— 工作区产物之上的结构化索引（去重 / 范围查询）
 * [POS]: §5.7 Evidence Index。不是挡在正文前的摘要过滤器，而是 SQLite 侧的去重与查询层
 *
 * 去重 key：DOI > arXiv > sha256(title+首作者)。修了 old_lumen "title+首作者直接拼"的碰撞问题。
 */
import { createHash } from 'node:crypto'
import type { DB } from './db.ts'

export interface EvidenceInput {
  taskId: string
  kind?: string
  title: string
  authors?: string[]
  doi?: string
  arxiv?: string
  venue?: string
  year?: number
}

export interface EvidenceRecord {
  id: string
  task_id: string
  kind: string
  title: string
  authors: string | null
  doi: string | null
  arxiv: string | null
  venue: string | null
  year: number | null
  dedup_key: string
  created_at: string
}

export interface EvidenceQuery {
  taskId?: string
  venue?: string
  yearFrom?: number
}

function normalize(s: string): string {
  return s.trim().toLowerCase()
}

export function dedupKey(input: EvidenceInput): string {
  if (input.doi) return `doi:${normalize(input.doi)}`
  if (input.arxiv) return `arxiv:${normalize(input.arxiv)}`
  const basis = `${normalize(input.title)}|${normalize(input.authors?.[0] ?? '')}`
  return `title:${createHash('sha256').update(basis).digest('hex').slice(0, 24)}`
}

export class EvidenceIndex {
  private readonly db: DB
  private readonly insert: ReturnType<DB['prepare']>
  private readonly getByKey: ReturnType<DB['prepare']>

  constructor(db: DB) {
    this.db = db
    this.insert = db.prepare(
      `INSERT OR IGNORE INTO evidence (id, task_id, kind, title, authors, doi, arxiv, venue, year, dedup_key, created_at)
       VALUES (@id,@task_id,@kind,@title,@authors,@doi,@arxiv,@venue,@year,@dedup_key,@created_at)`,
    )
    this.getByKey = db.prepare('SELECT * FROM evidence WHERE dedup_key = ?')
  }

  /** 按 dedup_key upsert；已存在则返回原记录（不重复入库） */
  add(input: EvidenceInput): EvidenceRecord {
    const key = dedupKey(input)
    const record: EvidenceRecord = {
      id: `ev-${globalThis.crypto.randomUUID()}`,
      task_id: input.taskId,
      kind: input.kind ?? 'paper',
      title: input.title,
      authors: input.authors?.length ? JSON.stringify(input.authors) : null,
      doi: input.doi ?? null,
      arxiv: input.arxiv ?? null,
      venue: input.venue ?? null,
      year: input.year ?? null,
      dedup_key: key,
      created_at: new Date().toISOString(),
    }
    this.insert.run(record)
    return this.getByKey.get(key) as EvidenceRecord
  }

  query(q: EvidenceQuery = {}): EvidenceRecord[] {
    const where: string[] = []
    const params: unknown[] = []
    if (q.taskId) {
      where.push('task_id = ?')
      params.push(q.taskId)
    }
    if (q.venue) {
      where.push('venue = ?')
      params.push(q.venue)
    }
    if (q.yearFrom != null) {
      where.push('year >= ?')
      params.push(q.yearFrom)
    }
    const sql = `SELECT * FROM evidence ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`
    return this.db.prepare(sql).all(...params) as EvidenceRecord[]
  }
}

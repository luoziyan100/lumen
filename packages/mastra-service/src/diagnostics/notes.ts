/**
 * [INPUT]: 隔离数据根、已授权 resourceId 和经过校验/脱敏的用户评语
 * [OUTPUT]: CaseStore：按会话限定的问题标注与最近隔离评估结果
 * [POS]: 人的观察及派生评估结果；不保存运行状态、不改原生 trace；编辑使旧评估失效
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { randomUUID } from 'node:crypto'
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite'
import { chmodSync } from 'node:fs'
import { join } from 'node:path'
import { DiagnosticsError, type BadCase, type MarkCaseInput, type UpdateCaseInput, type EvaluationResult } from './types.ts'

function decode(row: Record<string, SQLOutputValue>): BadCase {
  return { id: String(row.id), resourceId: String(row.resource_id), traceId: row.trace_id === null ? null : String(row.trace_id), spanId: row.span_id === null ? null : String(row.span_id),
    kind: String(row.kind) as BadCase['kind'], actual: String(row.actual), expected: String(row.expected), note: String(row.note), createdAt: String(row.created_at), updatedAt: String(row.updated_at), redacted: Boolean(row.redacted),
    ...(typeof row.last_evaluation === 'string' ? { lastEvaluation: JSON.parse(row.last_evaluation) as EvaluationResult } : {}) }
}
export class CaseStore {
  private readonly db: DatabaseSync
  constructor(root: string) {
    const path = join(root, 'diagnostics.sqlite')
    this.db = new DatabaseSync(path); chmodSync(path, 0o600)
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS diagnostic_cases (id TEXT PRIMARY KEY, resource_id TEXT NOT NULL, trace_id TEXT, span_id TEXT,
        kind TEXT NOT NULL, actual TEXT NOT NULL, expected TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, redacted INTEGER NOT NULL) STRICT;
      CREATE INDEX IF NOT EXISTS diagnostic_cases_resource ON diagnostic_cases(resource_id, created_at)`)
    if (!this.db.prepare('PRAGMA table_info(diagnostic_cases)').all().some(row => row.name === 'last_evaluation')) this.db.exec('ALTER TABLE diagnostic_cases ADD COLUMN last_evaluation TEXT')
  }
  get(resourceId: string, id: string): BadCase {
    const row = this.db.prepare('SELECT * FROM diagnostic_cases WHERE resource_id = ? AND id = ?').get(resourceId, id)
    if (!row) throw new DiagnosticsError('问题标注不存在', 404)
    return decode(row)
  }
  list(resourceId: string, page: number, perPage: number) {
    const total = Number(this.db.prepare('SELECT COUNT(*) AS total FROM diagnostic_cases WHERE resource_id = ?').get(resourceId)!.total)
    const items = this.db.prepare('SELECT * FROM diagnostic_cases WHERE resource_id = ? ORDER BY created_at DESC, id ASC LIMIT ? OFFSET ?').all(resourceId, perPage, page * perPage).map(decode)
    return { items, total, page, perPage, hasMore: (page + 1) * perPage < total }
  }
  mark(resourceId: string, input: MarkCaseInput, redacted: boolean): BadCase {
    const id = randomUUID(), now = new Date().toISOString()
    this.db.prepare('INSERT INTO diagnostic_cases (id, resource_id, trace_id, span_id, kind, actual, expected, note, created_at, updated_at, redacted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, resourceId, input.traceId ?? null, input.spanId ?? null, input.kind ?? 'answer_quality', input.actual, input.expected, input.note ?? '', now, now, Number(redacted))
    return this.get(resourceId, id)
  }
  update(resourceId: string, id: string, input: UpdateCaseInput, redacted: boolean): BadCase {
    const prior = this.get(resourceId, id), changedAt = new Date(Math.max(Date.now(), Date.parse(prior.updatedAt) + 1)).toISOString()
    this.db.prepare('UPDATE diagnostic_cases SET kind = COALESCE(?, kind), actual = COALESCE(?, actual), expected = COALESCE(?, expected), note = COALESCE(?, note), updated_at = ?, redacted = MAX(redacted, ?), last_evaluation = NULL WHERE resource_id = ? AND id = ?')
      .run(input.kind ?? null, input.actual ?? null, input.expected ?? null, input.note ?? null, changedAt, Number(redacted), resourceId, id)
    return this.get(resourceId, id)
  }
  saveEvaluation(item: BadCase, evaluation: EvaluationResult) {
    const result = this.db.prepare('UPDATE diagnostic_cases SET last_evaluation = ? WHERE resource_id = ? AND id = ? AND updated_at = ?')
      .run(JSON.stringify(evaluation), item.resourceId, item.id, item.updatedAt)
    if (result.changes !== 1) throw new DiagnosticsError('问题标注已编辑，请按新内容重新评估', 409)
  }
  close() { this.db.close() }
}

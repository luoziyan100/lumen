/**
 * [INPUT]: 当前目录授权、迁移 source task 映射、临时旧库查询与当前凭证脱敏
 * [OUTPUT]: createLegacyDiagnostics；历史执行记录分页和单条正文
 * [POS]: 原始证据的只读解码器，不引入旧服务、不创建新执行或消息真源
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from 'node:crypto'
import type { SQLOutputValue } from 'node:sqlite'
import { z } from 'zod'
import { DiagnosticsError } from '../../diagnostics/types.ts'
import { redactPayload } from '../../diagnostics/redact.ts'
import { archiveBytes, openArchive, withArchiveDatabase, type Archive } from './archive.ts'
import type { LegacyIntegrity, LegacyRecord, LegacyRecordDetail, LegacyRecordPage } from './types.ts'

type Row = Record<string, SQLOutputValue>
const query = z.object({ page: z.number().int().min(0).max(100000).default(0), perPage: z.number().int().min(1).max(100).default(30) })
const identity = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/)
const recordId = z.string().min(1).max(256)
const MAX_BLOB = 2 * 1024 * 1024
const nullable = (value: SQLOutputValue | undefined) => value === null || value === undefined ? null : String(value)
const parse = (text: string): unknown => { try { return JSON.parse(text) } catch { return text } }

interface Options {
  dataRoot: string
  authorize: (projectId: string, taskId: string) => Promise<unknown>
  secrets?: () => readonly string[]
}

async function content(archive: Archive, row: Row): Promise<{ integrity: LegacyIntegrity; value: unknown | null }> {
  const sha = nullable(row.content_sha256)
  if (!sha) return { integrity: row.content_status === 'not_collected' ? 'not_collected' : 'missing', value: null }
  if (!/^[a-f0-9]{64}$/.test(sha)) return { integrity: 'hash_mismatch', value: null }
  const relativeBlob = `exec-evidence/${sha.slice(0, 2)}/${sha}`
  const manifestBlob = archive.manifest.files.find(item => item.path === relativeBlob && item.kind === 'file')
  if (!manifestBlob) return { integrity: 'missing', value: null }
  if (manifestBlob.size > MAX_BLOB) return { integrity: 'too_large', value: null }
  try {
    const bytes = await archiveBytes(archive.root, `source/${relativeBlob}`, MAX_BLOB)
    if (bytes.length !== manifestBlob.size || createHash('sha256').update(bytes).digest('hex') !== manifestBlob.sha256 || createHash('sha256').update(bytes).digest('hex') !== sha) return { integrity: 'hash_mismatch', value: null }
    return { integrity: 'verified', value: parse(bytes.toString('utf8')) }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { integrity: 'missing', value: null }
    return { integrity: error instanceof DiagnosticsError && error.status === 413 ? 'too_large' : 'unavailable', value: null }
  }
}

export function createLegacyDiagnostics(options: Options) {
  const secrets = options.secrets ?? (() => [])
  async function scope(projectId: string, taskId: string) {
    if (!identity.safeParse(projectId).success || !identity.safeParse(taskId).success) throw new DiagnosticsError('会话身份无效', 400)
    await options.authorize(projectId, taskId)
    const archive = await openArchive(options.dataRoot)
    if (!archive) return null
    const matches = archive.manifest.sessions.filter(item => item.projectId === projectId && item.taskId === taskId && item.threadId === `${projectId}:${taskId}`)
    if (matches.length > 1) throw new DiagnosticsError('旧会话映射有歧义', 503)
    return matches[0] ? { archive, sourceTaskId: matches[0].sourceId, sourceProjectId: matches[0].sourceProjectId } : null
  }
  async function decode(archive: Archive, row: Row, withContent: boolean): Promise<LegacyRecordDetail> {
    const blob = await content(archive, row)
    const clean = redactPayload({ id: row.id, createdAt: row.created_at, kind: row.kind, sourceTaskId: row.task_id, agentId: nullable(row.agent_id),
      turnId: nullable(row.turn_id), operationId: nullable(row.operation_id), contentStatus: row.content_status, contentSha256: nullable(row.content_sha256),
      meta: parse(String(row.meta_json ?? '{}')), ...(withContent ? { content: blob.value } : {}) }, secrets())
    const safe = clean.value && typeof clean.value === 'object' ? clean.value as Record<string, unknown> : {}
    const record = { ...safe, integrity: blob.integrity, redacted: clean.redacted, truncated: clean.truncated } as unknown as LegacyRecord
    delete (record as unknown as Record<string, unknown>).content
    return { source: 'legacy-v1', readOnly: true, record, content: withContent ? safe.content ?? null : null }
  }
  function checkedSource(db: import('node:sqlite').DatabaseSync, sourceTaskId: string, sourceProjectId: string) {
    const task = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(sourceTaskId)
    if (!task || task.project_id !== sourceProjectId) throw new DiagnosticsError('旧会话映射校验失败', 503)
    return !!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'exec_records'").get()
  }
  return {
    async list(projectId: string, taskId: string, input: { page?: number; perPage?: number } = {}): Promise<LegacyRecordPage> {
      const parsed = query.safeParse(input)
      if (!parsed.success) throw new DiagnosticsError('分页无效', 400)
      const page = parsed.data, selected = await scope(projectId, taskId)
      const base = { source: 'legacy-v1' as const, readOnly: true as const, ...page }
      if (!selected) return { ...base, available: false, reason: '本会话没有导入的旧执行证据档案', items: [], total: 0, hasMore: false }
      const { archive, sourceTaskId, sourceProjectId } = selected
      const result = await withArchiveDatabase(archive, db => {
        if (!checkedSource(db, sourceTaskId, sourceProjectId)) return { rows: [], total: 0 }
        return { total: Number(db.prepare('SELECT COUNT(*) AS total FROM exec_records WHERE task_id = ?').get(sourceTaskId)!.total),
          rows: db.prepare('SELECT * FROM exec_records WHERE task_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?').all(sourceTaskId, page.perPage, page.page * page.perPage) }
      })
      const items: LegacyRecord[] = []
      for (const row of result.rows) items.push((await decode(archive, row, false)).record)
      return { ...base, available: true, items, total: result.total, hasMore: (page.page + 1) * page.perPage < result.total }
    },
    async read(projectId: string, taskId: string, id: string): Promise<LegacyRecordDetail> {
      if (!recordId.safeParse(id).success) throw new DiagnosticsError('旧证据身份无效', 400)
      const selected = await scope(projectId, taskId)
      if (!selected) throw new DiagnosticsError('旧证据不存在', 404)
      const { archive, sourceTaskId, sourceProjectId } = selected
      const row = await withArchiveDatabase(archive, db => checkedSource(db, sourceTaskId, sourceProjectId)
        ? db.prepare('SELECT * FROM exec_records WHERE task_id = ? AND id = ?').get(sourceTaskId, id) : undefined)
      if (!row) throw new DiagnosticsError('旧证据不存在', 404)
      return decode(archive, row, true)
    },
  }
}

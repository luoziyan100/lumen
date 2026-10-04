/**
 * [INPUT]: 临时 legacy-v1 archive、SQLite/WAL/SHM 与 exec-evidence blob
 * [OUTPUT]: 旧证据只读分页、归属隔离、哈希完整性和当前凭证脱敏回归
 * [POS]: 历史诊断浏览行为证据；不导入旧运行时，不调用模型/工具，不改源文件
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLegacyDiagnostics } from '../src/migration/legacy-diagnostics/reader.ts'
import { DiagnosticsError } from '../src/diagnostics/index.ts'

const digest = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex')

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'lumen-legacy-diagnostic-'))
  const archive = join(root, 'archive', 'legacy-v1'), source = join(archive, 'source')
  await mkdir(join(source, 'exec-evidence', 'ab'), { recursive: true })
  const dbPath = join(source, 'lumen.sqlite')
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE projects (id TEXT PRIMARY KEY); CREATE TABLE tasks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL); CREATE TABLE exec_records (id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL, created_at TEXT NOT NULL, task_id TEXT NOT NULL, agent_id TEXT, turn_id TEXT, operation_id TEXT, parent_operation_id TEXT, purpose TEXT, attempt INTEGER, kind TEXT NOT NULL, content_status TEXT NOT NULL, content_sha256 TEXT, meta_json TEXT NOT NULL);')
  db.prepare('INSERT INTO projects VALUES (?)').run('legacy-project')
  db.prepare('INSERT INTO tasks VALUES (?, ?)').run('legacy-task', 'legacy-project')
  const secret = 'legacy-diagnostic-secret-792421', content = Buffer.from(JSON.stringify({ authorization: `Bearer ${secret}`, answer: 'historical answer' }))
  const blobHash = digest(content), blobPath = join(source, 'exec-evidence', blobHash.slice(0, 2), blobHash)
  await mkdir(join(source, 'exec-evidence', blobHash.slice(0, 2)), { recursive: true }); await writeFile(blobPath, content, { mode: 0o600 })
  const mismatchHash = 'cd'.repeat(32), mismatchBytes = Buffer.from('tampered'), mismatchPath = join(source, 'exec-evidence', 'cd', mismatchHash)
  await mkdir(join(source, 'exec-evidence', 'cd'), { recursive: true }); await writeFile(mismatchPath, mismatchBytes, { mode: 0o600 })
  const add = db.prepare('INSERT INTO exec_records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
  add.run('verified', 1, '2026-09-19T00:00:00.000Z', 'legacy-task', 'agent', 'turn', 'op', null, 'chat', 1, 'model_response', 'complete', blobHash, JSON.stringify({ provider: 'legacy', authorization: secret }))
  add.run('missing', 1, '2026-09-19T00:00:01.000Z', 'legacy-task', null, null, null, null, 'chat', null, 'tool_result', 'complete', 'ef'.repeat(32), '{}')
  add.run('mismatch', 1, '2026-09-19T00:00:02.000Z', 'legacy-task', null, null, null, null, 'chat', null, 'model_response', 'complete', mismatchHash, '{}')
  add.run('not-collected', 1, '2026-09-19T00:00:03.000Z', 'legacy-task', null, null, null, null, 'chat', null, 'context', 'not_collected', null, '{}')
  db.prepare('INSERT INTO exec_records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('other-task', 1, '2026-09-19T00:00:03.000Z', 'other-task', null, null, null, null, 'chat', null, 'model_response', 'complete', blobHash, '{}')
  const fileEntries = []
  for (const name of ['lumen.sqlite', 'lumen.sqlite-wal', 'lumen.sqlite-shm']) {
    try { const bytes = await readFile(join(source, name)); fileEntries.push({ path: name, kind: 'file', size: bytes.length, sha256: digest(bytes) }) } catch { /* SQLite may checkpoint a sidecar. */ }
  }
  fileEntries.push({ path: `exec-evidence/${blobHash.slice(0, 2)}/${blobHash}`, kind: 'file', size: content.length, sha256: blobHash })
  fileEntries.push({ path: `exec-evidence/cd/${mismatchHash}`, kind: 'file', size: mismatchBytes.length, sha256: digest(mismatchBytes) })
  await writeFile(join(archive, 'manifest.json'), JSON.stringify({ version: 1, ready: true, dryRun: false, sourceFingerprint: 'legacy-fixture', sessions: [{ sourceId: 'legacy-task', sourceProjectId: 'legacy-project', projectId: 'project', taskId: 'task', threadId: 'project:task' }], files: fileEntries }))
  const before = new Map<string, string>()
  for (const name of ['lumen.sqlite', 'lumen.sqlite-wal', 'lumen.sqlite-shm']) { try { before.set(name, digest(await readFile(join(source, name)))) } catch {} }
  const reader = createLegacyDiagnostics({ dataRoot: root, secrets: () => [secret], authorize: async (projectId, taskId) => { if (projectId !== 'project' || !['task', 'unmapped'].includes(taskId)) throw new DiagnosticsError('session missing', 404) } })
  return { root, source, db, reader, before, secret }
}

test('legacy exec_records 只读浏览核对 WAL/SHM 与 blob 哈希，返回脱敏正文并隔离当前会话', { timeout: 30000 }, async () => {
  const env = await fixture()
  try {
    const page = await env.reader.list('project', 'task', { page: 0, perPage: 10 })
    assert.equal(page.source, 'legacy-v1'); assert.equal(page.readOnly, true); assert.equal(page.available, true); assert.equal(page.total, 4)
    const verified = page.items.find(item => item.id === 'verified')!
    assert.equal(verified.integrity, 'verified'); assert.equal(verified.redacted, true)
    const detail = await env.reader.read('project', 'task', 'verified')
    assert.equal(detail.record.integrity, 'verified'); assert.equal((detail.content as { authorization: string }).authorization, '[REDACTED]')
    assert.equal(JSON.stringify(detail).includes(env.secret), false)
    assert.equal((await env.reader.read('project', 'task', 'missing')).record.integrity, 'missing')
    assert.equal((await env.reader.read('project', 'task', 'mismatch')).record.integrity, 'hash_mismatch')
    assert.equal((await env.reader.read('project', 'task', 'not-collected')).record.integrity, 'not_collected')
    const noArchive = await env.reader.list('project', 'unmapped')
    assert.equal(noArchive.available, false); assert.equal(noArchive.items.length, 0)
    await assert.rejects(env.reader.read('project', 'task', 'other-task'), { status: 404 })
  } finally {
    for (const name of ['lumen.sqlite', 'lumen.sqlite-wal', 'lumen.sqlite-shm']) { try { assert.equal(digest(await readFile(join(env.source, name))), env.before.get(name)) } catch (error) { if (env.before.has(name)) throw error } }
    env.db.close()
    await rm(env.root, { recursive: true, force: true })
  }
})

test('legacy blob 内容篡改显式返回 hash_mismatch，不回退为正文', { timeout: 30000 }, async () => {
  const env = await fixture()
  try {
    const detail = await env.reader.read('project', 'task', 'mismatch')
    assert.equal(detail.record.integrity, 'hash_mismatch')
    assert.equal(detail.content, null)
  } finally { env.db.close(); await rm(env.root, { recursive: true, force: true }) }
})

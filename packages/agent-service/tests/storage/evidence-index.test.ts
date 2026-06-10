import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { openDatabase } from '../../src/storage/db.ts'
import { EvidenceIndex, dedupKey } from '../../src/storage/evidence-index.ts'

async function makeIndex(t: TestContext): Promise<EvidenceIndex> {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-ev-'))
  const db = openDatabase(path.join(base, 'lumen.sqlite'))
  t.after(() => {
    db.close()
    return rm(base, { recursive: true, force: true })
  })
  return new EvidenceIndex(db)
}

test('dedupKey：DOI 优先，其次 arXiv，最后 title+首作者哈希', () => {
  assert.match(dedupKey({ taskId: 't', title: 'X', doi: '10.1/A' }), /^doi:10\.1\/a$/)
  assert.match(dedupKey({ taskId: 't', title: 'X', arxiv: '2601.1' }), /^arxiv:2601\.1$/)
  assert.match(dedupKey({ taskId: 't', title: 'Same Title', authors: ['A'] }), /^title:[0-9a-f]{24}$/)
  // 不同首作者 → 不同 key（修了 old_lumen 碰撞）
  const k1 = dedupKey({ taskId: 't', title: 'Same Title', authors: ['A'] })
  const k2 = dedupKey({ taskId: 't', title: 'Same Title', authors: ['B'] })
  assert.notEqual(k1, k2)
})

test('add 按 DOI 去重，同一 DOI 多次只一条', async (t) => {
  const idx = await makeIndex(t)
  idx.add({ taskId: 't1', title: 'A study', doi: '10.1038/x', venue: 'Nature', year: 2026 })
  idx.add({ taskId: 't1', title: 'A study (dup)', doi: '10.1038/X', venue: 'Nature', year: 2026 })
  const rows = idx.query({ taskId: 't1' })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].doi, '10.1038/x')
})

test('query 按 venue / yearFrom 过滤', async (t) => {
  const idx = await makeIndex(t)
  idx.add({ taskId: 't', title: 'N', doi: 'd1', venue: 'Nature', year: 2026 })
  idx.add({ taskId: 't', title: 'S', doi: 'd2', venue: 'Science', year: 2024 })
  assert.equal(idx.query({ venue: 'Nature' }).length, 1)
  assert.equal(idx.query({ yearFrom: 2025 }).length, 1)
  assert.equal(idx.query({}).length, 2)
})

/**
 * [INPUT]: 依赖 doc/testing-matrix.md 的 test_ids/evidence 列,依赖 doc/testing-manifest.json 的绑定条目,依赖 git log 钉文件锚点
 * [OUTPUT]: 写出 doc/testing-historical-ids.json(历史 unbound ID → 文件 + 40 位 commit)
 * [POS]: scripts/ 的历史索引生成器;与 check-testing-matrix.mjs 成对,不改业务代码
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 *
 * 从矩阵抽出全部 test_id,解析 evidence 别名到仓库文件,并钉该文件最近一次 commit。
 * 绑定 manifest 条目不进入本索引。历史 ID 禁止 covered。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const matrixPath = path.join(root, 'doc/testing-matrix.md')
const outPath = path.join(root, 'doc/testing-historical-ids.json')

const ID_RE = /\b(?:AT|CT|RP|IT|UT)-[A-Z0-9]+-\d+\b/g

const ALIAS = [
  ['governance-batch1', 'packages/agent-service/tests/service/governance-batch1.test.ts'],
  ['batch1', 'packages/agent-service/tests/service/governance-batch1.test.ts'],
  ['governance-batch2', 'packages/agent-service/tests/service/governance-batch2.test.ts'],
  ['batch2', 'packages/agent-service/tests/service/governance-batch2.test.ts'],
  ['governance-batch3', 'packages/agent-service/tests/service/governance-batch3.test.ts'],
  ['batch3', 'packages/agent-service/tests/service/governance-batch3.test.ts'],
  ['governance-rework', 'packages/agent-service/tests/service/governance-rework.test.ts'],
  ['rework', 'packages/agent-service/tests/service/governance-rework.test.ts'],
  ['governance-round1', 'packages/agent-service/tests/service/governance-round1.test.ts'],
  ['round1', 'packages/agent-service/tests/service/governance-round1.test.ts'],
  ['governance-round2', 'packages/agent-service/tests/service/governance-round2.test.ts'],
  ['round2', 'packages/agent-service/tests/service/governance-round2.test.ts'],
  ['governance-round4', 'packages/agent-service/tests/service/governance-round4.test.ts'],
  ['round4', 'packages/agent-service/tests/service/governance-round4.test.ts'],
  ['governance-round5', 'packages/agent-service/tests/service/governance-round5.test.ts'],
  ['round5', 'packages/agent-service/tests/service/governance-round5.test.ts'],
  ['governance-round6', 'packages/agent-service/tests/service/governance-round6.test.ts'],
  ['round6', 'packages/agent-service/tests/service/governance-round6.test.ts'],
  ['governance-round10', 'packages/agent-service/tests/service/governance-round10.test.ts'],
  ['round10', 'packages/agent-service/tests/service/governance-round10.test.ts'],
  ['governance-round11', 'packages/agent-service/tests/service/governance-round11.test.ts'],
  ['round11', 'packages/agent-service/tests/service/governance-round11.test.ts'],
  ['governance-round12', 'packages/agent-service/tests/service/governance-round12.test.ts'],
  ['round12', 'packages/agent-service/tests/service/governance-round12.test.ts'],
  ['governance-round13', 'packages/agent-service/tests/service/governance-round13.test.ts'],
  ['round13', 'packages/agent-service/tests/service/governance-round13.test.ts'],
  ['round14-a', 'packages/agent-service/tests/service/governance-round14-a.test.ts'],
  ['round14-b', 'packages/ui-client/tests/governance-round14-b.test.ts'],
  ['round14-c', 'packages/agent-service/tests/subagent/governance-round14-c.test.ts'],
  ['round14-conn', 'packages/agent-service/tests/client/governance-round14-conn.test.ts'],
  ['round14-d', 'packages/agent-service/tests/service/governance-round14-d.test.ts'],
  ['round15', 'packages/agent-service/tests/service/governance-round15.test.ts'],
  ['f10-idle-seal', 'packages/agent-service/tests/service/governance-f10-idle-seal.test.ts'],
  ['governance-f16', 'packages/agent-service/tests/service/governance-f16.test.ts'],
  ['`f16`', 'packages/agent-service/tests/service/governance-f16.test.ts'],
  ['f17-f21', 'packages/agent-service/tests/service/governance-f17-f21.test.ts'],
  ['f22-f24', 'packages/agent-service/tests/service/governance-f22-f24.test.ts'],
  ['v2r-collection', 'packages/agent-service/tests/service/governance-v2r-collection.test.ts'],
  ['v2r-integrity', 'packages/agent-service/tests/service/governance-v2r-integrity.test.ts'],
  ['v2r-paths', 'packages/agent-service/tests/service/governance-v2r-paths.test.ts'],
  ['v2r-replay', 'packages/agent-service/tests/service/governance-v2r-replay.test.ts'],
  ['service-boot', 'packages/agent-service/tests/service/service-boot.test.ts'],
  ['launchd', 'packages/agent-service/tests/service/launchd.test.ts'],
  ['t6-resume', 'packages/agent-service/tests/subagent/t6-resume.test.ts'],
  ['resume.test', 'packages/agent-service/tests/storage/resume.test.ts'],
  ['`resume`', 'packages/agent-service/tests/storage/resume.test.ts'],
  ['run-code', 'packages/agent-service/tests/workspace/run-code.test.ts'],
  ['governance-projection', 'packages/ui-client/tests/governance-projection.test.ts'],
  ['projection', 'packages/ui-client/tests/governance-projection.test.ts'],
  ['f05-hook', 'packages/ui-client/tests/governance-f05-hook.test.ts'],
  ['governance-f05', 'packages/ui-client/tests/governance-f05.test.ts'],
  ['`f05`', 'packages/ui-client/tests/governance-f05.test.ts'],
  ['governance-f22', 'packages/ui-client/tests/governance-f22.test.ts'],
  ['ui F22', 'packages/ui-client/tests/governance-f22.test.ts'],
  ['ui `governance-f22`', 'packages/ui-client/tests/governance-f22.test.ts'],
  ['delta-batch', 'packages/ui-client/tests/delta-batch.test.ts'],
  ['reduce-identity', 'packages/ui-client/tests/reduce-identity.test.ts'],
  ['governance-requestid', 'packages/ui-client/tests/governance-requestid.test.ts'],
  ['ct-f01-009', 'packages/agent-service/tests/service/ct-f01-009.test.ts'],
  ['ct-f02-013', 'packages/agent-service/tests/service/ct-f02-013.test.ts'],
  ['ct-f08-005', 'packages/agent-service/tests/service/ct-f08-005.test.ts'],
  ['ct-f10-012', 'packages/agent-service/tests/service/ct-f10-012.test.ts'],
  ['ct-f13-007', 'packages/agent-service/tests/service/ct-f13-007.test.ts'],
  ['ct-f17-006', 'packages/agent-service/tests/service/ct-f17-006.test.ts'],
  ['ct-f18-002', 'packages/agent-service/tests/service/ct-f18-002.test.ts'],
  ['ct-f19-004', 'packages/agent-service/tests/service/ct-f19-004.test.ts'],
  ['ct-f20-006', 'packages/agent-service/tests/service/ct-f20-006.test.ts'],
  ['at-f16-f15-native', 'packages/agent-service/tests/service/at-f16-f15-native.test.ts'],
  ['at-f16-004', 'packages/agent-service/tests/service/at-f16-004.test.ts'],
  ['at-f20-001', 'packages/agent-service/tests/service/at-f20-001.test.ts'],
  ['at-webkit-env', 'packages/ui-client/tests/at-webkit-env.test.ts'],
  ['rp-f24-009', 'packages/agent-service/tests/service/rp-f24-009.test.ts'],
  ['空 origin', 'packages/agent-service/tests/service/governance-round15.test.ts'],
  ['既有 token', 'packages/agent-service/tests/service/governance-round15.test.ts'],
  ['v2r-11', 'packages/agent-service/tests/service/governance-v2r-integrity.test.ts'],
  ['destdir', 'packages/agent-service/tests/service/governance-f22-f24.test.ts'],
]

function fileCommit(rel) {
  try {
    return execFileSync('git', ['log', '-1', '--format=%H', '--', rel], {
      cwd: root, encoding: 'utf8',
    }).trim() || null
  } catch {
    return null
  }
}

function fileSha(rel) {
  return createHash('sha256').update(readFileSync(path.join(root, rel))).digest('hex')
}

function resolveFiles(evidence) {
  const found = []
  const seen = new Set()
  const text = evidence.toLowerCase()
  const ordered = [...ALIAS].sort((a, b) => b[0].length - a[0].length)
  for (const [alias, file] of ordered) {
    if (text.includes(alias.toLowerCase().replace(/`/g, '')) && !seen.has(file)) {
      seen.add(file)
      found.push(file)
    }
  }
  return found
}

const md = readFileSync(matrixPath, 'utf8')
const rows = []
for (const line of md.split('\n')) {
  if (!line.startsWith('|')) continue
  const cols = line.split('|').map((c) => c.trim())
  if (cols.length < 6) continue
  const first = cols[1]
  const isBehavior = /^F\d{2}-[A-Z0-9]+-\d+$/.test(first)
  const isCombo = /^[A-Z]+-[A-Z0-9-]+$/.test(first) && !isBehavior
  if (!isBehavior && !isCombo) continue
  const testIdsCol = isBehavior ? cols[7] : cols[4]
  const evidenceCol = isBehavior ? cols[9] : (cols[6] ?? '')
  const status = isBehavior ? cols[11] : cols[5]
  const ids = [...new Set(String(testIdsCol).match(ID_RE) ?? [])]
  if (ids.length === 0) continue
  for (const testId of ids) {
    rows.push({
      test_id: testId,
      row_id: first,
      kind: isBehavior ? 'behavior' : 'combo',
      status,
      evidence_text: evidenceCol,
      files: resolveFiles(`${testIdsCol} ${evidenceCol}`),
    })
  }
}

const byId = new Map()
for (const r of rows) {
  const cur = byId.get(r.test_id) ?? {
    test_id: r.test_id,
    row_ids: [],
    statuses: [],
    files: [],
    evidence_text: [],
  }
  if (!cur.row_ids.includes(r.row_id)) cur.row_ids.push(r.row_id)
  if (!cur.statuses.includes(r.status)) cur.statuses.push(r.status)
  for (const f of r.files) if (!cur.files.includes(f)) cur.files.push(f)
  if (r.evidence_text && !cur.evidence_text.includes(r.evidence_text)) cur.evidence_text.push(r.evidence_text)
  byId.set(r.test_id, cur)
}

const manifest = JSON.parse(readFileSync(path.join(root, 'doc/testing-manifest.json'), 'utf8'))
const boundIds = new Set((manifest.entries ?? []).map((e) => e.test_id))

const historical = []
for (const rec of [...byId.values()].sort((a, b) => a.test_id.localeCompare(b.test_id))) {
  if (boundIds.has(rec.test_id)) continue
  const files = rec.files.filter((f) => existsSync(path.join(root, f)))
  const commits = Object.fromEntries(files.map((f) => [f, fileCommit(f)]))
  const content_sha256 = Object.fromEntries(files.map((f) => [f, fileSha(f)]))
  historical.push({
    test_id: rec.test_id,
    kind: 'historical-unbound',
    candidate_id: 'unbound',
    row_ids: rec.row_ids,
    matrix_statuses: rec.statuses,
    files,
    commits,
    content_sha256,
    evidence_docs: ['doc/testing-matrix.md'],
    evidence_text: rec.evidence_text,
    id_in_source: files.some((f) => readFileSync(path.join(root, f), 'utf8').includes(rec.test_id)),
  })
}

const payload = {
  format: 'historical-unbound-v1',
  note: '历史 unbound 合法形态: AT|CT|RP|IT|UT-<TOKEN>-<NNN>。不要求出现在测试标题。candidate_id 必须 unbound。禁止 covered。实体=现存测试文件 + (40 位 git commit 或 evidence_docs) + 文件 sha256。绑定 ID 只活在 testing-manifest.json。',
  generated_from: 'doc/testing-matrix.md',
  count: historical.length,
  records: historical,
}

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`)
const missing = historical.filter((r) => r.files.length === 0)
console.log(`historical ids=${historical.length} missing_file=${missing.length}`)
if (missing.length) {
  for (const m of missing) console.warn(`NO FILE ${m.test_id} rows=${m.row_ids.join(',')} ev=${m.evidence_text.join(' | ')}`)
}

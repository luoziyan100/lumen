/**
 * [INPUT]: 依赖 check-testing-matrix.mjs 的 runCheck,依赖 node:test / os / fs
 * [OUTPUT]: 负向夹具:缺文件、重复 ID、矩阵悬空 ID、skip 标 covered、状态不一致必须失败;合法夹具必须通过
 * [POS]: scripts/ 的 checker 自测,不改业务代码,不把失败夹具写进仓库真源
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { runCheck } from './check-testing-matrix.mjs'

function writeTree(root, files) {
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(root, rel)
    mkdirSync(path.dirname(abs), { recursive: true })
    writeFileSync(abs, body)
  }
}

function validWorld(overrides = {}) {
  const testRel = 'packages/agent-service/tests/service/ct-f99-001.test.ts'
  const files = {
    'doc/testing-matrix.md': `| behavior_id | invariant | normal_path | failure_path | combination_path | risk_class | test_ids | test_level | evidence | environment | status | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F99-TST-01 | 夹具行为 | 正常 | 失败 | 组合 | identity | CT-F99-001 | L3 | ${testRel} | temp-root | covered | fixture |

| combo_id | 必测组合 | 映射行为 | test_ids | status | notes |
|---|---|---|---|---|---|
| COM-TST-01 | 夹具组合 | F99-TST-01 | CT-F99-001 | covered | fixture |
`,
    'doc/testing-manifest.json': JSON.stringify({
      candidate_id: 'fixture-ok',
      voids: [],
      report: 'doc/诊断/fixture-report.md',
      entries: [{
        test_id: 'CT-F99-001',
        behavior_id: 'F99-TST-01',
        combo_id: 'COM-TST-01',
        level: 'L3',
        environment: 'temp-root',
        status: 'covered',
        matrix_status: 'covered',
        combo_matrix_status: 'covered',
        skipped: false,
        evidence: testRel,
        file: testRel,
        candidate_id: 'fixture-ok',
      }],
    }, null, 2),
    'doc/testing-historical-ids.json': JSON.stringify({
      format: 'historical-unbound-v1',
      records: [],
    }, null, 2),
    'doc/testing-defects.md': 'status: open\n',
    'doc/诊断/fixture-report.md': `### CT-F99-001

status: covered

SHA-256 aggregate 算法见下。aggregate 不含本报告。去掉「## 报告自身哈希」后计算。

TEST_SYSTEM_PASS: pending original review
F01-F24: not accepted by this document
MAIN_PASS: prohibited
`,
    [testRel]: `test('CT-F99-001:fixture', () => {})\n`,
    ...overrides.files,
  }
  if (overrides.manifest) {
    const parsed = JSON.parse(files['doc/testing-manifest.json'])
    files['doc/testing-manifest.json'] = JSON.stringify(overrides.manifest(parsed), null, 2)
  }
  if (overrides.matrix) files['doc/testing-matrix.md'] = overrides.matrix(files['doc/testing-matrix.md'])
  if (overrides.omit) {
    for (const rel of overrides.omit) delete files[rel]
  }
  return files
}

function checkFixture(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'lumen-checker-'))
  try {
    writeTree(root, files)
    return runCheck({
      root,
      requireBatchIds: false,
      checkGit: false,
      testRoots: [path.join(root, 'packages/agent-service/tests')],
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('合法夹具通过', () => {
  const result = checkFixture(validWorld())
  assert.equal(result.ok, true, result.errors.join('\n'))
})

test('删除测试文件必须失败', () => {
  const result = checkFixture(validWorld({ omit: ['packages/agent-service/tests/service/ct-f99-001.test.ts'] }))
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /file 不存在|找不到稳定 ID/)
})

test('重复 manifest ID 必须失败', () => {
  const result = checkFixture(validWorld({
    manifest(m) {
      m.entries.push({ ...m.entries[0] })
      return m
    },
  }))
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /重复 manifest ID CT-F99-001/)
})

test('矩阵悬空 ID 必须失败', () => {
  const result = checkFixture(validWorld({
    matrix(md) {
      return md.replace('CT-F99-001 | L3', 'CT-F99-001, CT-F99-999 | L3')
        .replace('| CT-F99-001 | covered |', '| CT-F99-001, CT-F99-999 | covered |')
    },
  }))
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /CT-F99-999 无绑定条目也无 historical-unbound/)
})

test('skip 标 covered 必须失败', () => {
  const result = checkFixture(validWorld({
    manifest(m) {
      m.entries[0].skipped = true
      m.entries[0].skip_reason = 'environment'
      return m
    },
  }))
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /跳过被记 covered/)
})

test('矩阵与 manifest 状态不一致必须失败', () => {
  const result = checkFixture(validWorld({
    manifest(m) {
      m.entries[0].matrix_status = 'partial'
      m.entries[0].status = 'partial'
      m.entries[0].note = 'fixture mismatch'
      return m
    },
  }))
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /矩阵 status=covered 与 manifest=partial 不一致/)
})

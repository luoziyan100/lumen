/**
 * [INPUT]: 依赖 testing-manifest.json、testing-historical-ids.json、testing-matrix.md、测试源码、git 对象
 * [OUTPUT]: 双向完整性门禁;export runCheck;exit 0 仅表示清单自洽,不表示 TEST_SYSTEM_PASS / MAIN_PASS
 * [POS]: scripts/ 的只读测试体系校验器;与 build-testing-historical-index.mjs 和 check-testing-matrix.test.mjs 成对
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 *
 * 正向: manifest → 矩阵行、测试文件含 ID、evidence 路径存在。
 * 反向: 矩阵每个 test_id → 绑定条目或 historical-unbound 记录。
 * covered 必须有绑定实体;历史 unbound 禁止 covered;同文件重复 manifest ID 为零。
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const REQUIRED_TEST_IDS = [
  'AT-F16-001', 'AT-F16-003', 'AT-F15-001', 'AT-F20-001', 'CT-F02-013', 'CT-F18-002',
  'CT-F17-006', 'CT-F08-005', 'CT-F10-012', 'AT-F05-001', 'AT-F12-001', 'AT-F24-001', 'CT-F19-004',
  'CT-F20-006', 'CT-F13-007', 'CT-F01-009', 'RP-F24-009', 'AT-F16-004',
  'CT-F18-003', 'CT-F07-006', 'CT-F20-007', 'CT-F21-004',
  'CT-F17-007', 'CT-F17-008', 'CT-F22-004', 'CT-F23-003', 'CT-F23-004',
  'CT-F03-006', 'CT-F04-005', 'CT-F06-005', 'UT-F06-006', 'CT-F09-007',
  'CT-F11-006', 'CT-F14-005',
]

const ID_RE = /\b(?:AT|CT|RP|IT|UT)-[A-Z0-9]+-\d+\b/g
const BEHAVIOR_RE = /^F\d{2}-[A-Z0-9]+-\d+$/
const COMBO_RE = /^[A-Z]+-[A-Z0-9-]+$/
const COMMIT_RE = /^[0-9a-f]{40}$/
const PATH_RE = /(?:^|[;`\s])((?:packages|doc|scripts|briefs)\/[A-Za-z0-9_./+-]+\.(?:ts|tsx|js|mjs|md|json))/g
const TITLE_RE = /\b(?:test|it)\(\s*(?:`|'|")([^`'"\n]+)/g

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, acc)
    else if (name.endsWith('.test.ts') || name.endsWith('.test.mjs')) acc.push(p)
  }
  return acc
}

function parseRows(md) {
  const behaviors = []
  const combos = []
  for (const line of md.split('\n')) {
    if (!line.startsWith('|')) continue
    const cols = line.split('|').map((c) => c.trim())
    if (cols.length < 6) continue
    const id = cols[1]
    if (BEHAVIOR_RE.test(id)) behaviors.push({ id, raw: cols, line })
    else if (COMBO_RE.test(id) && !BEHAVIOR_RE.test(id)) combos.push({ id, raw: cols, line })
  }
  return { behaviors, combos }
}

function idsIn(text) {
  return [...new Set(String(text ?? '').match(ID_RE) ?? [])]
}

function repoPaths(text) {
  const out = []
  const re = new RegExp(PATH_RE.source, 'g')
  let m
  while ((m = re.exec(String(text ?? '')))) out.push(m[1])
  return [...new Set(out)]
}

function gitExists(root, args) {
  try {
    execFileSync('git', args, { cwd: root, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function hasLimitReason(entry) {
  return Boolean(
    String(entry.skip_reason ?? '').trim()
    || String(entry.uncovered_reason ?? '').trim()
    || String(entry.note ?? '').trim(),
  )
}

function boundCoversRow(entry, rowId) {
  if (!entry || entry.skipped) return false
  if (entry.matrix_statuses?.[rowId] === 'covered') return true
  const behaviors = String(entry.behavior_id ?? '').split(/[、,]/).map((s) => s.trim()).filter(Boolean)
  const combos = String(entry.combo_id ?? '').split(/[、,]/).map((s) => s.trim()).filter(Boolean)
  if (behaviors.includes(rowId) && (entry.matrix_status === 'covered' || (behaviors.length === 1 && entry.status === 'covered'))) {
    return true
  }
  if (combos.includes(rowId) && (entry.combo_matrix_status === 'covered' || (combos.length === 1 && entry.status === 'covered'))) {
    return true
  }
  return false
}

export function runCheck(options = {}) {
  const root = options.root ?? defaultRoot
  const matrixPath = options.matrixPath ?? path.join(root, 'doc/testing-matrix.md')
  const manifestPath = options.manifestPath ?? path.join(root, 'doc/testing-manifest.json')
  const historicalPath = options.historicalPath ?? path.join(root, 'doc/testing-historical-ids.json')
  const defectsPath = options.defectsPath ?? path.join(root, 'doc/testing-defects.md')
  const testRoots = options.testRoots ?? [
    path.join(root, 'packages/agent-service/tests'),
    path.join(root, 'packages/ui-client/tests'),
  ]
  const requireBatchIds = options.requireBatchIds !== false
  const checkGit = options.checkGit !== false

  const errors = []
  const warnings = []

  for (const p of [manifestPath, matrixPath, historicalPath]) {
    if (!existsSync(p)) errors.push(`缺少 ${p}`)
  }
  if (errors.length) return { ok: false, errors, warnings, summary: null }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const historical = JSON.parse(readFileSync(historicalPath, 'utf8'))
  const matrix = readFileSync(matrixPath, 'utf8')
  const defects = existsSync(defectsPath) ? readFileSync(defectsPath, 'utf8') : ''
  const reportRel = options.reportPath
    ?? manifest.report
    ?? 'doc/诊断/测试体系-v1-收敛交付-2026-09-09.md'
  const reportPath = path.isAbsolute(reportRel) ? reportRel : path.join(root, reportRel)

  if (!manifest.candidate_id) errors.push('manifest 缺 candidate_id')
  if ((manifest.voids ?? []).includes(manifest.candidate_id)) {
    errors.push(`候选 ${manifest.candidate_id} 已列入 voids`)
  }
  if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) {
    errors.push('manifest.entries 为空')
  }
  if (historical.format !== 'historical-unbound-v1') {
    errors.push('historical-ids format 必须是 historical-unbound-v1')
  }

  const bound = new Map()
  const seenTest = new Map()
  for (const e of manifest.entries ?? []) {
    if (!e.test_id) {
      errors.push('manifest 条目缺 test_id')
      continue
    }
    if (seenTest.has(e.test_id)) {
      errors.push(`重复 manifest ID ${e.test_id}（文件 ${seenTest.get(e.test_id)} 与 ${e.file ?? ''}）`)
    }
    seenTest.set(e.test_id, e.file ?? '')
    bound.set(e.test_id, e)
    if (e.candidate_id && e.candidate_id !== manifest.candidate_id) {
      errors.push(`${e.test_id} candidate_id=${e.candidate_id} 与顶层 ${manifest.candidate_id} 不一致`)
    }
    if (!e.behavior_id && !e.combo_id) errors.push(`${e.test_id} 缺 behavior_id 与 combo_id`)
    if (!e.level) errors.push(`${e.test_id} 缺 level`)
    if (!e.environment) errors.push(`${e.test_id} 缺 environment`)
    if (!e.evidence || String(e.evidence).trim() === '') errors.push(`${e.test_id} 缺 evidence`)
    if (!['covered', 'partial', 'uncovered'].includes(e.status)) {
      errors.push(`${e.test_id} status 非法: ${e.status}`)
    }
    if (e.status === 'covered' && e.skipped) {
      errors.push(`${e.test_id} 跳过被记 covered`)
    }
    if (e.status === 'covered' && (!e.evidence || String(e.evidence).trim() === '')) {
      errors.push(`${e.test_id} covered 但无 evidence`)
    }
    if ((e.status === 'partial' || e.status === 'uncovered') && !hasLimitReason(e)) {
      errors.push(`${e.test_id} ${e.status} 未写限制或环境原因`)
    }
    if (!e.file) errors.push(`${e.test_id} 缺 file`)
    else {
      const abs = path.join(root, e.file)
      if (!existsSync(abs)) errors.push(`${e.test_id} file 不存在: ${e.file}`)
      else if (!readFileSync(abs, 'utf8').includes(e.test_id)) {
        errors.push(`${e.test_id} 的 file 未包含该 ID: ${e.file}`)
      }
    }
    for (const p of repoPaths(`${e.file ?? ''} ${e.evidence ?? ''}`)) {
      if (!existsSync(path.join(root, p))) errors.push(`${e.test_id} evidence 路径不存在: ${p}`)
    }
  }

  if (requireBatchIds) {
    for (const id of REQUIRED_TEST_IDS) {
      if (!bound.has(id)) errors.push(`整批缺 test_id ${id}`)
    }
  }

  const hist = new Map()
  for (const rec of historical.records ?? []) {
    if (!rec.test_id) {
      errors.push('historical 记录缺 test_id')
      continue
    }
    if (hist.has(rec.test_id)) errors.push(`historical 重复 ID ${rec.test_id}`)
    hist.set(rec.test_id, rec)
    if (bound.has(rec.test_id)) {
      errors.push(`${rec.test_id} 不能同时是绑定条目和 historical-unbound`)
    }
    if (rec.kind !== 'historical-unbound') {
      errors.push(`${rec.test_id} kind 必须是 historical-unbound`)
    }
    if (rec.candidate_id !== 'unbound') {
      errors.push(`${rec.test_id} 历史记录 candidate_id 必须 unbound`)
    }
    if ((rec.matrix_statuses ?? []).includes('covered')) {
      errors.push(`${rec.test_id} 历史 unbound 不得带 matrix status=covered`)
    }
    const files = rec.files ?? []
    if (files.length === 0) errors.push(`${rec.test_id} 历史记录无文件实体`)
    let hasCommit = false
    for (const f of files) {
      const abs = path.join(root, f)
      if (!existsSync(abs)) {
        errors.push(`${rec.test_id} 历史文件不存在: ${f}`)
        continue
      }
      const sha = rec.content_sha256?.[f]
      if (sha) {
        const actual = createHash('sha256').update(readFileSync(abs)).digest('hex')
        if (actual !== sha) errors.push(`${rec.test_id} 文件哈希漂移 ${f}`)
      }
      const commit = rec.commits?.[f]
      if (commit && checkGit) {
        if (!COMMIT_RE.test(commit)) errors.push(`${rec.test_id} commit 非法: ${commit}`)
        else if (!gitExists(root, ['cat-file', '-e', `${commit}^{commit}`])) {
          errors.push(`${rec.test_id} commit 不是 git 对象: ${commit}`)
        } else if (!gitExists(root, ['cat-file', '-e', `${commit}:${f}`])) {
          errors.push(`${rec.test_id} commit 内无文件 ${f}`)
        } else {
          hasCommit = true
        }
      } else if (commit && !checkGit && COMMIT_RE.test(commit)) {
        hasCommit = true
      }
    }
    const docs = rec.evidence_docs ?? []
    const docsOk = docs.length > 0 && docs.every((d) => existsSync(path.join(root, d)))
    for (const d of docs) {
      if (!existsSync(path.join(root, d))) errors.push(`${rec.test_id} evidence_doc 不存在: ${d}`)
    }
    if (!hasCommit && !docsOk) {
      errors.push(`${rec.test_id} 既无有效 commit 锚点也无 evidence 文档`)
    }
  }

  const { behaviors, combos } = parseRows(matrix)
  const behaviorIds = new Set(behaviors.map((r) => r.id))
  const comboIds = new Set(combos.map((r) => r.id))

  const behaviorStatus = new Map()
  for (const r of behaviors) {
    behaviorStatus.set(r.id, { status: r.raw[11], testIds: r.raw[7], evidence: r.raw[9] })
  }
  const comboStatus = new Map()
  for (const r of combos) {
    comboStatus.set(r.id, { status: r.raw[5], testIds: r.raw[4], evidence: r.raw[6] ?? '' })
  }

  for (const e of manifest.entries ?? []) {
    for (const bid of String(e.behavior_id ?? '').split(/[、,]/).map((s) => s.trim()).filter(Boolean)) {
      if (!behaviorIds.has(bid)) errors.push(`${e.test_id} 引用不存在的 behavior_id ${bid}`)
      const row = behaviorStatus.get(bid)
      const expected = e.matrix_statuses?.[bid] ?? (String(e.behavior_id).includes(',') ? undefined : e.matrix_status)
      if (row && expected && row.status !== expected) {
        errors.push(`${bid} 矩阵 status=${row.status} 与 manifest=${expected} 不一致`)
      }
      if (row && e.test_id && row.testIds && row.testIds !== '—' && !row.testIds.includes(e.test_id) && e.maps_into_matrix !== false) {
        warnings.push(`${e.test_id} 未出现在 ${bid} 的 test_ids 列(${row.testIds})`)
      }
    }
    for (const cid of String(e.combo_id ?? '').split(/[、,]/).map((s) => s.trim()).filter(Boolean)) {
      if (!comboIds.has(cid)) errors.push(`${e.test_id} 引用不存在的 combo_id ${cid}`)
      const row = comboStatus.get(cid)
      if (row && e.combo_matrix_status && row.status !== e.combo_matrix_status) {
        errors.push(`${cid} 矩阵 status=${row.status} 与 manifest.combo_matrix_status=${e.combo_matrix_status} 不一致`)
      }
    }
  }

  const matrixRefs = []
  for (const r of behaviors) {
    const status = r.raw[11]
    const evidence = r.raw[9]
    for (const testId of idsIn(r.raw[7])) {
      matrixRefs.push({ testId, rowId: r.id, status, evidence, kind: 'behavior' })
    }
    for (const p of repoPaths(evidence)) {
      if (!existsSync(path.join(root, p))) errors.push(`矩阵 ${r.id} evidence 路径不存在: ${p}`)
    }
  }
  for (const r of combos) {
    const status = r.raw[5]
    const evidence = r.raw[6] ?? ''
    for (const testId of idsIn(r.raw[4])) {
      matrixRefs.push({ testId, rowId: r.id, status, evidence, kind: 'combo' })
    }
  }

  const matrixIds = new Set()
  const coveredRows = new Map()
  for (const ref of matrixRefs) {
    matrixIds.add(ref.testId)
    const b = bound.get(ref.testId)
    const h = hist.get(ref.testId)
    if (!b && !h) {
      errors.push(`矩阵 ${ref.rowId} 的 ${ref.testId} 无绑定条目也无 historical-unbound 记录`)
    }
    if (ref.status === 'covered') {
      const cur = coveredRows.get(ref.rowId) ?? []
      cur.push(ref.testId)
      coveredRows.set(ref.rowId, cur)
    }
  }

  for (const [rowId, ids] of coveredRows) {
    const hasBoundCovered = ids.some((id) => boundCoversRow(bound.get(id), rowId))
    if (!hasBoundCovered) {
      errors.push(`矩阵 ${rowId} 标 covered 但没有绑定且未跳过的实体 ID`)
    }
  }

  for (const id of hist.keys()) {
    if (!matrixIds.has(id)) errors.push(`historical ${id} 未出现在矩阵 test_ids`)
  }

  const testFiles = testRoots.flatMap((dir) => walk(dir))
  const fileIds = new Map()
  const titleOwners = new Map()
  for (const f of testFiles) {
    const text = readFileSync(f, 'utf8')
    const rel = path.relative(root, f)
    for (const m of text.match(ID_RE) ?? []) {
      const list = fileIds.get(m) ?? []
      list.push(rel)
      fileIds.set(m, list)
    }
    const titles = []
    const titleRe = new RegExp(TITLE_RE.source, 'g')
    let tm
    while ((tm = titleRe.exec(text))) titles.push(tm[1])
    const seenInFile = new Map()
    for (const title of titles) {
      for (const id of idsIn(title)) {
        const n = (seenInFile.get(id) ?? 0) + 1
        seenInFile.set(id, n)
        const owners = titleOwners.get(id) ?? new Set()
        owners.add(rel)
        titleOwners.set(id, owners)
      }
    }
  }

  for (const [id, owners] of titleOwners) {
    if (bound.has(id) && owners.size > 1) {
      errors.push(`${id} 在多个测试文件的标题中出现: ${[...owners].join(', ')}`)
    }
  }

  for (const e of manifest.entries ?? []) {
    if (!fileIds.has(e.test_id)) {
      errors.push(`${e.test_id} 测试源码中找不到稳定 ID`)
    }
  }

  if (!existsSync(reportPath)) {
    errors.push(`缺少交付报告 ${reportPath}`)
  } else {
    const report = readFileSync(reportPath, 'utf8')
    for (const e of manifest.entries ?? []) {
      if (!report.includes(e.test_id)) errors.push(`交付报告未出现 ${e.test_id}`)
      const block = report.split(`### ${e.test_id}`)[1]?.split('### ')[0] ?? ''
      if (block) {
        const st = block.match(/status:\s*(covered|partial|uncovered)/)
        if (st && st[1] !== e.status) {
          errors.push(`报告 ${e.test_id} status=${st[1]} 与 manifest ${e.status} 不一致`)
        }
      }
    }
    if (!/SHA-256|sha256/.test(report) || !/aggregate/.test(report)) {
      errors.push('交付报告必须说明 aggregate 算法并给出报告自身 hash')
    }
    if (!/去掉「## 报告自身哈希」|不含本报告/.test(report)) {
      errors.push('交付报告必须写明自身 hash 的计算边界')
    }
    if (!/TEST_SYSTEM_PASS:\s*pending original review/.test(report)) {
      errors.push('交付报告必须写 TEST_SYSTEM_PASS: pending original review')
    }
    if (/TEST_SYSTEM_PASS:\s*passed original review/.test(report)) {
      errors.push('执行者不得写 TEST_SYSTEM_PASS: passed original review')
    }
    if (!/F01-F24:\s*not accepted by this document/.test(report)) {
      errors.push('交付报告必须写 F01-F24: not accepted by this document')
    }
    if (!/MAIN_PASS:\s*prohibited/.test(report)) {
      errors.push('交付报告必须写 MAIN_PASS: prohibited')
    }
  }

  if (defects && /status: closed/.test(defects) && !manifest.allow_closed_defects) {
    warnings.push('缺陷表出现 closed;本批不得把业务合同写成已关闭')
  }

  const digest = createHash('sha256').update(readFileSync(manifestPath)).digest('hex')
  if (manifest.manifest_sha256 && manifest.manifest_sha256 !== digest) {
    errors.push('manifest_sha256 与文件内容不符(先重算再提交)')
  }

  const summary = {
    candidate_id: manifest.candidate_id,
    bound: manifest.entries?.length ?? 0,
    historical: hist.size,
    matrix_ids: matrixIds.size,
  }
  return { ok: errors.length === 0, errors, warnings, summary }
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invoked) {
  const result = runCheck({ requireBatchIds: true })
  for (const w of result.warnings) console.warn(`check-testing-matrix warn: ${w}`)
  if (!result.ok) {
    for (const e of result.errors) console.error(`check-testing-matrix: ${e}`)
    process.exit(1)
  }
  console.log(
    `check-testing-matrix: ok candidate=${result.summary.candidate_id} bound=${result.summary.bound} historical=${result.summary.historical} matrix_ids=${result.summary.matrix_ids}`,
  )
}

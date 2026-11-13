/**
 * [INPUT]: 显式数据根下的 studio 存储、研究网络（arXiv PDF 与 API）、titles 的回退链
 * [OUTPUT]: backfillLibrary：对现有条目按 L2 重算标题与论文元数据；来源是 arXiv 论文页的 kind=web 条目按 L1 换成 PDF 原件（同一条目，id/引用/阅读进度/出处都不动）；
 *           dryRun 只出计划；backupLibrary：VACUUM INTO 备份 catalog.sqlite、复制受影响的 library/<id>/、记录 SHA256 清单；命令行入口（只在显式运行时执行，启动时不跑）
 * [POS]: 旧数据的一次性补齐（L4）。标题只升不降（arxiv > info > heading > file），所以重跑结果相同、API 暂时失败也不会把好标题改坏
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from 'node:crypto'
import { cp, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { arxivAbsUrl, arxivId, arxivPdfUrl, fetchArxivMeta } from '../research/arxiv.ts'
import { researchHttp, type ResearchHttp } from '../research/http.ts'
import { StudioError } from './errors.ts'
import { resolveTitle, type PaperMeta } from './library.ts'
import { openStudio, type Studio } from './studio.ts'
import { TITLE_RANK, type TitleSource } from './titles.ts'
import type { LibraryItem } from './types.ts'

export type BackfillAction = 'converted' | 'retitled' | 'unchanged' | 'skipped'
export interface BackfillRow {
  id: string
  action: BackfillAction
  reason?: string
  before: { kind: LibraryItem['kind']; title: string; titleSource: LibraryItem['titleSource']; file: string; sha256: string }
  after: { kind: LibraryItem['kind']; title: string; titleSource: LibraryItem['titleSource']; file: string; sha256: string; authors: string | null; year: number | null; arxivId: string | null }
}

const snapshot = (item: LibraryItem) => ({ kind: item.kind, title: item.title, titleSource: item.titleSource, file: item.file, sha256: item.sha256 })
const rank = (source: TitleSource | null) => source ? TITLE_RANK[source] : 0
const isPdf = (bytes: Uint8Array) => Buffer.from(bytes.subarray(0, 5)).toString('latin1') === '%PDF-'

/** 计划或执行补取；dryRun 时不写数据库也不写文件，返回的 after 是将要变成的样子 */
export async function backfillLibrary(studio: Studio, http: ResearchHttp, options: { dryRun?: boolean; signal?: AbortSignal } = {}): Promise<BackfillRow[]> {
  const rows: BackfillRow[] = []
  for (const original of [...studio.library.list()].reverse()) {
    let item = original, action: BackfillAction = 'unchanged', reason: string | undefined
    const paper = item.arxivId ?? arxivId(item.sourceUrl)
    let bytes: Uint8Array | undefined
    // ---- L1：arXiv 论文页存成了网页正文 → 同一条目换成 PDF 原件 ----
    if (item.kind === 'web' && paper) {
      try {
        const fetched = (await http(arxivPdfUrl(paper), { signal: options.signal })).bytes
        if (!isPdf(fetched)) throw new StudioError(`arXiv ${paper} 没有返回 PDF`, 400)
        bytes = fetched
        if (!options.dryRun) item = await studio.library.replaceOriginal(item, { name: `${paper.replace('/', '_')}.pdf`, bytes, kind: 'pdf', mediaType: 'application/pdf', sourceUrl: arxivAbsUrl(paper) })
        else item = { ...item, kind: 'pdf', file: `${paper.replace('/', '_')}.pdf`, mediaType: 'application/pdf', sourceUrl: arxivAbsUrl(paper), sha256: createHash('sha256').update(bytes).digest('hex') }
        action = 'converted'
      } catch (error) {
        rows.push({ id: item.id, action: 'skipped', reason: error instanceof Error ? error.message : String(error), before: snapshot(original), after: { ...snapshot(original), authors: original.authors, year: original.year, arxivId: original.arxivId } })
        continue
      }
    }
    // ---- L2：只给 PDF 重算标题；网页标题与其他文件保持原样 ----
    if (item.kind === 'pdf' || item.mediaType === 'application/pdf') {
      const meta = paper ? await fetchArxivMeta(http, paper, options.signal) : null
      let candidate: { title: string; source: TitleSource }
      if (meta) candidate = { title: meta.title, source: 'arxiv' }
      else {
        bytes ??= await studio.library.read(item)
        candidate = await resolveTitle({ bytes }, item.file)
      }
      const nextMeta: PaperMeta = { arxivId: paper ?? item.arxivId, authors: meta?.authors || item.authors, year: meta?.year ?? item.year }
      const upgrade = rank(candidate.source) >= rank(item.titleSource)
      const title = upgrade ? candidate.title : item.title, titleSource: TitleSource = upgrade ? candidate.source : item.titleSource ?? candidate.source
      const changed = title !== item.title || titleSource !== item.titleSource || nextMeta.arxivId !== item.arxivId || nextMeta.authors !== item.authors || nextMeta.year !== item.year
      if (changed) {
        item = options.dryRun ? { ...item, title, titleSource, authors: nextMeta.authors ?? null, year: nextMeta.year ?? null, arxivId: nextMeta.arxivId ?? null } : studio.library.refresh(item.id, { title, titleSource, meta: nextMeta })
        if (action === 'unchanged') action = 'retitled'
      }
      if (paper && !meta) reason = 'arXiv API 没有返回，标题按 PDF 规则；稍后可重跑补取'
    }
    rows.push({ id: item.id, action, ...(reason ? { reason } : {}), before: snapshot(original),
      after: { ...snapshot(item), authors: item.authors, year: item.year, arxivId: item.arxivId } })
  }
  return rows
}

async function sha256File(path: string) { return createHash('sha256').update(await readFile(path)).digest('hex') }
async function filesUnder(root: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) out.push(...await filesUnder(path)); else if (entry.isFile()) out.push(path)
  }
  return out
}

/** 执行前备份：catalog.sqlite 用 VACUUM INTO 取一致快照（服务在跑也安全），受影响条目的 library/<id>/ 原样复制（保留 0400），写 SHA256 清单 */
export async function backupLibrary(studio: Studio, dataRoot: string, itemIds: readonly string[], backupDir: string) {
  await mkdir(backupDir, { recursive: true, mode: 0o700 })
  if ((await readdir(backupDir)).length) throw new Error(`备份目录不是空的：${backupDir}`)
  const catalog = join(backupDir, 'catalog.sqlite')
  studio.db.exec(`VACUUM INTO '${catalog.replaceAll("'", "''")}'`)
  for (const id of itemIds) await cp(join(dataRoot, 'library', id), join(backupDir, 'library', id), { recursive: true, preserveTimestamps: true })
  const files = await filesUnder(backupDir)
  const manifest = await Promise.all(files.map(async path => ({ path: relative(backupDir, path), sha256: await sha256File(path), size: (await stat(path)).size })))
  await writeFile(join(backupDir, 'manifest.json'), JSON.stringify({ dataRoot, createdAt: new Date().toISOString(), items: itemIds, files: manifest }, null, 2) + '\n', { mode: 0o600 })
  return manifest
}

// ---------------------------------------------------------------------------
// 命令行：node --experimental-strip-types src/studio/backfill.ts --data-root <dir> (--dry-run | --backup <空目录>) [--report <file>]
// 不在服务启动时跑；对正式数据执行前须经负责人确认
// ---------------------------------------------------------------------------
async function main(argv: string[]) {
  const flag = (name: string) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : undefined }
  const dataRoot = flag('--data-root'), dryRun = argv.includes('--dry-run'), backup = flag('--backup'), report = flag('--report')
  if (!dataRoot || (!dryRun && !backup)) throw new Error('用法：backfill.ts --data-root <dir> (--dry-run | --backup <空目录>) [--report <file>]')
  const studio = openStudio(resolve(dataRoot))
  try {
    const http = researchHttp()
    const plan = await backfillLibrary(studio, http, { dryRun: true })
    let rows = plan
    if (!dryRun) {
      const affected = plan.filter(row => row.action === 'converted').map(row => row.id)
      const manifest = await backupLibrary(studio, resolve(dataRoot), affected, resolve(backup!))
      process.stderr.write(`备份 ${manifest.length} 个文件到 ${resolve(backup!)}\n`)
      rows = await backfillLibrary(studio, http)
    }
    const text = JSON.stringify({ dataRoot: resolve(dataRoot), dryRun, rows }, null, 2) + '\n'
    if (report) await writeFile(report, text); else process.stdout.write(text)
  } finally { studio.close() }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1 })
}

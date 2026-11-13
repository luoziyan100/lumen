/**
 * [INPUT]: studio/db 连接、数据根下 library/<itemId>/、研究网络 researchHttp 与 htmlToText、research/arxiv（识别与元数据）、titles（PDF 标题回退链）
 * [OUTPUT]: LibraryStore：按 sha256 去重收入原件（上传字节或公开链接；arXiv 论文链接一律取 PDF 并带 API 元数据）、列举与按 id 取原件、
 *           location（原件真实路径，供原生「系统打开」二次核对）、refresh/replaceOriginal（只给显式补取用）；libraryItem 行映射
 * [POS]: 全局资料库，一份原件服务多个主题；原件落盘后只读（0400），模型与通用文件工具都不在这棵目录里写。标题按 L2：arXiv API → PDF 文档信息 → 首页大字 → 文件名
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash, randomUUID } from 'node:crypto'
import { chmod, lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { extname, join, sep } from 'node:path'
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite'
import { arxivAbsUrl, arxivId, arxivPdfUrl, fetchArxivMeta, type ArxivMeta } from '../research/arxiv.ts'
import type { ResearchHttp } from '../research/http.ts'
import { htmlToText } from '../research/web.ts'
import { StudioError } from './errors.ts'
import { cleanTitle, pdfTitle, type TitleSource } from './titles.ts'
import type { AddedBy, LibraryItem, LibraryKind } from './types.ts'

export const MAX_LIBRARY_BYTES = 25 * 1024 * 1024
const MEDIA: Record<string, string> = { '.pdf': 'application/pdf', '.md': 'text/markdown', '.txt': 'text/plain', '.html': 'text/html', '.htm': 'text/html',
  '.csv': 'text/csv', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }

export function libraryItem(row: Record<string, SQLOutputValue>): LibraryItem {
  return { id: String(row.id), kind: row.kind as LibraryKind, title: String(row.title), file: String(row.file), sourceUrl: row.source_url === null ? null : String(row.source_url),
    sha256: String(row.sha256), mediaType: String(row.media_type), size: Number(row.size), addedBy: row.added_by as AddedBy, createdAt: String(row.created_at),
    authors: row.authors == null ? null : String(row.authors), year: row.year == null ? null : Number(row.year), arxivId: row.arxiv_id == null ? null : String(row.arxiv_id),
    titleSource: row.title_source == null ? null : row.title_source as TitleSource }
}

const isPdf = (bytes: Uint8Array) => Buffer.from(bytes.subarray(0, 5)).toString('latin1') === '%PDF-'
export interface PaperMeta { authors?: string | null; year?: number | null; arxivId?: string | null }
const paperMeta = (meta: ArxivMeta | null, id: string): PaperMeta => ({ arxivId: id, authors: meta?.authors || null, year: meta?.year ?? null })

/** 与旧上传同一套文件名清洗：只留文字、数字与 ._ -，不允许路径和隐藏文件。 */
function safeName(name: string): string {
  const base = name.split(/[/\\]/).pop()?.replace(/[^\p{L}\p{N}._ -]/gu, '_').replace(/^\.+/, '').slice(0, 120).trim()
  return base || 'document'
}

export interface AddInput {
  name: string; bytes: Uint8Array; addedBy: AddedBy; mediaType?: string; sourceUrl?: string; title?: string; kind?: LibraryKind
  /** 显式标题的来路（默认 given）；论文元数据 */
  titleSource?: TitleSource; meta?: PaperMeta
}

/** 标题回退链（L2 的 ②③④）：显式标题 → PDF 文档信息 / 首页大字 → 文件名 */
export async function resolveTitle(input: { title?: string; titleSource?: TitleSource; bytes: Uint8Array }, file: string): Promise<{ title: string; source: TitleSource }> {
  const given = input.title ? cleanTitle(input.title) : ''
  if (given) return { title: given, source: input.titleSource ?? 'given' }
  const fromPdf = isPdf(input.bytes) ? await pdfTitle(input.bytes, file) : null
  if (fromPdf) return fromPdf
  return { title: cleanTitle(file.replace(/\.[^.]+$/, '') || file), source: 'file' }
}

export class LibraryStore {
  private readonly db: DatabaseSync
  private readonly root: string

  constructor(db: DatabaseSync, dataRoot: string) {
    this.db = db
    this.root = join(dataRoot, 'library')
  }

  list(): LibraryItem[] {
    return this.db.prepare('SELECT * FROM library_items ORDER BY created_at DESC, id').all().map(libraryItem)
  }

  get(id: string): LibraryItem {
    const row = this.db.prepare('SELECT * FROM library_items WHERE id = ?').get(id)
    if (!row) throw new StudioError('资料库里没有这份材料', 404)
    return libraryItem(row)
  }

  /** 原件的绝对路径；只供服务内部读取，不交给模型。 */
  path(item: LibraryItem): string { return join(this.root, item.id, item.file) }

  read(item: LibraryItem): Promise<Buffer> { return readFile(this.path(item)) }

  /** 收入一份原件。sha256 相同返回已有条目（created=false），调用方照常补引用。 */
  async add(input: AddInput): Promise<{ item: LibraryItem; created: boolean }> {
    if (input.bytes.byteLength === 0) throw new StudioError('文件是空的，没有收进资料库', 400)
    if (input.bytes.byteLength > MAX_LIBRARY_BYTES) throw new StudioError('单份材料不能超过 25 MB，请缩小后再试', 413)
    const sha256 = createHash('sha256').update(input.bytes).digest('hex')
    const existing = this.bySha(sha256)
    if (existing) return { item: existing, created: false }
    const file = safeName(input.name), id = randomUUID(), directory = join(this.root, id)
    const pdf = isPdf(input.bytes)
    const kind: LibraryKind = input.kind ?? (pdf ? 'pdf' : input.sourceUrl ? 'web' : 'file')
    // ---- 浏览器给不出类型时 multipart 会标成 octet-stream，此时以扩展名为准 ----
    const declared = input.mediaType?.split(';')[0]?.trim().toLowerCase()
    const mediaType = pdf ? 'application/pdf' : (declared && declared !== 'application/octet-stream' ? declared : MEDIA[extname(file).toLowerCase()]) || 'application/octet-stream'
    const { title, source } = await resolveTitle(input, file)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    try {
      const temporary = join(directory, `.${randomUUID()}.partial`)
      await writeFile(temporary, input.bytes, { mode: 0o600, flag: 'wx' })
      await chmod(temporary, 0o400)
      await rename(temporary, join(directory, file))
      this.db.prepare(`INSERT INTO library_items (id, kind, title, file, source_url, sha256, media_type, size, added_by, created_at, authors, year, arxiv_id, title_source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, kind, title, file, input.sourceUrl ?? null, sha256, mediaType, input.bytes.byteLength, input.addedBy, new Date().toISOString(),
          input.meta?.authors ?? null, input.meta?.year ?? null, input.meta?.arxivId ?? null, source)
      return { item: this.get(id), created: true }
    } catch (error) {
      await rm(directory, { recursive: true, force: true })
      // ---- 并发收入同一内容：唯一约束裁决，后到者返回先到者 ----
      const raced = this.bySha(sha256)
      if (raced) return { item: raced, created: false }
      throw error
    }
  }

  /** 公开链接：arXiv 论文（abs/pdf/html 各种写法）一律取 PDF；其他 PDF 存原件；网页存抽出的正文，来源 URL 留在条目上。 */
  async addLink(url: string, http: ResearchHttp, addedBy: AddedBy, signal?: AbortSignal): Promise<{ item: LibraryItem; created: boolean }> {
    const paper = arxivId(url)
    if (paper) return this.addArxiv(paper, http, addedBy, signal)
    let result: Awaited<ReturnType<ResearchHttp>>
    try { result = await http(url, { signal }) }
    catch (error) { throw new StudioError(`链接没有取到：${error instanceof Error ? error.message : String(error)}。确认链接公开可访问后再试`, 400) }
    const pathName = decodeURIComponent(new URL(result.url).pathname.split('/').filter(Boolean).pop() ?? '')
    const raw = Buffer.from(result.bytes)
    if (result.contentType.includes('application/pdf') || raw.subarray(0, 5).toString('latin1') === '%PDF-')
      return this.add({ name: pathName.toLowerCase().endsWith('.pdf') ? pathName : `${pathName || 'document'}.pdf`, bytes: result.bytes, addedBy, sourceUrl: result.url, kind: 'pdf' })
    const decoded = new TextDecoder().decode(result.bytes)
    const html = result.contentType.includes('html') || /<html/i.test(decoded)
    const title = html ? cleanTitle(htmlToText(decoded.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')) : ''
    const text = html ? htmlToText(decoded) : decoded
    if (!text.trim()) throw new StudioError('这个链接没有可读的正文', 400)
    return this.add({ name: `${safeName(title || pathName || 'page').replace(/\.[^.]+$/, '')}.txt`, bytes: Buffer.from(text), addedBy, sourceUrl: result.url,
      kind: 'web', mediaType: 'text/plain', title: title || undefined, titleSource: 'page' })
  }

  /** arXiv 论文：PDF 取 https://arxiv.org/pdf/<id>（已有字节时不重取），同时向 arXiv API 取标题与元数据；API 失败或超时（≤5s）不阻塞，标题回到 PDF 规则，编号照存以便补取 */
  async addArxiv(id: string, http: ResearchHttp, addedBy: AddedBy, signal?: AbortSignal, bytes?: Uint8Array): Promise<{ item: LibraryItem; created: boolean }> {
    const meta = fetchArxivMeta(http, id, signal)
    let pdf = bytes
    if (!pdf) {
      try { pdf = (await http(arxivPdfUrl(id), { signal })).bytes }
      catch (error) { throw new StudioError(`arXiv ${id} 的 PDF 没有取到：${error instanceof Error ? error.message : String(error)}。稍后再试`, 400) }
    }
    if (!isPdf(pdf)) throw new StudioError(`arXiv ${id} 没有返回 PDF（可能还在处理或已撤回），稍后再试`, 400)
    const found = await meta
    return this.add({ name: `${id.replace('/', '_')}.pdf`, bytes: pdf, addedBy, sourceUrl: arxivAbsUrl(id), kind: 'pdf', mediaType: 'application/pdf',
      ...(found ? { title: found.title, titleSource: 'arxiv' as const } : {}), meta: paperMeta(found, id) })
  }

  /** 原件在数据根下的真实路径：只认 library/<id>/ 里的普通文件（不跟符号链接）；交给原生「系统打开」前再核对一次 */
  async location(item: LibraryItem): Promise<{ root: string; path: string }> {
    const root = await realpath(this.root), path = this.path(item)
    const stat = await lstat(path).catch(() => null)
    if (!stat || stat.isSymbolicLink() || !stat.isFile()) throw new StudioError('原件不存在或不是普通文件', 404)
    const real = await realpath(path)
    if (!real.startsWith(root + sep) || real !== join(root, item.id, item.file)) throw new StudioError('原件不在资料库里', 404)
    return { root, path: real }
  }

  /** 补取：改标题与论文元数据（只给显式补取命令用，入库后不自动改） */
  refresh(id: string, fields: { title: string; titleSource: TitleSource; meta: PaperMeta }) {
    this.db.prepare('UPDATE library_items SET title = ?, title_source = ?, authors = ?, year = ?, arxiv_id = ? WHERE id = ?')
      .run(fields.title, fields.titleSource, fields.meta.authors ?? null, fields.meta.year ?? null, fields.meta.arxivId ?? null, id)
    return this.get(id)
  }

  /** 补取：同一条目换新原件（arXiv 网页条目 → PDF）。条目 id、主题引用与阅读游标都不动；新原件同样 0400，旧原件在新行提交后删掉 */
  async replaceOriginal(item: LibraryItem, input: { name: string; bytes: Uint8Array; kind: LibraryKind; mediaType: string; sourceUrl: string }): Promise<LibraryItem> {
    const sha256 = createHash('sha256').update(input.bytes).digest('hex')
    const other = this.bySha(sha256)
    if (other && other.id !== item.id) throw new StudioError(`新原件与资料库里的「${other.title}」相同`, 409)
    const file = safeName(input.name), directory = join(this.root, item.id), target = join(directory, file)
    if (file === item.file) throw new StudioError('新原件与旧原件同名', 409)
    const temporary = join(directory, `.${randomUUID()}.partial`)
    await writeFile(temporary, input.bytes, { mode: 0o600, flag: 'wx' })
    try {
      await chmod(temporary, 0o400)
      await rename(temporary, target)
      this.db.prepare('UPDATE library_items SET kind = ?, file = ?, source_url = ?, sha256 = ?, media_type = ?, size = ? WHERE id = ?')
        .run(input.kind, file, input.sourceUrl, sha256, input.mediaType, input.bytes.byteLength, item.id)
    } catch (error) {
      await rm(temporary, { force: true }); await rm(target, { force: true })
      throw error
    }
    await rm(join(directory, item.file), { force: true })
    return this.get(item.id)
  }

  private bySha(sha256: string): LibraryItem | undefined {
    const row = this.db.prepare('SELECT * FROM library_items WHERE sha256 = ?').get(sha256)
    return row ? libraryItem(row) : undefined
  }
}

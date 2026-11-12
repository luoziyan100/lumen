/**
 * [INPUT]: studio/db 连接、数据根下 library/<itemId>/、研究网络 researchHttp 与 htmlToText
 * [OUTPUT]: LibraryStore：按 sha256 去重收入原件（上传字节或公开链接）、列举与按 id 取原件；libraryItem 行映射
 * [POS]: 全局资料库，一份原件服务多个主题；原件落盘后只读（0400），模型与通用文件工具都不在这棵目录里写
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash, randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite'
import type { ResearchHttp } from '../research/http.ts'
import { htmlToText } from '../research/web.ts'
import { StudioError } from './errors.ts'
import type { AddedBy, LibraryItem, LibraryKind } from './types.ts'

export const MAX_LIBRARY_BYTES = 25 * 1024 * 1024
const MEDIA: Record<string, string> = { '.pdf': 'application/pdf', '.md': 'text/markdown', '.txt': 'text/plain', '.html': 'text/html', '.htm': 'text/html',
  '.csv': 'text/csv', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }

export function libraryItem(row: Record<string, SQLOutputValue>): LibraryItem {
  return { id: String(row.id), kind: row.kind as LibraryKind, title: String(row.title), file: String(row.file), sourceUrl: row.source_url === null ? null : String(row.source_url),
    sha256: String(row.sha256), mediaType: String(row.media_type), size: Number(row.size), addedBy: row.added_by as AddedBy, createdAt: String(row.created_at) }
}

/** 与旧上传同一套文件名清洗：只留文字、数字与 ._ -，不允许路径和隐藏文件。 */
function safeName(name: string): string {
  const base = name.split(/[/\\]/).pop()?.replace(/[^\p{L}\p{N}._ -]/gu, '_').replace(/^\.+/, '').slice(0, 120).trim()
  return base || 'document'
}

export interface AddInput { name: string; bytes: Uint8Array; addedBy: AddedBy; mediaType?: string; sourceUrl?: string; title?: string; kind?: LibraryKind }

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
    const pdf = Buffer.from(input.bytes.subarray(0, 5)).toString('latin1') === '%PDF-'
    const kind: LibraryKind = input.kind ?? (pdf ? 'pdf' : input.sourceUrl ? 'web' : 'file')
    // ---- 浏览器给不出类型时 multipart 会标成 octet-stream，此时以扩展名为准 ----
    const declared = input.mediaType?.split(';')[0]?.trim().toLowerCase()
    const mediaType = pdf ? 'application/pdf' : (declared && declared !== 'application/octet-stream' ? declared : MEDIA[extname(file).toLowerCase()]) || 'application/octet-stream'
    const title = (input.title?.trim() || file.replace(/\.[^.]+$/, '') || file).slice(0, 200)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    try {
      const temporary = join(directory, `.${randomUUID()}.partial`)
      await writeFile(temporary, input.bytes, { mode: 0o600, flag: 'wx' })
      await chmod(temporary, 0o400)
      await rename(temporary, join(directory, file))
      this.db.prepare('INSERT INTO library_items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, kind, title, file, input.sourceUrl ?? null, sha256, mediaType, input.bytes.byteLength, input.addedBy, new Date().toISOString())
      return { item: this.get(id), created: true }
    } catch (error) {
      await rm(directory, { recursive: true, force: true })
      // ---- 并发收入同一内容：唯一约束裁决，后到者返回先到者 ----
      const raced = this.bySha(sha256)
      if (raced) return { item: raced, created: false }
      throw error
    }
  }

  /** 公开链接：PDF 存原件；网页存抽出的正文，来源 URL 留在条目上。 */
  async addLink(url: string, http: ResearchHttp, addedBy: AddedBy, signal?: AbortSignal): Promise<{ item: LibraryItem; created: boolean }> {
    let result: Awaited<ReturnType<ResearchHttp>>
    try { result = await http(url, { signal }) }
    catch (error) { throw new StudioError(`链接没有取到：${error instanceof Error ? error.message : String(error)}。确认链接公开可访问后再试`, 400) }
    const pathName = decodeURIComponent(new URL(result.url).pathname.split('/').filter(Boolean).pop() ?? '')
    const raw = Buffer.from(result.bytes)
    if (result.contentType.includes('application/pdf') || raw.subarray(0, 5).toString('latin1') === '%PDF-')
      return this.add({ name: pathName.toLowerCase().endsWith('.pdf') ? pathName : `${pathName || 'document'}.pdf`, bytes: result.bytes, addedBy, sourceUrl: result.url, kind: 'pdf' })
    const decoded = new TextDecoder().decode(result.bytes)
    const html = result.contentType.includes('html') || /<html/i.test(decoded)
    const title = html ? htmlToText(decoded.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').slice(0, 200) : ''
    const text = html ? htmlToText(decoded) : decoded
    if (!text.trim()) throw new StudioError('这个链接没有可读的正文', 400)
    return this.add({ name: `${safeName(title || pathName || 'page').replace(/\.[^.]+$/, '')}.txt`, bytes: Buffer.from(text), addedBy, sourceUrl: result.url,
      kind: 'web', mediaType: 'text/plain', title: title || undefined })
  }

  private bySha(sha256: string): LibraryItem | undefined {
    const row = this.db.prepare('SELECT * FROM library_items WHERE sha256 = ?').get(sha256)
    return row ? libraryItem(row) : undefined
  }
}

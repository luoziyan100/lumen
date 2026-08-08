/**
 * [INPUT]: Node zlib(inflateRaw);docx = ZIP+OOXML
 * [OUTPUT]: extractDocxText —— bytes→纯文本(段落);无第三方依赖
 * [POS]: 摄取解析(模式 A,见 doc/document-ingest.md);被 saveUpload / 可选工具调用
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { inflateRawSync } from 'node:zlib'

const ZIP_LOCAL = 0x04034b50
const ZIP_STORED = 0
const ZIP_DEFLATE = 8
const MAX_ENTRIES = 256
const MAX_UNCOMPRESSED = 8 * 1024 * 1024
const MAX_TEXT_CHARS = 200_000

interface ZipEntry {
  name: string
  method: number
  compressedSize: number
  uncompressedSize: number
  dataStart: number
}

function listLocalEntries(buf: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = []
  let pos = 0
  while (pos + 30 <= buf.length && entries.length < MAX_ENTRIES) {
    if (buf.readUInt32LE(pos) !== ZIP_LOCAL) {
      pos += 1
      continue
    }
    const method = buf.readUInt16LE(pos + 8)
    const compressedSize = buf.readUInt32LE(pos + 18)
    const uncompressedSize = buf.readUInt32LE(pos + 22)
    const nameLen = buf.readUInt16LE(pos + 26)
    const extraLen = buf.readUInt16LE(pos + 28)
    const nameStart = pos + 30
    const nameEnd = nameStart + nameLen
    const dataStart = nameEnd + extraLen
    if (nameEnd > buf.length || dataStart + compressedSize > buf.length) break
    const name = buf.slice(nameStart, nameEnd).toString('utf8')
    entries.push({ name, method, compressedSize, uncompressedSize, dataStart })
    pos = dataStart + compressedSize
  }
  return entries
}

function inflateEntry(buf: Buffer, e: ZipEntry): Buffer {
  if (e.uncompressedSize > MAX_UNCOMPRESSED) {
    throw new Error(`docx 条目过大: ${e.name}`)
  }
  const slice = buf.slice(e.dataStart, e.dataStart + e.compressedSize)
  if (e.method === ZIP_STORED) return slice
  if (e.method === ZIP_DEFLATE) return inflateRawSync(slice)
  throw new Error(`docx 不支持的压缩方式 ${e.method}: ${e.name}`)
}

function xmlToParagraphs(xml: string): string[] {
  const paras: string[] = []
  const pRe = new RegExp('<w:p[\\s>][\\s\\S]*?</w:p>', 'g')
  let m: RegExpExecArray | null
  while ((m = pRe.exec(xml))) {
    const texts: string[] = []
    const tRe = new RegExp('<w:t[^>]*>([^<]*)</w:t>', 'g')
    let t: RegExpExecArray | null
    while ((t = tRe.exec(m[0]))) texts.push(t[1])
    // 简单实体
    const line = texts
      .join('')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
    paras.push(line)
  }
  return paras
}

/** 从 docx 字节抽出正文;失败抛错 */
export function extractDocxText(bytes: Uint8Array): string {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  if (buf.length < 4 || buf.readUInt32LE(0) !== ZIP_LOCAL) {
    // 有的文件中央目录在前扫描仍可能找到 local;宽松扫一遍
  }
  const entries = listLocalEntries(buf)
  const doc = entries.find((e) => e.name === 'word/document.xml' || e.name.endsWith('/word/document.xml'))
  if (!doc) throw new Error('docx 内无 word/document.xml')
  const xml = inflateEntry(buf, doc).toString('utf8')
  const paras = xmlToParagraphs(xml)
  let text = paras.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  if (text.length > MAX_TEXT_CHARS) text = `${text.slice(0, MAX_TEXT_CHARS)}\n\n…(已截断)`
  if (!text) throw new Error('docx 无可抽取文本')
  return text
}

/** 抽出稿 Markdown 头 + 正文 */
export function docxExtractMarkdown(filename: string, text: string): string {
  return [
    `# ${filename}`,
    '',
    '> 由 Lumen 摄取解析自动抽出(见 doc/document-ingest.md)。原件在 uploads/。',
    '',
    text,
    '',
  ].join('\n')
}

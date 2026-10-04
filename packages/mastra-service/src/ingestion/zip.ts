/**
 * [INPUT]: ZIP 字节与 Node zlib，读取 OOXML 中的指定成员
 * [OUTPUT]: readZipEntry：验证中央目录/CRC，支持 stored/deflate 和 data descriptor
 * [POS]: DOCX 容器解析；只解压指定成员到内存，不信任声明的解压大小
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createInflateRaw, crc32 } from 'node:zlib'

const MAX_ENTRIES = 2048
export const MAX_XML_BYTES = 8 * 1024 * 1024
interface Entry { name: string; method: number; flags: number; size: number; compressed: number; crc: number; offset: number }

function directory(bytes: Buffer): { offset: number; length: number; count: number } {
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) {
    if (bytes.readUInt32LE(at) !== 0x06054b50 || at + 22 + bytes.readUInt16LE(at + 20) !== bytes.length) continue
    const count = bytes.readUInt16LE(at + 10), length = bytes.readUInt32LE(at + 12), offset = bytes.readUInt32LE(at + 16)
    if (bytes.readUInt16LE(at + 4) || bytes.readUInt16LE(at + 6) || bytes.readUInt16LE(at + 8) !== count) throw new Error('不支持分卷 ZIP')
    if (!count || count > MAX_ENTRIES || offset + length > at) throw new Error('ZIP 中央目录范围或条目数量无效')
    return { offset, length, count }
  }
  throw new Error('DOCX 缺少有效 ZIP 中央目录')
}

function findEntry(bytes: Buffer, name: string): { entry: Entry; central: number } {
  const table = directory(bytes)
  let at = table.offset, selected: Entry | undefined
  const names = new Set<string>()
  for (let index = 0; index < table.count; index++) {
    if (at + 46 > table.offset + table.length || bytes.readUInt32LE(at) !== 0x02014b50) throw new Error('ZIP 中央目录条目损坏')
    const nameLength = bytes.readUInt16LE(at + 28), length = 46 + nameLength + bytes.readUInt16LE(at + 30) + bytes.readUInt16LE(at + 32)
    if (at + length > table.offset + table.length) throw new Error('ZIP 条目越界')
    const entry: Entry = { name: bytes.subarray(at + 46, at + 46 + nameLength).toString('utf8'), flags: bytes.readUInt16LE(at + 8), method: bytes.readUInt16LE(at + 10),
      crc: bytes.readUInt32LE(at + 16), compressed: bytes.readUInt32LE(at + 20), size: bytes.readUInt32LE(at + 24), offset: bytes.readUInt32LE(at + 42) }
    if (names.has(entry.name)) throw new Error('ZIP 含重名条目')
    names.add(entry.name)
    if (entry.name === name) selected = entry
    at += length
  }
  if (at !== table.offset + table.length) throw new Error('ZIP 中央目录长度不一致')
  if (!selected) throw new Error(`DOCX 缺少 ${name}`)
  return { entry: selected, central: table.offset }
}

function compressedBytes(bytes: Buffer, entry: Entry, central: number): Buffer {
  const at = entry.offset
  if (entry.flags & 1) throw new Error('不支持加密 DOCX')
  if (entry.size > MAX_XML_BYTES || entry.compressed === 0xffffffff || at === 0xffffffff) throw new Error('DOCX 条目超过解压上限或使用 ZIP64')
  if (at + 30 > central || bytes.readUInt32LE(at) !== 0x04034b50) throw new Error('ZIP 本地文件头损坏')
  const nameLength = bytes.readUInt16LE(at + 26), start = at + 30 + nameLength + bytes.readUInt16LE(at + 28)
  if (start + entry.compressed > central || bytes.readUInt16LE(at + 8) !== entry.method || bytes.readUInt16LE(at + 6) !== entry.flags) throw new Error('ZIP 本地文件头与中央目录不一致')
  if (bytes.subarray(at + 30, at + 30 + nameLength).toString('utf8') !== entry.name) throw new Error('ZIP 本地文件名不一致')
  return bytes.subarray(start, start + entry.compressed)
}

async function inflate(bytes: Buffer, signal?: AbortSignal): Promise<Buffer> {
  signal?.throwIfAborted()
  const inflater = createInflateRaw()
  const abort = () => inflater.destroy(signal?.reason instanceof Error ? signal.reason : new Error('DOCX extraction cancelled'))
  signal?.addEventListener('abort', abort, { once: true })
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = []; let size = 0
      inflater.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > MAX_XML_BYTES) inflater.destroy(new Error('DOCX 实际解压内容超过上限'))
        else chunks.push(chunk)
      })
      inflater.once('error', reject); inflater.once('end', () => resolve(Buffer.concat(chunks, size)))
      inflater.end(bytes)
    })
  } finally { signal?.removeEventListener('abort', abort); inflater.destroy() }
}

export async function readZipEntry(input: Uint8Array, name: string, signal?: AbortSignal): Promise<Buffer> {
  signal?.throwIfAborted()
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input)
  const { entry, central } = findEntry(bytes, name)
  const compressed = compressedBytes(bytes, entry, central)
  if (entry.method !== 0 && entry.method !== 8) throw new Error(`不支持 ZIP 压缩方式 ${entry.method}`)
  const output = entry.method === 0 ? compressed : await inflate(compressed, signal)
  signal?.throwIfAborted()
  if (output.length !== entry.size || crc32(output) !== entry.crc) throw new Error('DOCX 条目大小或 CRC 校验失败')
  return output
}

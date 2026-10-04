/**
 * [INPUT]: 已受工作区权限和字节上限约束的图像字节
 * [OUTPUT]: imageInfo：真实媒体类型、宽高、内容指纹与可持久化图像引用
 * [POS]: 当前模型多模态输入前的格式边界；不调用外部视觉服务或按扩展名猜测
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { crc32 } from 'node:zlib'
import { createHash } from 'node:crypto'
import { z } from 'zod'

export interface ImageInfo { mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'; width: number; height: number }
const MAX_PIXELS = 32_000_000
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const imageReferenceSchema = z.object({
  path: z.string().min(1), focus: z.string().max(2000).optional(),
  mediaType: z.enum(['image/png', 'image/jpeg', 'image/gif', 'image/webp']),
  width: z.number().int().positive(), height: z.number().int().positive(),
  bytes: z.number().int().positive().max(MAX_IMAGE_BYTES), sha256: z.string().regex(/^[a-f0-9]{64}$/),
})
export type ImageReference = z.infer<typeof imageReferenceSchema>
export const imageDigest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

function png(bytes: Buffer): ImageInfo {
  if (bytes.length < 33 || bytes.toString('ascii', 12, 16) !== 'IHDR' || bytes.readUInt32BE(8) !== 13) throw new Error('PNG 缺少有效 IHDR')
  let end = false
  for (let at = 8; at + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(at), next = at + 12 + length
    if (next > bytes.length) throw new Error('PNG 数据块越界')
    if (crc32(bytes.subarray(at + 4, next - 4)) !== bytes.readUInt32BE(next - 4)) throw new Error('PNG 数据块 CRC 无效')
    if (bytes.toString('ascii', at + 4, at + 8) === 'IEND') { end = next === bytes.length; break }
    at = next
  }
  if (!end) throw new Error('PNG 缺少完整结束块')
  return { mediaType: 'image/png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

function jpeg(bytes: Buffer): ImageInfo {
  if (bytes.length < 4 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9) throw new Error('JPEG 文件不完整')
  let at = 2
  while (at + 4 < bytes.length) {
    if (bytes[at++] !== 0xff) throw new Error('JPEG 标记无效')
    while (bytes[at] === 0xff) at++
    const marker = bytes[at++], length = bytes.readUInt16BE(at)
    if (length < 2 || at + length > bytes.length) throw new Error('JPEG 数据段越界')
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 8) throw new Error('JPEG 帧头无效')
      return { mediaType: 'image/jpeg', height: bytes.readUInt16BE(at + 3), width: bytes.readUInt16BE(at + 5) }
    }
    at += length
  }
  throw new Error('JPEG 缺少图像尺寸')
}

function webp(bytes: Buffer): ImageInfo {
  if (bytes.length < 30 || bytes.readUInt32LE(4) + 8 !== bytes.length) throw new Error('WebP 文件长度无效')
  const type = bytes.toString('ascii', 12, 16), size = bytes.readUInt32LE(16)
  if (20 + size > bytes.length) throw new Error('WebP 数据块越界')
  if (type === 'VP8X' && size >= 10) return { mediaType: 'image/webp', width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 }
  if (type === 'VP8L' && size >= 5 && bytes[20] === 0x2f) {
    const dimensions = bytes.readUInt32LE(21)
    return { mediaType: 'image/webp', width: (dimensions & 0x3fff) + 1, height: ((dimensions >>> 14) & 0x3fff) + 1 }
  }
  if (type === 'VP8 ' && size >= 10 && bytes.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a]))) {
    return { mediaType: 'image/webp', width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff }
  }
  throw new Error('WebP 图像头无效')
}

export function imageInfo(bytes: Buffer): ImageInfo {
  let info: ImageInfo
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) info = png(bytes)
  else if (bytes.length >= 2 && bytes.readUInt16BE(0) === 0xffd8) info = jpeg(bytes)
  else if (bytes.length >= 14 && /^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6)) && bytes.at(-1) === 0x3b) info = { mediaType: 'image/gif', width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) }
  else if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') info = webp(bytes)
  else throw new Error('只支持有效的 PNG、JPEG、GIF 或 WebP 图像')
  if (!info.width || !info.height || info.width * info.height > MAX_PIXELS) throw new Error('图像尺寸无效或超过 3200 万像素')
  return info
}

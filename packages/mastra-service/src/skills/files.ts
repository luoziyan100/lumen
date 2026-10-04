/**
 * [INPUT]: node:fs/promises 与显式文件根；不访问隐式用户目录
 * [OUTPUT]: SKILL_BYTES/PACKAGE_BYTES及containedPath/readText/copyPackage/publishPackage/serializeRoot
 * [POS]: 技能文件安全边界；安装拒绝符号链接、特殊文件和无界目录树，发布失败恢复旧包
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { constants } from 'node:fs'
import { lstat, open, readdir, realpath, mkdir, rename, rm, chmod } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'

export const SKILL_BYTES = 80_000
export const PACKAGE_BYTES = 32 * 1024 * 1024
const locks = new Map<string, Promise<unknown>>()

export function inside(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

export async function containedPath(root: string, input: string): Promise<string> {
  if (!input || isAbsolute(input) || input.includes('\0')) throw new Error('路径必须是根内的相对路径')
  const base = await realpath(root)
  const lexical = resolve(base, input)
  if (!inside(base, lexical)) throw new Error('拒绝路径越界')
  const actual = await realpath(lexical)
  if (!inside(base, actual)) throw new Error('拒绝符号链接路径越界')
  return actual
}

async function readBytes(file: string, max: number): Promise<Buffer> {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await handle.stat()
    if (!stat.isFile()) throw new Error('仅支持普通文件')
    if (stat.size > max) throw new Error(`文件超过 ${max} 字节上限`)
    const buffer = Buffer.alloc(Math.min(stat.size + 1, max + 1))
    let offset = 0
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset)
      if (!bytesRead) break
      offset += bytesRead
    }
    if (offset > max || offset !== stat.size) throw new Error('文件大小在读取期间改变')
    return buffer.subarray(0, offset)
  } finally { await handle.close() }
}

export async function readText(file: string, max = SKILL_BYTES): Promise<string> {
  const buffer = await readBytes(file, max)
  if (buffer.includes(0)) throw new Error('技能文本文件包含二进制内容')
  return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
}

export async function copyPackage(source: string, destination: string): Promise<void> {
  const budget = { bytes: 0, files: 0 }
  const copy = async (from: string, to: string, depth: number): Promise<void> => {
    if (++budget.files > 4096 || depth > 32) throw new Error('技能包目录规模超过上限')
    const stat = await lstat(from)
    if (stat.isSymbolicLink()) throw new Error('安装包不得包含符号链接')
    if (stat.isDirectory()) {
      await mkdir(to, { mode: 0o700 })
      for (const entry of await readdir(from)) await copy(join(from, entry), join(to, entry), depth + 1)
      return
    }
    if (!stat.isFile()) throw new Error('安装包不得包含特殊文件')
    const bytes = await readBytes(from, PACKAGE_BYTES - budget.bytes)
    budget.bytes += bytes.byteLength
    const output = await open(to, 'wx', 0o600)
    try { await output.writeFile(bytes) } finally { await output.close() }
    await chmod(to, 0o600 | (stat.mode & 0o100))
  }
  await copy(source, destination, 0)
}

export async function serializeRoot<T>(root: string, operation: () => Promise<T>): Promise<T> {
  const previous = locks.get(root) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(operation)
  locks.set(root, current)
  try { return await current } finally { if (locks.get(root) === current) locks.delete(root) }
}

export async function publishPackage(staging: string, destination: string): Promise<void> {
  const backup = join(destination, '..', `.backup-${randomUUID()}`)
  let oldPackage = false
  try { await rename(destination, backup); oldPackage = true }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  try { await rename(staging, destination) }
  catch (error) { if (oldPackage) await rename(backup, destination); throw error }
  if (oldPackage) await rm(backup, { recursive: true, force: true })
}

/**
 * [INPUT]: Node 文件系统、显式绝对路径和待发布内容
 * [OUTPUT]: privateDirectory、readPrivateFile、writePrivateFile、preparePrivateLog
 * [POS]: deployment 的磁盘边界；私有文件只经原子替换发布，不跟随链接改写外部 inode
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { constants, type Stats } from 'node:fs'
import { lstat, mkdir, open, rename, unlink } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DeploymentError } from './types.ts'

export function assertPrivate(stat: Stats, directory = false) {
  if (stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0) throw new DeploymentError('Deployment path must be private and owned by this user')
  if (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1) throw new DeploymentError('Deployment path must not be a link or special file')
}

export async function privateDirectory(path: string) {
  if (!isAbsolute(path)) throw new DeploymentError('Deployment paths must be absolute')
  await mkdir(path, { recursive: true, mode: 0o700 })
  assertPrivate(await lstat(path), true)
}

export async function readPrivateFile(path: string): Promise<string | null> {
  let handle
  try { handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
  try {
    const stat = await handle.stat()
    assertPrivate(stat)
    if (stat.size > 64 * 1024) throw new DeploymentError('Deployment metadata is too large')
    return await handle.readFile('utf8')
  } finally { await handle.close() }
}

export async function writePrivateFile(path: string, content: string) {
  await readPrivateFile(path)
  const temporary = join(dirname(path), `.${randomUUID()}.tmp`)
  const handle = await open(temporary, 'wx', 0o600)
  try {
    await handle.writeFile(content)
    await handle.sync()
    await rename(temporary, path)
  } finally {
    await handle.close()
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error })
  }
}

export async function preparePrivateLog(path: string) {
  const handle = await open(path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600)
  try { assertPrivate(await handle.stat()) }
  finally { await handle.close() }
}

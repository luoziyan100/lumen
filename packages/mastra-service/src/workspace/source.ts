/**
 * [INPUT]: 项目内私有 source.json、显式绑定的外部资料目录
 * [OUTPUT]: sourcePath、readSourceBinding、setSourceBinding、removeSourceBinding 与可识别错误
 * [POS]: 外部资料的显式只读绑定；元文件私有原子保存，外部目录只验证、不复制或修改
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { constants } from 'node:fs'
import { access, lstat, mkdir, open, realpath, rename, stat, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import { z } from 'zod'
import type { ProjectSource } from '../catalog/types.ts'

const binding = z.object({ version: z.literal(1), path: z.string().refine(isAbsolute), readOnly: z.literal(true) }).strict()
export class SourceUnavailable extends Error {}
export class SourceBindingError extends Error {
  readonly status: 400 | 409
  constructor(message: string, status: 400 | 409 = 409) { super(message); this.status = status }
}

async function metadata(projectRoot: string): Promise<string | null> {
  if (!isAbsolute(projectRoot)) throw new SourceBindingError('项目目录必须使用绝对路径')
  const project = await lstat(projectRoot).catch(error => { if (error.code === 'ENOENT') return null; throw error })
  if (!project) return null
  if (!project.isDirectory() || project.uid !== process.getuid?.()) throw new SourceBindingError('项目目录必须归当前用户所有且不能是链接')
  let file
  try { file = await open(join(projectRoot, 'source.json'), constants.O_RDONLY | constants.O_NOFOLLOW) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new SourceBindingError('资料绑定文件不可安全读取')
  }
  try {
    const info = await file.stat()
    if (!info.isFile() || info.nlink !== 1 || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0 || info.size > 8192)
      throw new SourceBindingError('资料绑定文件必须私有、归当前用户所有且不能是链接')
    return await file.readFile('utf8')
  } finally { await file.close() }
}

export async function readSourceBinding(projectRoot: string): Promise<ProjectSource> {
  const raw = await metadata(projectRoot)
  if (raw === null) return { path: null, readOnly: true }
  try { return { path: binding.parse(JSON.parse(raw)).path, readOnly: true } }
  catch { throw new SourceBindingError('资料绑定配置无效，请重新设置或移除') }
}

async function directory(path: string): Promise<string> {
  if (!isAbsolute(path)) throw new SourceBindingError('资料路径必须是绝对路径', 400)
  try {
    const canonical = await realpath(path)
    if (!(await stat(canonical)).isDirectory()) throw new Error('Not a directory')
    await access(canonical, constants.R_OK | constants.X_OK)
    return canonical
  } catch { throw new SourceBindingError('资料路径不存在、不可访问或不是目录', 400) }
}

export async function sourcePath(projectRoot: string): Promise<string> {
  const source = await readSourceBinding(projectRoot)
  if (!source.path) throw new SourceUnavailable('项目尚未绑定外部资料')
  if (await directory(source.path) !== source.path) throw new SourceBindingError('资料路径已变化，请重新确认绑定')
  return source.path
}

export async function setSourceBinding(projectRoot: string, path: string): Promise<ProjectSource> {
  const canonical = await directory(path)
  if (!isAbsolute(projectRoot)) throw new SourceBindingError('项目目录必须使用绝对路径')
  await mkdir(projectRoot, { recursive: true, mode: 0o700 })
  const project = await lstat(projectRoot)
  if (!project.isDirectory() || project.uid !== process.getuid?.()) throw new SourceBindingError('项目目录必须归当前用户所有且不能是链接')
  await metadata(projectRoot)
  const temporary = join(projectRoot, `.source-${randomUUID()}.tmp`)
  const file = await open(temporary, 'wx', 0o600)
  try {
    await file.writeFile(JSON.stringify({ version: 1, path: canonical, readOnly: true }) + '\n')
    await file.sync()
    await metadata(projectRoot)
    await rename(temporary, join(projectRoot, 'source.json'))
  } finally {
    await file.close()
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error })
  }
  return { path: canonical, readOnly: true }
}

export async function removeSourceBinding(projectRoot: string): Promise<ProjectSource> {
  if (await metadata(projectRoot) !== null) await unlink(join(projectRoot, 'source.json'))
  return { path: null, readOnly: true }
}

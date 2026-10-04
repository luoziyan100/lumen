/**
 * [INPUT]: 显式源/目标根、Node 文件系统与 SHA256
 * [OUTPUT]: 安全根解析、源清单、校验复制和档案只读封存
 * [POS]: 离线迁移的文件边界；不跟随源内链接，不在源树创建 SQLite 辅助文件
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { chmod, copyFile, lstat, mkdir, readdir, realpath, rm } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { MigrationIssue, SourceFile } from './types.ts'

export function inside(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}

async function canonical(path: string): Promise<string> {
  try { return await realpath(path) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    const parent = dirname(path)
    if (parent === path) throw error
    return join(await canonical(parent), basename(path))
  }
}

export async function migrationRoots(source: string, target: string) {
  if (!isAbsolute(source) || !isAbsolute(target)) throw new Error('Migration roots must be absolute')
  const sourceRoot = await realpath(source), targetRoot = await canonical(resolve(target))
  if (inside(sourceRoot, targetRoot) || inside(targetRoot, sourceRoot)) throw new Error('Migration roots must not overlap')
  if (!(await lstat(sourceRoot)).isDirectory()) throw new Error('Source root must be a directory')
  return { sourceRoot, targetRoot }
}

export async function digest(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

export function fingerprint(files: SourceFile[]): string {
  return createHash('sha256').update(JSON.stringify(files)).digest('hex')
}

export async function scanSource(root: string) {
  const files: SourceFile[] = [], issues: MigrationIssue[] = []
  async function visit(directory: string) {
    const names = (await readdir(directory)).sort()
    for (const name of names) {
      const path = join(directory, name), stat = await lstat(path)
      const rel = relative(root, path).split(sep).join('/')
      if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) {
        issues.push({ severity: 'error', code: 'unsupported_file', path: rel, message: 'Symbolic links and special files require explicit resolution before migration' })
        continue
      }
      files.push({ path: rel, kind: stat.isDirectory() ? 'directory' : 'file', size: stat.isFile() ? stat.size : 0,
        mode: stat.mode & 0o777, ...(stat.isFile() ? { sha256: await digest(path) } : {}) })
      if (stat.isDirectory()) await visit(path)
    }
  }
  await visit(root)
  return { files, issues }
}

export async function copyVerified(sourceRoot: string, targetRoot: string, file: SourceFile, destination = file.path) {
  const source = join(sourceRoot, file.path), target = join(targetRoot, destination)
  if (!inside(sourceRoot, source) || !inside(targetRoot, target)) throw new Error('Migration file path escaped root')
  const sourceStat = await lstat(source)
  if (sourceStat.isSymbolicLink() || !inside(sourceRoot, await realpath(source))) throw new Error('Source path changed during migration')
  if (file.kind === 'directory') { await mkdir(target, { recursive: true, mode: 0o700 }); return }
  if (!sourceStat.isFile() || await digest(source) !== file.sha256) throw new Error('Source file changed during migration')
  await mkdir(dirname(target), { recursive: true, mode: 0o700 })
  await copyFile(source, target)
  await chmod(target, 0o600)
  if (await digest(target) !== file.sha256) throw new Error('Copied file failed integrity check')
}

export async function treePermissions(root: string, readOnly: boolean): Promise<void> {
  await chmod(root, 0o700)
  for (const name of await readdir(root)) {
    const path = join(root, name), stat = await lstat(path)
    if (stat.isSymbolicLink()) continue
    if (stat.isDirectory()) await treePermissions(path, readOnly)
    else await chmod(path, readOnly ? 0o400 : 0o600)
  }
  if (readOnly) await chmod(root, 0o500)
}

export async function removeStaging(root: string): Promise<void> {
  await treePermissions(root, false)
  await rm(root, { recursive: true, force: true })
}

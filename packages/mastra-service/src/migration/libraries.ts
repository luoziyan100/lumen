/**
 * [INPUT]: 项目原 source_path、显式 copy/bind 映射与安全文件扫描
 * [OUTPUT]: inspectLibraries、copyLibraries、verifyLibraries、libraryIdentity
 * [POS]: 外部资料授权边界；只接受 canonical 等于旧配置的路径，绑定不冒称已归档原件
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { access, chmod, lstat, mkdir, realpath, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { tmpdir } from 'node:os'
import { copyVerified, fingerprint, inside, scanSource } from './files.ts'
import type { LegacyProject, LibraryMapping, MigrationIssue, MigrationOptions, ProjectMapping } from './types.ts'

export async function inspectLibraries(options: MigrationOptions, projects: LegacyProject[], mapped: ProjectMapping[], roots: { sourceRoot: string; targetRoot: string }) {
  const libraries: LibraryMapping[] = [], issues: MigrationIssue[] = []
  const requested = options.libraries ?? []
  for (const option of requested) if (!projects.some(project => project.id === option.projectId && project.source_path))
    issues.push({ severity: 'error', code: 'unknown_source_mapping', message: `Source mapping has no configured legacy project: ${option.projectId}` })
  for (const project of projects.filter(project => project.source_path)) {
    const matches = requested.filter(option => option.projectId === project.id)
    if (matches.length !== 1) {
      issues.push({ severity: 'error', code: matches.length ? 'duplicate_source_mapping' : 'external_library', path: project.source_path!,
        message: matches.length ? 'Each project source requires exactly one copy or bind choice' : 'Legacy source library requires an explicit copy or bind mapping' })
      continue
    }
    const option = matches[0]!
    try {
      if (!['copy', 'bind'].includes(option.mode) || !isAbsolute(option.sourcePath) || !isAbsolute(project.source_path!)) throw new Error('Invalid mapping')
      const configured = await realpath(project.source_path!), sourceRoot = await realpath(option.sourcePath)
      if (configured !== sourceRoot) throw new Error('Source mapping does not match the old project source_path')
      if (!(await lstat(sourceRoot)).isDirectory()) throw new Error('Mapped source must be a directory')
      if (inside(sourceRoot, roots.targetRoot) || inside(roots.targetRoot, sourceRoot) || inside(sourceRoot, roots.sourceRoot)) throw new Error('Mapped source overlaps migration roots')
      if (option.mode === 'copy' && inside(sourceRoot, tmpdir())) throw new Error('Copied source must not contain migration scratch space')
      await access(sourceRoot, constants.R_OK)
      const projectId = mapped.find(item => item.sourceId === project.id)!.projectId
      const scanned = option.mode === 'copy' ? await scanSource(sourceRoot) : { files: [], issues: [] }
      issues.push(...scanned.issues.map(issue => ({ ...issue, path: join(sourceRoot, issue.path ?? '') })))
      libraries.push({ sourceProjectId: project.id, projectId, sourceRoot, mode: option.mode,
        scope: option.mode === 'copy' ? 'shared' : 'source', target: `projects/${projectId}/${option.mode === 'copy' ? 'shared/library' : 'source'}`,
        externalFilesArchived: option.mode === 'copy', files: scanned.files,
        ...(option.mode === 'copy' ? { fingerprint: fingerprint(scanned.files) } : {}) })
      if (option.mode === 'bind') issues.push({ severity: 'warning', code: 'external_source_bound', path: sourceRoot,
        message: 'Existing project source will remain an explicit read-only external binding; its files are not copied or archived' })
    } catch (error) {
      issues.push({ severity: 'error', code: 'invalid_source_mapping', path: option.sourcePath,
        message: error instanceof Error && !('code' in error) ? error.message : 'Configured source cannot be safely read' })
    }
  }
  return { libraries, issues }
}

export function libraryIdentity(libraries: LibraryMapping[] = []) {
  return JSON.stringify(libraries.map(({ sourceProjectId, sourceRoot, mode, target, fingerprint }) => ({ sourceProjectId, sourceRoot, mode, target, fingerprint })))
}

export async function copyLibraries(stage: string, archive: string, libraries: LibraryMapping[]) {
  for (const library of libraries) {
    if (library.mode === 'bind') {
      const project = join(stage, 'projects', library.projectId)
      await mkdir(project, { recursive: true, mode: 0o700 })
      await writeFile(join(project, 'source.json'), JSON.stringify({ version: 1, path: library.sourceRoot, readOnly: true }) + '\n', { mode: 0o600 })
      continue
    }
    const archived = join(archive, 'libraries', library.projectId)
    await mkdir(archived, { recursive: true, mode: 0o700 })
    await mkdir(join(stage, library.target), { recursive: true, mode: 0o700 })
    for (const file of library.files) {
      await copyVerified(library.sourceRoot, archived, file)
      await copyVerified(archived, stage, file, `${library.target}/${file.path}`)
      if (file.kind === 'file') await chmod(join(stage, library.target, file.path), 0o600 | (file.mode & 0o100))
    }
  }
}

export async function verifyLibraries(libraries: LibraryMapping[]) {
  for (const library of libraries) {
    if (await realpath(library.sourceRoot) !== library.sourceRoot) throw new Error('External source path changed during migration')
    if (library.mode === 'bind') { await access(library.sourceRoot, constants.R_OK); continue }
    const current = await scanSource(library.sourceRoot)
    if (current.issues.length || fingerprint(current.files) !== library.fingerprint) throw new Error('External source changed during migration')
  }
}

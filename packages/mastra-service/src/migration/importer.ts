/**
 * [INPUT]: 迁移计划、显式外部资料映射、catalog、公开 Memory storage、设置导入与校验复制
 * [OUTPUT]: importLegacyData：dry-run 报告或原子发布的独立 Mastra 数据根
 * [POS]: 离线一次性导入组合；原生存储保留正文空白，Memory 核对身份/内容并初始化已读游标，不执行历史工具
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { chmod, mkdir, mkdtemp, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { Memory } from '@mastra/memory'
import { LibSQLStore } from '@mastra/libsql'
import { createCatalog } from '../catalog/catalog.ts'
import { ProjectStore } from '../catalog/projects.ts'
import { openSettingsStore } from '../settings/store.ts'
import { copyVerified, fingerprint, removeStaging, scanSource, treePermissions } from './files.ts'
import { inspectLegacy } from './source.ts'
import { copyLibraries, libraryIdentity, verifyLibraries } from './libraries.ts'
import type { MigrationOptions, MigrationPlan, MigrationReport } from './types.ts'

export class MigrationBlockedError extends Error {
  readonly report: MigrationReport
  constructor(report: MigrationReport) { super('Migration has unresolved blockers; target was not published'); this.report = report }
}

async function priorImport(targetRoot: string): Promise<MigrationReport | undefined> {
  let names: string[]
  try { names = await readdir(targetRoot) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw new Error('Target root must be a directory')
  }
  if (!names.length) return undefined
  try {
    const report = JSON.parse(await readFile(join(targetRoot, 'migration.json'), 'utf8')) as MigrationReport
    if (report.version === 1 && report.ready && !report.dryRun && typeof report.sourceFingerprint === 'string') return report
  } catch { /* 非空目标只有已完成的同源导入才允许读取确认 */ }
  throw new Error('Target root must be empty or contain a completed import of the same source')
}

async function copyArchive(stage: string, plan: MigrationPlan) {
  const archive = join(stage, 'archive', 'legacy-v1'), root = join(archive, 'source')
  await mkdir(root, { recursive: true, mode: 0o700 })
  for (const file of plan.report.files) await copyVerified(plan.report.sourceRoot, root, file)
  await writeFile(join(archive, 'events.jsonl'), plan.events.map(event => JSON.stringify(event)).join('\n') + '\n', { mode: 0o600 })
  const byPath = new Map(plan.report.files.map(file => [file.path, file]))
  for (const material of plan.report.materials) {
    const file = byPath.get(material.source)!
    await copyVerified(root, stage, file, material.target)
    if (file.kind === 'file') await chmod(join(stage, material.target), 0o600 | (file.mode & 0o100))
  }
  if (byPath.has('settings.json')) {
    const settings = await openSettingsStore({ dataRoot: stage })
    try { await settings.importLegacy({ path: join(root, 'settings.json') }) } finally { await settings.close() }
  }
  await copyLibraries(stage, archive, plan.report.libraries)
  return archive
}

async function importSessions(stage: string, plan: MigrationPlan) {
  const storage = new LibSQLStore({ id: 'lumen-import', url: `file:${join(stage, 'mastra.sqlite')}` })
  await storage.init()
  const memory = new Memory({ storage, options: { lastMessages: 100, semanticRecall: false, workingMemory: { enabled: false } } })
  const catalog = createCatalog(stage, memory)
  try {
    const messageStore = await storage.getStore('memory')
    if (!messageStore) throw new Error('Native message storage is unavailable')
    for (const project of plan.projects) {
      const mapped = plan.report.projects.find(item => item.sourceId === project.id)!
      if (mapped.projectId === 'default') await catalog.updateProject('default', { name: project.name || '默认' })
      else await catalog.createProject(project.name || project.id, mapped.projectId)
    }
    for (const task of plan.tasks) {
      const mapped = plan.report.sessions.find(item => item.sourceId === task.id)!
      await catalog.createSession(mapped.projectId, mapped.taskId, task.title || task.goal || '历史研究')
      await catalog.updateSession(mapped.projectId, mapped.taskId, { pinned: !!task.pinned_at, archived: !!task.archived_at })
      const messages = plan.messages.get(task.id)!
      if (messages.length) await messageStore.saveMessages({ messages })
      const thread = await memory.getThreadById({ threadId: mapped.threadId })
      if (!thread) throw new Error('Imported thread was not persisted')
      await memory.saveThread({ thread: { ...thread, createdAt: new Date(task.created_at), updatedAt: new Date(task.updated_at),
        metadata: { ...thread.metadata, legacy: { version: 1, taskId: task.id, projectId: task.project_id, status: task.status,
          archive: 'archive/legacy-v1', sourceFingerprint: plan.report.sourceFingerprint } } } })
      const stored = await memory.recall({ threadId: mapped.threadId, resourceId: mapped.threadId, perPage: false })
      const storedById = new Map(stored.messages.map(message => [message.id, message]))
      if (stored.messages.length !== messages.length || messages.some(message => {
        const saved = storedById.get(message.id)
        return !saved || saved.role !== message.role || saved.createdAt.getTime() !== message.createdAt.getTime() || !isDeepStrictEqual(saved.content, message.content)
      }))
        throw new Error(`Imported thread ${mapped.threadId}: expected ${messages.length} original messages, recalled ${stored.messages.length}`)
      const latest = stored.messages.at(-1)
      if (latest) await catalog.markSessionRead(mapped.projectId, mapped.taskId, latest.id)
    }
    for (const project of plan.projects) if (project.archived_at) {
      const mapped = plan.report.projects.find(item => item.sourceId === project.id)!
      if (mapped.projectId !== 'default') await catalog.updateProject(mapped.projectId, { archived: true })
    }
  } finally { await catalog.close(); await memory.settled(); await storage.close() }
}

function restoreProjectTimestamps(stage: string, plan: MigrationPlan) {
  const projects = new ProjectStore(stage)
  try {
    for (const project of plan.report.projects) projects.restoreTimestamps(project.projectId, project)
  } finally { projects.close() }
}

export async function importLegacyData(options: MigrationOptions): Promise<MigrationReport> {
  const plan = await inspectLegacy(options)
  const previous = await priorImport(plan.report.targetRoot)
  if (previous) {
    if (previous.sourceFingerprint !== plan.report.sourceFingerprint) throw new Error('Target contains an import of a different source snapshot')
    if (libraryIdentity(previous.libraries) !== libraryIdentity(plan.report.libraries)) throw new Error('Target contains a different external source mapping or snapshot')
    if (!plan.report.ready) {
      if (options.dryRun === false) throw new MigrationBlockedError(plan.report)
      return { ...plan.report, alreadyImported: true }
    }
    return { ...previous, dryRun: options.dryRun !== false, alreadyImported: true }
  }
  if (options.dryRun !== false) return plan.report
  if (!plan.report.ready) throw new MigrationBlockedError(plan.report)
  await mkdir(dirname(plan.report.targetRoot), { recursive: true, mode: 0o700 })
  const stage = await mkdtemp(join(dirname(plan.report.targetRoot), `.${basename(plan.report.targetRoot)}-import-`))
  let published = false
  try {
    const archive = await copyArchive(stage, plan)
    await importSessions(stage, plan)
    restoreProjectTimestamps(stage, plan)
    const finalSource = await scanSource(plan.report.sourceRoot)
    if (finalSource.issues.length || fingerprint(finalSource.files) !== plan.report.sourceFingerprint) throw new Error('Source changed during import; target was not published')
    await verifyLibraries(plan.report.libraries)
    const report = { ...plan.report, dryRun: false }
    await writeFile(join(stage, 'migration.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
    await writeFile(join(archive, 'manifest.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
    await treePermissions(archive, true)
    await rename(stage, plan.report.targetRoot)
    published = true
    return report
  } finally { if (!published) await removeStaging(stage) }
}

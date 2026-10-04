/**
 * [INPUT]: 原始文件清单、复制后的旧 SQLite、旧布局字段、消息转换器和显式外部资料映射
 * [OUTPUT]: inspectLegacy：不触碰源库的迁移计划与异常清单
 * [POS]: 旧格式只读解码；不调用旧包的迁移、事件重放或执行入口
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { copyVerified, fingerprint, inside, migrationRoots, scanSource } from './files.ts'
import { convertMessages } from './messages.ts'
import { inspectLibraries, verifyLibraries } from './libraries.ts'
import { importDocument } from '../settings/schema.ts'
import type { LegacyEvent, LegacyProject, LegacyTask, MigrationOptions, MigrationPlan, ProjectMapping, SessionMapping, SourceFile } from './types.ts'

const id = z.string().min(1)
const timestamp = z.string().refine(value => !Number.isNaN(new Date(value).valueOf()))
const optional = z.string().nullable().optional()
const projectRow = z.object({ id, name: z.string(), created_at: timestamp, updated_at: timestamp, source_path: optional, archived_at: optional })
const taskRow = z.object({ id, project_id: id, goal: z.string(), status: z.string(), title: optional,
  created_at: timestamp, updated_at: timestamp, archived_at: optional, pinned_at: optional, active_turn_id: optional })
const eventRow = z.object({ id, task_id: id, seq: z.number().int(), kind: z.string(), payload_json: z.string(), agent_role: optional, created_at: z.string() })
const safeId = (value: string) => /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)
  ? value : `legacy-${createHash('sha256').update(value).digest('hex').slice(0, 32)}`
const directoryId = (value: string) => value.replace(/[^\w-]/g, '_').slice(0, 64) || 'default'

async function databaseSnapshot(root: string, files: SourceFile[]) {
  const temporary = await mkdtemp(join(tmpdir(), 'lumen-legacy-db-'))
  let db: DatabaseSync | undefined
  try {
    for (const file of files.filter(file => ['lumen.sqlite', 'lumen.sqlite-wal', 'lumen.sqlite-shm'].includes(file.path)))
      await copyVerified(root, temporary, file)
    db = new DatabaseSync(join(temporary, 'lumen.sqlite'), { readOnly: true })
    if (db.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok') throw new Error('Copied legacy database failed consistency check')
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row => String(row.name))
    if (!tables.includes('tasks') || !tables.includes('task_events')) throw new Error('Legacy tasks/task_events tables are required')
    const counts = Object.fromEntries(tables.map(name => [name, Number(db!.prepare(`SELECT COUNT(*) AS total FROM "${name.replaceAll('"', '""')}"`).get()!.total)]))
    return {
      schemaVersion: Number(db.prepare('PRAGMA user_version').get()!.user_version), tables: counts,
      projects: tables.includes('projects') ? z.array(projectRow).parse(db.prepare('SELECT * FROM projects ORDER BY id').all()) : [],
      tasks: z.array(taskRow).parse(db.prepare('SELECT * FROM tasks ORDER BY created_at, id').all()),
      events: z.array(eventRow).parse(db.prepare('SELECT * FROM task_events ORDER BY task_id, seq, id').all()),
    }
  } catch (error) {
    if (error instanceof z.ZodError) throw new Error('Legacy database rows do not match the known schema')
    throw error
  } finally { db?.close(); await rm(temporary, { recursive: true, force: true }) }
}

function mappings(projects: LegacyProject[], tasks: LegacyTask[]) {
  const projectMap: ProjectMapping[] = projects.map(project => ({ sourceId: project.id, projectId: safeId(project.id),
    workspace: `workspaces/${directoryId(project.id)}`, createdAt: project.created_at, updatedAt: project.updated_at }))
  const sessions: SessionMapping[] = tasks.map(task => {
    const projectId = safeId(task.project_id), taskId = safeId(task.id)
    return { sourceId: task.id, sourceProjectId: task.project_id, projectId, taskId, threadId: `${projectId}:${taskId}`,
      workspace: `workspaces/${directoryId(task.project_id)}/sessions/${directoryId(task.id)}` }
  })
  return { projects: projectMap, sessions }
}

function materialTarget(path: string, projects: ProjectMapping[], sessions: SessionMapping[]): string | undefined {
  if (path === 'skills' || path.startsWith('skills/')) return path
  for (const session of sessions) if (path === session.workspace || path.startsWith(`${session.workspace}/`))
    return `projects/${session.projectId}/tasks/${session.taskId}${path.slice(session.workspace.length)}`
  for (const project of projects) if (path === project.workspace || path.startsWith(`${project.workspace}/`)) {
    const suffix = path.slice(project.workspace.length)
    if (suffix === '/sessions' || suffix.startsWith('/sessions/')) return undefined
    return `projects/${project.projectId}${suffix}`
  }
  return undefined
}

export async function inspectLegacy(options: MigrationOptions): Promise<MigrationPlan> {
  const roots = await migrationRoots(options.sourceRoot, options.targetRoot)
  if (inside(roots.sourceRoot, resolve(tmpdir()))) throw new Error('Source root must not contain the migration scratch directory')
  const scanned = await scanSource(roots.sourceRoot)
  const scanIssues = JSON.stringify(scanned.issues)
  if (!scanned.files.some(file => file.path === 'lumen.sqlite' && file.kind === 'file')) throw new Error('Legacy lumen.sqlite file is required')
  const source = await databaseSnapshot(roots.sourceRoot, scanned.files)
  const projects: LegacyProject[] = [...source.projects], tasks: LegacyTask[] = source.tasks, events: LegacyEvent[] = source.events
  for (const task of tasks) if (!projects.some(project => project.id === task.project_id)) {
    projects.push({ id: task.project_id, name: task.project_id === 'default' ? '默认' : task.project_id, created_at: task.created_at, updated_at: task.updated_at })
    scanned.issues.push({ severity: 'warning', code: 'adopted_project', taskId: task.id, message: 'Project missing from old directory was reconstructed from its task identity' })
  }
  const map = mappings(projects, tasks), messages = new Map<string, ReturnType<typeof convertMessages>['messages']>()
  const archivedEventKinds: Record<string, number> = {}
  const issues = scanned.issues
  if (source.schemaVersion > 14) issues.push({ severity: 'error', code: 'newer_schema', message: 'Legacy schema is newer than the verified version 14' })
  for (const task of tasks) {
    if (!['done', 'failed', 'canceled'].includes(task.status) || task.active_turn_id)
      issues.push({ severity: 'error', code: 'unfinished_task', taskId: task.id, message: 'Only quiescent terminal tasks may be imported' })
    const mapping = map.sessions.find(session => session.sourceId === task.id)!
    const converted = convertMessages(task, mapping, events.filter(event => event.task_id === task.id), scanned.files)
    messages.set(task.id, converted.messages); issues.push(...converted.issues)
    for (const [kind, count] of Object.entries(converted.archived)) archivedEventKinds[kind] = (archivedEventKinds[kind] ?? 0) + count
  }
  for (const event of events) if (!tasks.some(task => task.id === event.task_id))
    issues.push({ severity: 'error', code: 'orphan_event', eventId: event.id, message: 'Historical event has no task row' })
  const external = await inspectLibraries(options, projects, map.projects, roots)
  issues.push(...external.issues)
  const workspacePaths = [...map.projects.map(project => project.workspace), ...map.sessions.map(session => session.workspace)]
  if (new Set(workspacePaths).size !== workspacePaths.length) issues.push({ severity: 'error', code: 'workspace_collision', message: 'Legacy sanitized workspace paths collide' })
  const materials = scanned.files.flatMap(file => {
    const target = materialTarget(file.path, map.projects, map.sessions)
    return target ? [{ source: file.path, target }] : []
  })
  if (new Set(materials.map(item => item.target)).size !== materials.length || new Set(map.projects.map(item => item.projectId)).size !== map.projects.length)
    issues.push({ severity: 'error', code: 'target_collision', message: 'Historical paths or identities map to the same target' })
  for (const library of external.libraries) {
    const target = library.mode === 'bind' ? `projects/${library.projectId}/source.json` : library.target
    if (materials.some(item => item.target === target || item.target.startsWith(`${target}/`)))
      issues.push({ severity: 'error', code: 'target_collision', path: target, message: 'External source mapping conflicts with existing managed project materials' })
  }
  if (scanned.files.some(file => file.path === 'settings.json')) {
    try {
      const settings = importDocument(JSON.parse(await readFile(join(roots.sourceRoot, 'settings.json'), 'utf8')))
      const active = settings.profiles.find(profile => profile.id === settings.activeProfileId)
      if (!active?.apiKey || !active.activeModel) issues.push({ severity: 'warning', code: 'model_settings_incomplete', message: 'Imported active profile needs explicit model credentials before new execution' })
    } catch { issues.push({ severity: 'error', code: 'invalid_settings', message: 'Historical settings require repair before import' }) }
  }
  const finalScan = await scanSource(roots.sourceRoot)
  if (JSON.stringify(finalScan.issues) !== scanIssues || fingerprint(finalScan.files) !== fingerprint(scanned.files))
    issues.push({ severity: 'error', code: 'source_changed_during_inspection', message: 'Source changed during the read-only inspection; this is not a consistent publishable snapshot' })
  try { await verifyLibraries(external.libraries) }
  catch { issues.push({ severity: 'error', code: 'external_source_changed', message: 'External source changed during the read-only inspection' }) }
  const copiedFiles = external.libraries.flatMap(library => library.files)
  return { projects, tasks, events, messages, report: {
    version: 1, dryRun: options.dryRun !== false, ready: !issues.some(issue => issue.severity === 'error'), ...roots,
    sourceFingerprint: fingerprint(scanned.files), schemaVersion: source.schemaVersion, ...map, materials,
    tables: source.tables, archivedEventKinds, issues, files: scanned.files, libraries: external.libraries,
    counts: { projects: projects.length, sessions: tasks.length, messages: [...messages.values()].reduce((n, list) => n + list.length, 0),
      files: [...scanned.files, ...copiedFiles].filter(file => file.kind === 'file').length, bytes: [...scanned.files, ...copiedFiles].reduce((n, file) => n + file.size, 0) },
  } }
}

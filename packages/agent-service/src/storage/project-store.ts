/**
 * [INPUT]: db.ts 的 DB;sanitizeWorkspaceId;node:fs
 * [OUTPUT]: Project / ProjectStore —— 一等项目 CRUD + 重命名/软归档 + 可选源文件夹 + shared/memory/skills 播种
 * [POS]: storage/ 项目实体;用户项目 id=p-*;default 为隐形历史桶(UI 不展示为项目,禁归档)
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { mkdirSync } from 'node:fs'
import * as path from 'node:path'
import type { DB } from './db.ts'
import { sanitizeWorkspaceId } from './workspace-id.ts'

export interface Project {
  id: string
  name: string
  /** 可选:本机源文件夹,agent 只读挂载为 library/ */
  source_path: string | null
  created_at: string
  updated_at: string
  /** 软归档时间;列表排除,工作区保留 */
  archived_at?: string | null
}

export interface CreateProjectInput {
  name: string
  sourcePath?: string | null
}

function now(): string {
  return new Date().toISOString()
}

/** 项目工作区目录树:shared + memory + skills + sessions 占位 */
export function ensureProjectDirs(workspacesDir: string, projectId: string): void {
  const pid = sanitizeWorkspaceId(projectId)
  const root = path.join(workspacesDir, pid)
  for (const sub of ['shared/papers', 'shared/docs', 'shared/notes', 'memory', 'skills', 'sessions']) {
    mkdirSync(path.join(root, sub), { recursive: true })
  }
}

function normalizeSourcePath(raw?: string | null): string | null {
  if (raw == null) return null
  const t = raw.trim()
  if (!t) return null
  // 拒绝明显危险的空/相对穿越;真实可读性由 runtime 挂载时再校验
  if (t.includes('\0')) return null
  return t.slice(0, 1024)
}

function normalizeName(name: string): string {
  return name.trim().slice(0, 64) || '未命名项目'
}

export class ProjectStore {
  private readonly db: DB
  private readonly workspacesDir: string
  private readonly insert: ReturnType<DB['prepare']>
  private readonly get: ReturnType<DB['prepare']>
  private readonly list: ReturnType<DB['prepare']>
  private readonly rename: ReturnType<DB['prepare']>
  private readonly archive: ReturnType<DB['prepare']>
  private readonly distinctTaskProjects: ReturnType<DB['prepare']>

  constructor(db: DB, workspacesDir: string) {
    this.db = db
    this.workspacesDir = workspacesDir
    this.insert = db.prepare(
      'INSERT INTO projects (id, name, source_path, created_at, updated_at) VALUES (@id,@name,@source_path,@created_at,@updated_at)',
    )
    this.get = db.prepare('SELECT * FROM projects WHERE id = ?')
    this.list = db.prepare(
      "SELECT * FROM projects WHERE archived_at IS NULL ORDER BY CASE id WHEN 'default' THEN 0 ELSE 1 END, created_at ASC",
    )
    this.rename = db.prepare(
      'UPDATE projects SET name = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL',
    )
    this.archive = db.prepare(
      'UPDATE projects SET archived_at = COALESCE(archived_at, ?), updated_at = ? WHERE id = ?',
    )
    this.distinctTaskProjects = db.prepare('SELECT DISTINCT project_id AS id FROM tasks')
    this.ensureDefault()
    this.adoptOrphans()
  }

  private row(r: Record<string, unknown>): Project {
    return {
      id: String(r.id),
      name: String(r.name),
      source_path: (r.source_path as string | null) ?? null,
      created_at: String(r.created_at),
      updated_at: String(r.updated_at),
      archived_at: (r.archived_at as string | null) ?? null,
    }
  }

  ensureDefault(): Project {
    const existing = this.get.get('default') as Record<string, unknown> | undefined
    if (existing) {
      ensureProjectDirs(this.workspacesDir, 'default')
      return this.row(existing)
    }
    const t = now()
    const row: Project = { id: 'default', name: '默认', source_path: null, created_at: t, updated_at: t }
    this.insert.run({ id: row.id, name: row.name, source_path: null, created_at: t, updated_at: t })
    ensureProjectDirs(this.workspacesDir, 'default')
    return row
  }

  /** 把 tasks 里出现过、但 projects 表没有的 id 收编进来(旧数据 / demo visitor) */
  private adoptOrphans(): void {
    const rows = this.distinctTaskProjects.all() as Array<{ id: string }>
    for (const { id } of rows) {
      if (!id || this.get.get(id)) continue
      const t = now()
      const name = id === 'default' ? '默认' : id.startsWith('v-') ? '访客' : id
      try {
        this.insert.run({ id, name, source_path: null, created_at: t, updated_at: t })
      } catch { /* 竞态忽略 */ }
      ensureProjectDirs(this.workspacesDir, id)
    }
  }

  listProjects(): Project[] {
    this.ensureDefault()
    this.adoptOrphans()
    return (this.list.all() as Array<Record<string, unknown>>).map((r) => this.row(r))
  }

  getProject(id: string): Project | null {
    const r = this.get.get(id) as Record<string, unknown> | undefined
    return r ? this.row(r) : null
  }

  createProject(input: CreateProjectInput | string): Project {
    const name = typeof input === 'string' ? input : input.name
    const sourcePath = typeof input === 'string' ? null : normalizeSourcePath(input.sourcePath)
    const trimmed = normalizeName(name)
    const rawId = `p-${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
    const id = sanitizeWorkspaceId(rawId)
    const t = now()
    const row: Project = { id, name: trimmed, source_path: sourcePath, created_at: t, updated_at: t }
    this.insert.run({ id: row.id, name: row.name, source_path: sourcePath, created_at: t, updated_at: t })
    ensureProjectDirs(this.workspacesDir, id)
    return row
  }

  /** 重命名;禁 default;已归档或不存在返回 null */
  renameProject(id: string, name: string): Project | null {
    if (id === 'default') return null
    const existing = this.getProject(id)
    if (!existing || existing.archived_at) return null
    const trimmed = normalizeName(name)
    const t = now()
    const result = this.rename.run(trimmed, t, id) as { changes: number }
    if (!result.changes) return null
    return this.getProject(id)
  }

  /** 软归档;禁 default;幂等 */
  archiveProject(id: string): boolean {
    if (id === 'default') return false
    const existing = this.getProject(id)
    if (!existing) return false
    if (existing.archived_at) return true
    const t = now()
    this.archive.run(t, t, id)
    return true
  }
}

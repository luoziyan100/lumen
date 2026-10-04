/**
 * [INPUT]: 旧数据库 schema v1–v14 与工作区布局
 * [OUTPUT]: 迁移输入、只读清单、身份映射和报告类型
 * [POS]: 离线导入契约；不依赖旧运行时或恢复逻辑
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { MastraDBMessage } from '@mastra/core/memory'

export interface MigrationIssue {
  severity: 'warning' | 'error'
  code: string
  message: string
  path?: string
  taskId?: string
  eventId?: string
}

export interface SourceFile {
  path: string
  kind: 'file' | 'directory'
  size: number
  sha256?: string
  mode: number
}

export interface LegacyProject {
  id: string
  name: string
  created_at: string
  updated_at: string
  archived_at?: string | null
  source_path?: string | null
}

export interface LegacyTask {
  id: string
  project_id: string
  goal: string
  title?: string | null
  status: string
  created_at: string
  updated_at: string
  archived_at?: string | null
  pinned_at?: string | null
  active_turn_id?: string | null
}

export interface LegacyEvent {
  id: string
  task_id: string
  seq: number
  kind: string
  payload_json: string
  agent_role?: string | null
  created_at: string
}

export interface ProjectMapping {
  sourceId: string
  projectId: string
  workspace: string
  createdAt: string
  updatedAt: string
}

export interface SessionMapping {
  sourceId: string
  sourceProjectId: string
  projectId: string
  taskId: string
  threadId: string
  workspace: string
}

export interface MigrationReport {
  version: 1
  dryRun: boolean
  ready: boolean
  alreadyImported?: boolean
  sourceRoot: string
  targetRoot: string
  sourceFingerprint: string
  schemaVersion: number
  projects: ProjectMapping[]
  sessions: SessionMapping[]
  materials: Array<{ source: string; target: string }>
  counts: { projects: number; sessions: number; messages: number; files: number; bytes: number }
  tables: Record<string, number>
  archivedEventKinds: Record<string, number>
  issues: MigrationIssue[]
  files: SourceFile[]
  libraries: LibraryMapping[]
}

export interface LibraryOption {
  projectId: string
  sourcePath: string
  mode: 'copy' | 'bind'
}

export interface LibraryMapping {
  sourceProjectId: string
  projectId: string
  sourceRoot: string
  mode: 'copy' | 'bind'
  scope: 'shared' | 'source'
  target: string
  externalFilesArchived: boolean
  files: SourceFile[]
  fingerprint?: string
}

export interface MigrationPlan {
  report: MigrationReport
  projects: LegacyProject[]
  tasks: LegacyTask[]
  events: LegacyEvent[]
  messages: Map<string, MastraDBMessage[]>
}

export interface MigrationOptions { sourceRoot: string; targetRoot: string; dryRun?: boolean; libraries?: LibraryOption[] }

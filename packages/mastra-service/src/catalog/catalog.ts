/**
 * [INPUT]: Mastra Memory 公开 thread/message 接口、项目及阅读游标存储、目录 DTO
 * [OUTPUT]: createCatalog、纯归属 requireSession 与可识别的 CatalogError
 * [POS]: 项目与会话的目录用例；授权与描述分离，阅读状态只保存已见消息 ID 或显式未读游标，不回写框架 thread 或复制运行状态
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { randomUUID } from 'node:crypto'
import type { Memory } from '@mastra/memory'
import type { StorageThreadType } from '@mastra/core/memory'
import { ProjectStore } from './projects.ts'
import { ReadReceipts } from './read-receipts.ts'
import type { CatalogQuery, Page, ProjectPatch, SessionPatch, SessionSummary } from './types.ts'

export class CatalogError extends Error {
  readonly status: 404 | 409
  constructor(message: string, status: 404 | 409) { super(message); this.status = status }
}

function summary(thread: StorageThreadType, lastMessageId: string | null = null, unread = false): SessionSummary {
  return {
    projectId: String(thread.metadata?.lumenProjectId), taskId: String(thread.metadata?.lumenTaskId),
    resourceId: thread.resourceId, threadId: thread.id, title: thread.title ?? '新研究',
    pinned: thread.metadata?.lumenPinned === true, archived: thread.metadata?.lumenArchived === true,
    createdAt: thread.createdAt.toISOString(), updatedAt: thread.updatedAt.toISOString(),
    lastMessageId, unread,
  }
}

export function createCatalog(root: string, memory: Memory) {
  const projects = new ProjectStore(root)
  let receipts: ReadReceipts
  try { receipts = new ReadReceipts(root) } catch (error) { projects.close(); throw error }
  const pending = new Map<string, Promise<unknown>>()
  let closing: Promise<void> | undefined

  function requireProject(id: string) {
    const project = projects.get(id)
    if (!project) throw new CatalogError('Project not found', 404)
    return project
  }

  // ---- 同项目修改按提交顺序执行，避免检查空目录之后又插入会话 ----
  function change<T>(projectId: string, work: () => Promise<T> | T): Promise<T> {
    if (closing) return Promise.reject(new Error('Catalog is closed'))
    const result = (pending.get(projectId) ?? Promise.resolve()).catch(() => {}).then(work)
    pending.set(projectId, result)
    void result.finally(() => { if (pending.get(projectId) === result) pending.delete(projectId) }).catch(() => {})
    return result
  }

  async function requireSession(projectId: string, taskId: string) {
    requireProject(projectId)
    const id = `${projectId}:${taskId}`
    const thread = await memory.getThreadById({ threadId: id, resourceId: id })
    if (!thread || thread.metadata?.lumenProjectId !== projectId || thread.metadata?.lumenTaskId !== taskId)
      throw new CatalogError('Session not found', 404)
    return thread
  }

  async function latestMessage(thread: StorageThreadType) {
    const result = await memory.recall({ threadId: thread.id, resourceId: thread.resourceId,
      perPage: 1, page: 0, orderBy: { field: 'createdAt', direction: 'DESC' }, hideSignals: false, includeTotal: false })
    return result.messages[0]
  }

  async function describe(thread: StorageThreadType): Promise<SessionSummary> {
    const latest = await latestMessage(thread)
    const lastMessageId = latest?.id ?? null
    const readId = receipts.get(thread.id)
    const imported = readId === undefined && !!thread.metadata?.legacy && !!latest?.content.metadata?.legacy
    return summary(thread, lastMessageId, readId === '' || (lastMessageId !== null && readId !== lastMessageId && !imported))
  }

  async function listSessions(projectId: string, query: CatalogQuery): Promise<Page<SessionSummary>> {
    requireProject(projectId)
    const metadata = { lumenProjectId: projectId, ...(query.archived === 'all' ? {} : { lumenArchived: query.archived }) }
    const result = await memory.listThreads({ perPage: false,
      orderBy: { field: 'updatedAt', direction: 'DESC' }, filter: { metadata } })
    const search = query.search?.trim().toLocaleLowerCase()
    const entries = result.threads.filter(thread => !search || (thread.title ?? '新研究').toLocaleLowerCase().includes(search))
      .sort((a, b) => Number(b.metadata?.lumenPinned === true) - Number(a.metadata?.lumenPinned === true) || b.updatedAt.getTime() - a.updatedAt.getTime())
    const start = query.page * query.perPage
    return { items: await Promise.all(entries.slice(start, start + query.perPage).map(describe)), page: query.page, perPage: query.perPage,
      total: entries.length, hasMore: start + query.perPage < entries.length }
  }

  async function ensureSession(projectId: string, taskId: string, title?: string) {
    const project = requireProject(projectId)
    const id = `${projectId}:${taskId}`
    const existing = await memory.getThreadById({ threadId: id, resourceId: id })
    if (existing) return describe(await requireSession(projectId, taskId))
    if (project.archived) throw new CatalogError('Project is archived', 409)
    return summary(await memory.createThread({ threadId: id, resourceId: id, title: title ?? '新研究',
      metadata: { lumenProjectId: projectId, lumenTaskId: taskId, lumenPinned: false, lumenArchived: false, lumenAutoTitle: title === undefined } }))
  }

  return {
    getProject: requireProject,
    requireSession,
    listProjects: (query: CatalogQuery) => projects.list(query),
    createProject(name: string, id: string = randomUUID()) {
      return change(id, () => {
        if (projects.get(id)) throw new CatalogError('Project already exists', 409)
        return projects.create(id, name)
      })
    },
    updateProject(id: string, patch: ProjectPatch) {
      return change(id, () => {
        requireProject(id)
        if (id === 'default' && patch.archived) throw new CatalogError('Default project cannot be archived', 409)
        return projects.update(id, patch)
      })
    },
    deleteProject(id: string) {
      return change(id, async () => {
        requireProject(id)
        if (id === 'default') throw new CatalogError('Default project cannot be deleted', 409)
        const sessions = await listSessions(id, { page: 0, perPage: 1, archived: 'all' })
        if (sessions.total) throw new CatalogError('Project contains sessions; archive it instead', 409)
        projects.delete(id)
      })
    },
    listSessions,
    async getSession(projectId: string, taskId: string) { return describe(await requireSession(projectId, taskId)) },
    createSession(projectId: string, taskId: string = randomUUID(), title?: string) {
      return change(projectId, () => ensureSession(projectId, taskId, title))
    },
    markSessionRead(projectId: string, taskId: string, messageId: string) {
      return change(projectId, async () => {
        const thread = await requireSession(projectId, taskId)
        const latest = await latestMessage(thread)
        return { changed: latest?.id === messageId && receipts.set(thread.id, messageId) }
      })
    },
    setSessionUnread(projectId: string, taskId: string, unread: boolean) {
      return change(projectId, async () => {
        const thread = await requireSession(projectId, taskId)
        if (unread) return { changed: receipts.set(thread.id, '') }
        const latest = await latestMessage(thread)
        return { changed: latest ? receipts.set(thread.id, latest.id) : receipts.clear(thread.id) }
      })
    },
    titleFromMessage(projectId: string, taskId: string, message: string) {
      return change(projectId, async () => {
        const thread = await requireSession(projectId, taskId)
        if (thread.metadata?.lumenAutoTitle !== true) return
        const title = message.split('\n').map(line => line.trim()).find(Boolean)?.slice(0, 60)
        if (title) await memory.updateThread({ id: thread.id, title, metadata: { lumenAutoTitle: false } })
      })
    },
    updateSession(projectId: string, taskId: string, patch: SessionPatch) {
      return change(projectId, async () => {
        const thread = await requireSession(projectId, taskId)
        const metadata = { ...(patch.pinned === undefined ? {} : { lumenPinned: patch.pinned }),
          ...(patch.archived === undefined ? {} : { lumenArchived: patch.archived }),
          ...(patch.title === undefined ? {} : { lumenAutoTitle: false }) }
        return describe(await memory.updateThread({ id: thread.id, title: patch.title, metadata }))
      })
    },
    close() {
      closing ??= Promise.allSettled(pending.values()).then(() => { receipts.close(); projects.close() })
      return closing
    },
  }
}

export type Catalog = ReturnType<typeof createCatalog>

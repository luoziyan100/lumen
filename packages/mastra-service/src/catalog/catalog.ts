/**
 * [INPUT]: Mastra Memory 公开 thread/message 接口、studio 主题存储、阅读游标存储、目录 DTO
 * [OUTPUT]: createCatalog、纯归属 requireSession 与可识别的 CatalogError
 * [POS]: 主题下会话的目录用例；授权与描述分离，阅读状态只保存已见消息 ID 或显式未读游标，不回写框架 thread 或复制运行状态
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { randomUUID } from 'node:crypto'
import type { Memory } from '@mastra/memory'
import type { StorageThreadType } from '@mastra/core/memory'
import { StudioError } from '../studio/errors.ts'
import type { ErrorCode } from '../http/error-codes.ts'
import type { TopicStore } from '../studio/topics.ts'
import { ReadReceipts } from './read-receipts.ts'
import type { CatalogQuery, Page, SessionPatch, SessionSummary } from './types.ts'

export class CatalogError extends Error {
  readonly status: 404 | 409
  readonly code: ErrorCode
  constructor(message: string, status: 404 | 409, code: ErrorCode) { super(message); this.status = status; this.code = code }
}

function summary(thread: StorageThreadType, lastMessageId: string | null = null, unread = false): SessionSummary {
  return {
    topicId: String(thread.metadata?.lumenTopicId), taskId: String(thread.metadata?.lumenTaskId),
    resourceId: thread.resourceId, threadId: thread.id, title: thread.title ?? '新对话',
    pinned: thread.metadata?.lumenPinned === true, archived: thread.metadata?.lumenArchived === true,
    createdAt: thread.createdAt.toISOString(), updatedAt: thread.updatedAt.toISOString(),
    lastMessageId, unread,
  }
}

export function createCatalog(root: string, memory: Memory, topics: TopicStore) {
  const receipts = new ReadReceipts(root)
  const pending = new Map<string, Promise<unknown>>()
  let closing: Promise<void> | undefined

  function requireTopic(id: string) {
    try { return topics.get(id) }
    catch (error) { if (error instanceof StudioError && error.status === 404) throw new CatalogError('Topic not found', 404, 'topic.not_found'); throw error }
  }

  // ---- 同主题修改按提交顺序执行，避免检查之后又插入会话 ----
  function change<T>(topicId: string, work: () => Promise<T> | T): Promise<T> {
    if (closing) return Promise.reject(new Error('Catalog is closed'))
    const result = (pending.get(topicId) ?? Promise.resolve()).catch(() => {}).then(work)
    pending.set(topicId, result)
    void result.finally(() => { if (pending.get(topicId) === result) pending.delete(topicId) }).catch(() => {})
    return result
  }

  async function requireSession(topicId: string, taskId: string) {
    requireTopic(topicId)
    const id = `${topicId}:${taskId}`
    const thread = await memory.getThreadById({ threadId: id, resourceId: id })
    if (!thread || thread.metadata?.lumenTopicId !== topicId || thread.metadata?.lumenTaskId !== taskId)
      throw new CatalogError('Session not found', 404, 'session.not_found')
    return thread
  }

  async function latestMessage(thread: StorageThreadType) {
    const result = await memory.recall({ threadId: thread.id, resourceId: thread.resourceId,
      perPage: 1, page: 0, orderBy: { field: 'createdAt', direction: 'DESC' }, hideSignals: false, includeTotal: false })
    return result.messages[0]
  }

  async function describe(thread: StorageThreadType): Promise<SessionSummary> {
    const lastMessageId = (await latestMessage(thread))?.id ?? null
    const readId = receipts.get(thread.id)
    return summary(thread, lastMessageId, readId === '' || (lastMessageId !== null && readId !== lastMessageId))
  }

  async function listSessions(topicId: string, query: CatalogQuery): Promise<Page<SessionSummary>> {
    requireTopic(topicId)
    const metadata = { lumenTopicId: topicId, ...(query.archived === 'all' ? {} : { lumenArchived: query.archived }) }
    const result = await memory.listThreads({ perPage: false,
      orderBy: { field: 'updatedAt', direction: 'DESC' }, filter: { metadata } })
    const search = query.search?.trim().toLocaleLowerCase()
    const entries = result.threads.filter(thread => !search || (thread.title ?? '新对话').toLocaleLowerCase().includes(search))
      .sort((a, b) => Number(b.metadata?.lumenPinned === true) - Number(a.metadata?.lumenPinned === true) || b.updatedAt.getTime() - a.updatedAt.getTime())
    const start = query.page * query.perPage
    return { items: await Promise.all(entries.slice(start, start + query.perPage).map(describe)), page: query.page, perPage: query.perPage,
      total: entries.length, hasMore: start + query.perPage < entries.length }
  }

  async function ensureSession(topicId: string, taskId: string, title?: string) {
    const topic = requireTopic(topicId)
    const id = `${topicId}:${taskId}`
    const existing = await memory.getThreadById({ threadId: id, resourceId: id })
    if (existing) return describe(await requireSession(topicId, taskId))
    if (topic.archived) throw new CatalogError('Topic is archived', 409, 'topic.archived')
    return summary(await memory.createThread({ threadId: id, resourceId: id, title: title ?? '新对话',
      metadata: { lumenTopicId: topicId, lumenTaskId: taskId, lumenPinned: false, lumenArchived: false, lumenAutoTitle: title === undefined } }))
  }

  return {
    getTopic: requireTopic,
    requireSession,
    listSessions,
    async getSession(topicId: string, taskId: string) { return describe(await requireSession(topicId, taskId)) },
    createSession(topicId: string, taskId: string = randomUUID(), title?: string) {
      return change(topicId, () => ensureSession(topicId, taskId, title))
    },
    markSessionRead(topicId: string, taskId: string, messageId: string) {
      return change(topicId, async () => {
        const thread = await requireSession(topicId, taskId)
        const latest = await latestMessage(thread)
        return { changed: latest?.id === messageId && receipts.set(thread.id, messageId) }
      })
    },
    setSessionUnread(topicId: string, taskId: string, unread: boolean) {
      return change(topicId, async () => {
        const thread = await requireSession(topicId, taskId)
        if (unread) return { changed: receipts.set(thread.id, '') }
        const latest = await latestMessage(thread)
        return { changed: latest ? receipts.set(thread.id, latest.id) : receipts.clear(thread.id) }
      })
    },
    titleFromMessage(topicId: string, taskId: string, message: string) {
      return change(topicId, async () => {
        const thread = await requireSession(topicId, taskId)
        if (thread.metadata?.lumenAutoTitle !== true) return
        const title = message.split('\n').map(line => line.trim()).find(Boolean)?.slice(0, 60)
        if (title) await memory.updateThread({ id: thread.id, title, metadata: { lumenAutoTitle: false } })
      })
    },
    updateSession(topicId: string, taskId: string, patch: SessionPatch) {
      return change(topicId, async () => {
        const thread = await requireSession(topicId, taskId)
        const metadata = { ...(patch.pinned === undefined ? {} : { lumenPinned: patch.pinned }),
          ...(patch.archived === undefined ? {} : { lumenArchived: patch.archived }),
          ...(patch.title === undefined ? {} : { lumenAutoTitle: false }) }
        return describe(await memory.updateThread({ id: thread.id, title: patch.title, metadata }))
      })
    },
    close() {
      closing ??= Promise.allSettled(pending.values()).then(() => { receipts.close() })
      return closing
    },
  }
}

export type Catalog = ReturnType<typeof createCatalog>

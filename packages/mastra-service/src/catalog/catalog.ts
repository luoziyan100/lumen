/**
 * [INPUT]: Mastra Memory 公开 thread/message 接口、studio 主题存储、阅读游标存储、目录 DTO、studio/reading-question 的解读提问解析（自动标题取引文）
 * [OUTPUT]: createCatalog、纯归属 requireSession 与可识别的 CatalogError
 * [POS]: 主题下会话的目录用例；授权与描述分离，阅读状态只保存已见消息 ID 或显式未读游标，不回写框架 thread 或复制运行状态
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { randomUUID } from 'node:crypto'
import type { Memory } from '@mastra/memory'
import type { StorageThreadType } from '@mastra/core/memory'
import { StudioError } from '../studio/errors.ts'
import { readingQuestion } from '../studio/reading-question.ts'
import type { ErrorCode } from '../http/error-codes.ts'
import type { TopicStore } from '../studio/topics.ts'
import type { DeletionJournal } from '../studio/deletions.ts'
import { ReadReceipts } from './read-receipts.ts'
import type { ArchivedSession, CatalogQuery, Page, SessionPatch, SessionSummary } from './types.ts'

export class CatalogError extends Error {
  readonly status: 400 | 404 | 409
  readonly code: ErrorCode
  constructor(message: string, status: 400 | 404 | 409, code: ErrorCode) { super(message); this.status = status; this.code = code }
}

/** Threads created before L8 stored this word as their title; they read as untitled, so the UI can say it in its own language. */
const LEGACY_UNTITLED = '新对话'
const titleOf = (thread: StorageThreadType) => thread.title && thread.title !== LEGACY_UNTITLED ? thread.title : null

function summary(thread: StorageThreadType, lastMessageId: string | null = null, unread = false): SessionSummary {
  return {
    topicId: String(thread.metadata?.lumenTopicId), taskId: String(thread.metadata?.lumenTaskId),
    resourceId: thread.resourceId, threadId: thread.id, title: titleOf(thread),
    pinned: thread.metadata?.lumenPinned === true, archived: thread.metadata?.lumenArchived === true,
    createdAt: thread.createdAt.toISOString(), updatedAt: thread.updatedAt.toISOString(),
    lastMessageId, unread,
  }
}

export function createCatalog(root: string, memory: Memory, topics: TopicStore, deletions: DeletionJournal) {
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
    // A conversation being deleted (R20) is gone for every lookup, so nothing can open or run it again
    if (!thread || thread.metadata?.lumenTopicId !== topicId || thread.metadata?.lumenTaskId !== taskId || deletions.pending(topicId, taskId))
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
    const entries = result.threads.filter(thread => !deletions.pending(topicId, String(thread.metadata?.lumenTaskId)))
      .filter(thread => !search || (titleOf(thread) ?? '').toLocaleLowerCase().includes(search))
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
    // L8: no title until the first message gives one or the user sets one; the UI shows its own word meanwhile
    return summary(await memory.createThread({ threadId: id, resourceId: id, title,
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
    /** L7: archived topics, and archived conversations of topics still in the list, newest first; one thread query, not a walk over topics. */
    async listArchived(): Promise<{ topics: ReturnType<TopicStore['list']>; sessions: ArchivedSession[] }> {
      const open = new Map(topics.list(false).map(topic => [topic.id, topic.title]))
      const { threads } = await memory.listThreads({ perPage: false, orderBy: { field: 'updatedAt', direction: 'DESC' }, filter: { metadata: { lumenArchived: true } } })
      const sessions = threads.filter(thread => open.has(String(thread.metadata?.lumenTopicId)) && !deletions.pending(String(thread.metadata?.lumenTopicId), String(thread.metadata?.lumenTaskId)))
      return { topics: topics.list(true), sessions: await Promise.all(sessions.map(async thread => ({ ...await describe(thread), topicTitle: open.get(String(thread.metadata?.lumenTopicId))! }))) }
    },
    /** R20: the read cursor of one conversation, or of every conversation of a topic (by the `topicId:` prefix, so a resumed deletion finds them after the threads are gone). */
    forgetReceipts(prefix: string) { receipts.clearPrefix(prefix) },
    /** Run work in this topic's catalog order (archive and deletion share it with every other catalog write). */
    serialized: change,
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
        const question = readingQuestion(message)
        const title = (question ? question.quote.replaceAll('**', '') : message).split('\n').map(line => line.trim()).find(Boolean)?.slice(0, 60)
        if (title) await memory.updateThread({ id: thread.id, title, metadata: { lumenAutoTitle: false } })
      })
    },
    updateSession(topicId: string, taskId: string, patch: SessionPatch) {
      return change(topicId, async () => {
        const thread = await requireSession(topicId, taskId)
        // R18: trimmed, never empty; a title the user set is never replaced by the generated one (lumenAutoTitle)
        const title = patch.title?.trim()
        if (title === '') throw new CatalogError('Session title is empty', 400, 'session.title_empty')
        const metadata = { ...(patch.pinned === undefined ? {} : { lumenPinned: patch.pinned }),
          ...(patch.archived === undefined ? {} : { lumenArchived: patch.archived }),
          ...(title === undefined ? {} : { lumenAutoTitle: false }) }
        return describe(await memory.updateThread({ id: thread.id, title, metadata }))
      })
    },
    close() {
      closing ??= Promise.allSettled(pending.values()).then(() => { receipts.close() })
      return closing
    },
  }
}

export type Catalog = ReturnType<typeof createCatalog>

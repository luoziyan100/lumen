/**
 * [INPUT]: the studio deletion journal (catalog.sqlite), Mastra Memory and the native storage domains (threadState, workflows, backgroundTasks),
 *          diagnostics trace/case removal, the catalog's read cursors, the application's in-process release and the data root
 * [OUTPUT]: createDeletion: run(target) carries one marked deletion to the end, resume() finishes every marked one at start-up; THREAD_STATE_TYPES
 * [POS]: the R20 deletion of a topic or a conversation. The caller (http/lifecycle) marks first, inside the idle check; from then on the object is
 *        hidden and refuses runs, and every step here is safe to repeat, so a stop anywhere is finished by the next start. Only framework storage APIs are used
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { Memory } from '@mastra/memory'
import type { MastraStorage } from '@mastra/core/storage'
import { TASK_STATE_TYPE, GOAL_STATE_TYPE } from '@mastra/core/tools'
import type { DeletionJournal, PendingDeletion } from '../studio/deletions.ts'
import { SPECIALISTS_STATE, type SpecialistRecord } from '../agents/resume/index.ts'
import { FAMILY_BUDGET_STATE } from '../agents/budget/index.ts'
import { CHILD_USAGE_STATE } from '../agents/usage/children.ts'

/** Every thread-state type a conversation can carry: the framework's (tasks, goal, workspace read records — that one is not exported) and Lumen's. */
export const THREAD_STATE_TYPES = [TASK_STATE_TYPE, GOAL_STATE_TYPE, 'workspace-reads', FAMILY_BUDGET_STATE, SPECIALISTS_STATE, CHILD_USAGE_STATE] as const

interface Thread { threadId: string; resourceId: string }

export interface DeletionOptions {
  root: string
  journal: DeletionJournal
  memory: Memory
  storage: Pick<MastraStorage, 'getStore'>
  diagnostics: { forgetTraces(resourceId: string): Promise<void>; forgetCases(prefix: string): Promise<void> }
  receipts: { forgetReceipts(prefix: string): void }
  /** Close the in-process sessions (and, for a topic, its workspace and memory mounts) before their data goes. */
  release(topicId: string, taskId: string | null): Promise<void>
  /** Test seam: called after the memory step. Tests throw here to leave a half-done deletion behind; production never passes it. */
  afterMemory?: (target: PendingDeletion) => void | Promise<void>
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function createDeletion(options: DeletionOptions) {
  const { memory, storage, journal } = options

  async function allThreads(): Promise<Thread[]> {
    const { threads } = await memory.listThreads({ perPage: false })
    return threads.map(thread => ({ threadId: thread.id, resourceId: thread.resourceId }))
  }

  /** A conversation's specialist threads: the ones its specialist record lists, plus any `<topicId:taskId>-<uuid>` thread the record missed (a crash between delegation start and the record write). */
  async function specialistThreads(resourceId: string, threads: Thread[]): Promise<Thread[]> {
    const state = await (await storage.getStore('threadState'))?.getState<{ items: Record<string, SpecialistRecord> }>({ threadId: resourceId, type: SPECIALISTS_STATE })
    const found = new Map<string, Thread>()
    for (const record of Object.values(state?.items ?? {})) for (const thread of record.threads) found.set(thread.threadId, thread)
    const child = new RegExp(`^${escape(resourceId)}-${UUID}$`)
    for (const thread of threads) if (child.test(thread.threadId)) found.set(thread.threadId, thread)
    return [...found.values()]
  }

  /** Traces, diagnostics, background tasks, workflow snapshots, thread states, then the threads and their messages. Traces go first: the specialist resource ids come from threads that this step deletes. */
  async function removeConversation(resourceId: string, threads: Thread[]) {
    const owned = [...await specialistThreads(resourceId, threads), { threadId: resourceId, resourceId }]
    for (const resource of new Set(owned.map(thread => thread.resourceId))) await options.diagnostics.forgetTraces(resource)
    await options.diagnostics.forgetCases(resourceId)
    const tasks = await storage.getStore('backgroundTasks'), workflows = await storage.getStore('workflows'), states = await storage.getStore('threadState')
    for (const thread of owned) {
      for (const task of (await tasks?.listTasks({ threadId: thread.threadId }))?.tasks ?? []) await tasks!.deleteTask(task.id)
      for (const task of (await tasks?.listTasks({ resourceId: thread.resourceId }))?.tasks ?? []) await tasks!.deleteTask(task.id)
      for (const run of (await workflows?.listWorkflowRuns({ resourceId: thread.resourceId, perPage: false }))?.runs ?? [])
        await workflows!.deleteWorkflowRunById({ runId: run.runId, workflowName: run.workflowName })
      for (const type of THREAD_STATE_TYPES) await states?.deleteState({ threadId: thread.threadId, type })
    }
    // The parent last: its specialist record is how a repeat of this step finds the children
    for (const thread of owned) await memory.deleteThread(thread.threadId)
  }

  async function run(target: PendingDeletion) {
    const { topicId, taskId } = target
    await options.release(topicId, taskId)
    const threads = await allThreads()
    if (taskId) {
      const resourceId = `${topicId}:${taskId}`
      await removeConversation(resourceId, threads)
      await memory.settled()
      await options.afterMemory?.(target)
      options.receipts.forgetReceipts(resourceId)
      journal.finishSession(topicId, taskId)
      return
    }
    // A topic: each conversation as above, then any thread left under the topic's prefix (orphans), then the files, the cursors and the catalog rows
    const prefix = `${topicId}:`
    const conversations = threads.filter(thread => thread.threadId === thread.resourceId && thread.threadId.startsWith(prefix))
    for (const conversation of conversations) await removeConversation(conversation.threadId, threads)
    const states = await storage.getStore('threadState')
    for (const thread of (await allThreads()).filter(thread => thread.threadId.startsWith(prefix))) {
      await options.diagnostics.forgetTraces(thread.resourceId)
      for (const type of THREAD_STATE_TYPES) await states?.deleteState({ threadId: thread.threadId, type })
      await memory.deleteThread(thread.threadId)
    }
    await memory.settled()
    await options.afterMemory?.(target)
    await options.diagnostics.forgetCases(prefix)
    await rm(join(options.root, 'topics', topicId), { recursive: true, force: true })
    options.receipts.forgetReceipts(prefix)
    journal.finishTopic(topicId)
  }

  return {
    run,
    /** Start-up: finish every deletion a stop left half done, before the service answers anything. */
    async resume() { for (const target of journal.list()) await run(target) },
  }
}

export type Deletion = ReturnType<typeof createDeletion>

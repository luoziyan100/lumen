/**
 * [INPUT]: 原生委派/Memory/threadState 与受信父任务；不读取旧调度器
 * [OUTPUT]: createSpecialistHistory：稳定专家身份、只读历史重入、原目录绑定与显式继续验证
 * [POS]: 原生子线程的授权索引；消息仍由 Memory 保存，不执行或重放历史工具
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash, randomUUID } from 'node:crypto'
import type { DelegationStartContext, DelegationCompleteContext, MessageFilterContext, MastraDBMessage } from '@mastra/core/agent'
import type { InputProcessor } from '@mastra/core/processors'
import type { MastraMemory } from '@mastra/core/memory'
import type { MastraStorage } from '@mastra/core/storage'
import type { SpecialistRole } from '../roles.ts'
import { cancelPriorDelegations } from './cancellation.ts'
import { specialistDirectory } from '../workspaces.ts'

const STATE = 'lumen.specialists.v1', SCOPE = 'lumen.specialist-history'
export interface SpecialistRecord {
  id: string; role: string; agentId: string; parentResourceId: string; directory: string
  title: string; status: 'running' | 'completed' | 'incomplete' | 'failed' | 'interrupted'
  createdAt: string; updatedAt: string; continuations: number; finishReason?: string; invocation?: string
  threads: Array<{ threadId: string; resourceId: string }>
}
interface Scope { parent: string; id: string; invocation: string }
interface State { items: Record<string, SpecialistRecord>; intent?: { id: string; nonce: string; owner: string } }
const invocation = (context: { runId: string; toolCallId: string }) => `${context.runId}:${context.toolCallId}`
export function createSpecialistHistory(storage: Pick<MastraStorage, 'getStore'>, memory: MastraMemory) {
  const owner = randomUUID()
  const tails = new Map<string, Promise<unknown>>(), active = new Map<string, Scope>()
  async function transaction<T>(parent: string, work: (state: State) => Promise<T> | T, save = true): Promise<T> {
    const pending = (tails.get(parent) ?? Promise.resolve()).catch(() => {}).then(async () => {
      const store = await storage.getStore('threadState')
      if (!store) throw new Error('专家身份需要原生threadState')
      const state = await store.getState<State>({ threadId: parent, type: STATE }) ?? { items: {} }
      const result = await work(state)
      if (save) await store.setState({ threadId: parent, type: STATE, value: state })
      return result
    })
    tails.set(parent, pending)
    try { return await pending } finally { if (tails.get(parent) === pending) tails.delete(parent) }
  }
  const isActive = (id: string) => [...active.values()].some(scope => scope.id === id)
  function authorize(record: SpecialistRecord | undefined, parent: string, role?: SpecialistRole, agentId?: string): SpecialistRecord {
    if (!record || record.parentResourceId !== parent) throw new Error('专家继续ID不存在或不属于本任务')
    if (role && (record.role !== role.id || record.agentId !== agentId)) throw new Error('专家角色或定义已变化，不能冒充原专家继续')
    if (isActive(record.id)) throw new Error('专家仍在运行或等待审批，不能重复继续')
    return record
  }
  return {
    async start(context: DelegationStartContext, role: SpecialistRole) {
      const parent = context.resourceId
      if (!parent) throw new Error('专家缺少父任务身份')
      const scope = await transaction(parent, state => {
        const resumed = Object.values(state.items).find(record => record.invocation === invocation(context) && record.status === 'running')
        if (resumed) {
          if (resumed.parentResourceId !== parent || resumed.agentId !== context.primitiveId || resumed.role !== role.id) throw new Error('原生审批恢复身份不一致')
          const scope = { parent, id: resumed.id, invocation: invocation(context) }
          active.set(scope.invocation, scope)
          return { ...scope, directory: resumed.directory }
        }
        const now = new Date().toISOString(), supplied = context.params.threadId === context.threadId ? undefined : context.params.threadId
        const continuing = state.intent?.id ?? supplied
        if (state.intent && supplied && supplied !== state.intent.id) throw new Error('本轮指定的专家继续ID不一致，拒绝另建专家')
        const record = continuing ? authorize(state.items[continuing], parent, role, context.primitiveId) : {
          id: `specialist-${createHash('sha256').update(invocation(context)).digest('hex').slice(0, 24)}`,
          role: role.id, agentId: context.primitiveId, parentResourceId: parent,
          directory: specialistDirectory(role.id, context.runId, context.toolCallId), title: context.prompt.slice(0, 180),
          createdAt: now, updatedAt: now, continuations: 0, status: 'running' as const, threads: [],
        }
        if (continuing && !record.threads.length) throw new Error('原专家尚无可恢复的原生消息上下文，不能假装继续')
        if (continuing) record.continuations++
        record.status = 'running'; record.updatedAt = now; record.invocation = invocation(context)
        state.items[record.id] = record
        const scope = { parent, id: record.id, invocation: invocation(context) }
        active.set(scope.invocation, scope)
        return { ...scope, directory: record.directory }
      })
      context.requestContext.set(SCOPE, scope)
      return scope
    },
    capture: { id: 'lumen-specialist-memory-index', async processInputStep(args) {
      const scope = args.requestContext?.get<typeof SCOPE, Scope>(SCOPE)
      if (!scope) throw new Error('专家历史缺少受信身份')
      const info = args.messageList.serialize().memoryInfo
      if (info?.threadId && info.resourceId) {
        const completed = args.messageList.get.response.db().filter(message => message.threadId === info.threadId)
        if (completed.length) await memory.saveMessages({ messages: completed })
      }
      if (info?.threadId && info.resourceId) await transaction(scope.parent, state => {
        const record = state.items[scope.id]
        if (record && !record.threads.some(item => item.threadId === info.threadId)) record.threads.push({ threadId: info.threadId!, resourceId: info.resourceId! })
      })
      return args.messageList
    } } satisfies InputProcessor,
    async messages(context: MessageFilterContext): Promise<MastraDBMessage[]> {
      const scope = active.get(invocation(context))
      if (!scope) throw new Error('专家委派未登记')
      const record = await transaction(scope.parent, state => structuredClone(state.items[scope.id]!), false)
      const messages: MastraDBMessage[] = []
      for (const thread of record.threads) {
        const stored = await memory.getThreadById({ threadId: thread.threadId })
        if (!stored || stored.resourceId !== thread.resourceId) throw new Error('专家原生历史身份不匹配')
        for (let page = 0;; page++) {
          const result = await memory.recall({ ...thread, page, perPage: 100, orderBy: { field: 'createdAt', direction: 'ASC' } })
          messages.push(...result.messages)
          if (!result.hasMore) break
        }
      }
      return messages.map(({ threadId: _thread, resourceId: _resource, ...message }) => message)
    },
    async complete(context: DelegationCompleteContext) {
      const scope = active.get(invocation(context))
      if (!scope) return null
      try { return await transaction(scope.parent, state => {
        const record = state.items[scope.id]!
        const { subAgentThreadId, subAgentResourceId, finishReason } = context.result
        if (subAgentThreadId && subAgentResourceId && !record.threads.some(thread => thread.threadId === subAgentThreadId)) record.threads.push({ threadId: subAgentThreadId, resourceId: subAgentResourceId })
        record.finishReason = finishReason
        record.status = !context.success ? 'failed' : !context.result.text.trim() || ['content-filter', 'length', 'tool-calls'].includes(finishReason ?? '') ? 'incomplete' : 'completed'
        record.updatedAt = new Date().toISOString()
        return structuredClone(record)
      }) } finally { active.delete(scope.invocation) }
    },
    async list(parent: string) {
      return transaction(parent, state => Object.values(state.items).map(record => ({ ...structuredClone(record),
        status: record.status === 'running' && !isActive(record.id) ? 'interrupted' as const : record.status })), false)
    },
    async prepare(parent: string, id: string, nonce: string) {
      return transaction(parent, async state => {
        const record = authorize(state.items[id], parent)
        if (state.intent?.owner === owner) throw new Error('已有专家继续请求尚未结束')
        if (!record.threads.length) throw new Error('原专家无可恢复消息')
        await cancelPriorDelegations(memory, storage, parent, new Set([`agent-${record.role}`]), record.invocation ?? 'missing-invocation')
        state.intent = { id, nonce, owner }; return structuredClone(record)
      })
    },
    async release(parent: string, nonce: string) {
      await transaction(parent, state => { if (state.intent?.nonce === nonce) delete state.intent })
    },
    async get(parent: string, id: string) { return transaction(parent, state => structuredClone(authorize(state.items[id], parent)), false) },
    async interrupt(parent?: string) {
      if (parent) await transaction(parent, async state => {
        delete state.intent
        await cancelPriorDelegations(memory, storage, parent, new Set(Object.values(state.items).map(record => `agent-${record.role}`)))
      })
      for (const [key, scope] of active) if (!parent || scope.parent === parent) {
        await transaction(scope.parent, state => { const record = state.items[scope.id]; if (record) { record.status = 'interrupted'; record.updatedAt = new Date().toISOString() } })
        active.delete(key)
      }
    },
  }
}
export type SpecialistHistory = ReturnType<typeof createSpecialistHistory>

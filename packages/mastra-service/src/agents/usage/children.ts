/**
 * [INPUT]: 公开委派身份、专家 processOutputStep 的真实 usage、Mastra threadState
 * [OUTPUT]: createChildUsage / ChildUsage：专家用量派生快照、原生步骤去重与持久读取
 * [POS]: 仅补齐 Controller 未汇总的专家消耗；不调度运行、不设置费用或 token 限额
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from 'node:crypto'
import type { DelegationStartContext } from '@mastra/core/agent'
import type { AgentControllerRequestContext, TokenUsage } from '@mastra/core/agent-controller'
import type { OutputProcessor } from '@mastra/core/processors'
import type { MastraStorage } from '@mastra/core/storage'

const STATE_TYPE = 'lumen.child-token-usage.v1'
const SCOPE_KEY = 'lumen.child-token-usage'
interface Scope { threadId: string; runId: string; toolCallId: string }
interface UsageState { steps: Record<string, TokenUsage> }
const optional = ['reasoningTokens', 'cachedInputTokens', 'cacheCreationInputTokens', 'cacheCreationInputTokens5m', 'cacheCreationInputTokens1h'] as const
const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined

function normalize(value: Record<string, unknown>): TokenUsage | null {
  const prompt = count(value.inputTokens), completion = count(value.outputTokens), total = count(value.totalTokens)
  if (prompt === undefined && completion === undefined && total === undefined) return null
  const usage: TokenUsage = { promptTokens: prompt ?? 0, completionTokens: completion ?? 0, totalTokens: total ?? (prompt ?? 0) + (completion ?? 0) }
  if (usage.promptTokens === 0 && usage.completionTokens === 0 && usage.totalTokens === 0) return null
  for (const key of optional) { const number = count(value[key]); if (number !== undefined) usage[key] = number }
  return usage
}

function sum(state: UsageState | undefined): TokenUsage | null {
  const steps = Object.values(state?.steps ?? {})
  if (!steps.length) return null
  const total: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  for (const usage of steps) {
    total.promptTokens += usage.promptTokens; total.completionTokens += usage.completionTokens; total.totalTokens += usage.totalTokens
    for (const key of optional) if (usage[key] !== undefined) total[key] = (total[key] ?? 0) + usage[key]
  }
  return total
}

export function createChildUsage(storage: Pick<MastraStorage, 'getStore'>) {
  // -- 同一父线程串行合并，步骤键沿用原生身份；已停止运行的迟到用量仍然有效。 --
  const writes = new Map<string, Promise<void>>()
  async function storeFor() {
    const store = await storage.getStore('threadState')
    if (!store) throw new Error('专家用量需要原生 threadState 存储')
    return store
  }
  async function record(scope: Scope, stepNumber: number, retryCount: number, usage: TokenUsage) {
    const key = createHash('sha256').update(JSON.stringify([scope.runId, scope.toolCallId, stepNumber, retryCount])).digest('hex')
    const pending = (writes.get(scope.threadId) ?? Promise.resolve()).catch(() => {}).then(async () => {
      const store = await storeFor()
      const state = await store.getState<UsageState>({ threadId: scope.threadId, type: STATE_TYPE }) ?? { steps: {} }
      if (JSON.stringify(state.steps[key]) === JSON.stringify(usage)) return
      state.steps[key] = usage
      await store.setState({ threadId: scope.threadId, type: STATE_TYPE, value: state })
    })
    writes.set(scope.threadId, pending)
    try { await pending } finally { if (writes.get(scope.threadId) === pending) writes.delete(scope.threadId) }
  }
  const outputProcessor: OutputProcessor = { id: 'lumen-child-token-usage', async processOutputStep(args) {
    const scope = args.requestContext?.get<typeof SCOPE_KEY, Scope>(SCOPE_KEY)
    const owner = args.requestContext?.get<'controller', AgentControllerRequestContext>('controller')
    if (!scope || scope.threadId !== owner?.resourceId) throw new Error('专家用量缺少受信父线程身份')
    const usage = normalize(args.usage as unknown as Record<string, unknown>)
    if (usage) await record(scope, args.stepNumber, args.retryCount, usage)
    return args.messageList
  } }
  return { outputProcessor,
    bind(context: DelegationStartContext) {
      const owner = context.requestContext.get<'controller', AgentControllerRequestContext>('controller')
      if (!owner?.resourceId || owner.resourceId !== context.resourceId || !context.runId || !context.toolCallId) throw new Error('专家用量需要原生委派身份')
      context.requestContext.set(SCOPE_KEY, { threadId: owner.resourceId, runId: context.runId, toolCallId: context.toolCallId } satisfies Scope)
    },
    async read(threadId: string): Promise<TokenUsage | null> {
      await writes.get(threadId)
      return sum(await (await storeFor()).getState<UsageState>({ threadId, type: STATE_TYPE }))
    },
  }
}

export type ChildUsage = ReturnType<typeof createChildUsage>

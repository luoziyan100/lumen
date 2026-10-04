/**
 * [INPUT]: 原生模型步骤用量、受信父线程身份、threadState 与显式预算/模型价格
 * [OUTPUT]: createFamilyBudget：父子共享的响应身份准入、输入输出配对结算和只读用量
 * [POS]: 在 Mastra processor 边界控制下一次调用；不实现模型循环或账单系统
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from 'node:crypto'
import type { DelegationStartContext } from '@mastra/core/agent'
import type { AgentControllerRequestContext } from '@mastra/core/agent-controller'
import type { InputProcessor, OutputProcessor } from '@mastra/core/processors'
import type { RequestContext } from '@mastra/core/request-context'
import type { MastraStorage } from '@mastra/core/storage'
import type { ModelPricing, ResearchBudget } from '../../settings/types.ts'

const STATE = 'lumen.family-budget.v1', SCOPE = 'lumen.family-budget-scope', PROCESSOR = 'lumen-family-budget'
interface ModelStep { key: string; scope: Scope }
const stepsFor = (state: Record<string, unknown>) => (state.steps ??= {}) as Record<string, ModelStep>
const stepSlot = (step: number, retry: number) => `${step}:${retry}`
interface Scope { resourceId: string; runId: string; callId: string }
interface Receipt { input?: number; output?: number; cost?: number; pricing?: ModelPricing }
interface Reservation { scope: Scope; input: number; output: number; cost?: number; pricing?: ModelPricing }
interface State { receipts: Record<string, Receipt>; pending: Record<string, Reservation>; lastMainInputTokens?: number }
interface Options {
  storage: Pick<MastraStorage, 'getStore'>
  limits: () => ResearchBudget
  pricing: (resourceId?: string) => ModelPricing | undefined
  contextWindow?: (resourceId?: string) => number
  mainRunId: (resourceId: string) => string | null | undefined
}
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
const cost = (input: number, output: number, pricing: ModelPricing | undefined) => pricing ? (input * pricing.inputUsdPerMillion + output * pricing.outputUsdPerMillion) / 1_000_000 : undefined

function totals(state: State) {
  const values = Object.values(state.receipts)
  return { promptTokens: values.reduce((n, value) => n + (value.input ?? 0), 0),
    completionTokens: values.reduce((n, value) => n + (value.output ?? 0), 0),
    knownCostUsd: values.reduce((n, value) => n + (value.cost ?? 0), 0),
    unknownTokens: values.some(value => value.input === undefined || value.output === undefined),
    unknownCost: values.some(value => value.cost === undefined) }
}

export function createFamilyBudget(options: Options) {
  const tails = new Map<string, Promise<unknown>>(), active = new Set<string>()
  async function transact<T>(resourceId: string, work: (state: State) => T | Promise<T>, save = true): Promise<T> {
    const pending = (tails.get(resourceId) ?? Promise.resolve()).catch(() => {}).then(async () => {
      const store = await options.storage.getStore('threadState')
      if (!store) throw new Error('研究预算需要原生 threadState')
      const state = await store.getState<State>({ threadId: resourceId, type: STATE }) ?? { receipts: {}, pending: {} }
      const result = await work(state)
      if (save) await store.setState({ threadId: resourceId, type: STATE, value: state })
      return result
    })
    tails.set(resourceId, pending)
    try { return await pending } finally { if (tails.get(resourceId) === pending) tails.delete(resourceId) }
  }
  function scopeFor(requestContext: RequestContext | undefined): Scope {
    const owner = requestContext?.get<'controller', AgentControllerRequestContext>('controller')
    if (!owner?.resourceId) throw new Error('研究预算需要受信父线程')
    const child = requestContext?.get<typeof SCOPE, Scope>(SCOPE)
    if (child) { if (child.resourceId !== owner.resourceId) throw new Error('预算身份不一致'); return child }
    const runId = options.mainRunId(owner.resourceId)
    if (!runId) throw new Error('研究预算需要原生运行身份')
    return { resourceId: owner.resourceId, runId, callId: 'main' }
  }
  const keyFor = (scope: Scope, messageId: string, step: number, retry: number) => createHash('sha256').update(JSON.stringify([scope, messageId, step, retry])).digest('hex')
  function assertAvailable(state: State, input = 0, output = 0, price?: ModelPricing) {
    const limits = options.limits(), used = totals(state), pending = Object.values(state.pending)
    const unresolved = Object.keys(state.pending).some(key => !active.has(key))
    if ((limits.maxPromptTokens || limits.maxCompletionTokens) && (used.unknownTokens || unresolved)) throw new Error('此前模型调用用量未知，无法安全执行 token 预算；请显式调整预算或新建研究')
    if (limits.maxCostUsd && (!price || used.unknownCost || unresolved || pending.some(value => value.cost === undefined))) throw new Error('模型价格或此前费用未知，不能将未知费用视为零；请配置对应模型价格或显式取消费用限制')
    if (limits.maxPromptTokens && used.promptTokens + pending.reduce((n, value) => n + value.input, 0) + input > limits.maxPromptTokens || limits.maxPromptTokens && used.promptTokens >= limits.maxPromptTokens) throw new Error('父子研究输入 token 预算不足，拒绝下一次模型调用')
    if (limits.maxCompletionTokens && used.completionTokens + pending.reduce((n, value) => n + value.output, 0) + output > limits.maxCompletionTokens || limits.maxCompletionTokens && used.completionTokens >= limits.maxCompletionTokens) throw new Error('父子研究输出 token 预算不足，拒绝下一次模型调用')
    if (limits.maxCostUsd && used.knownCostUsd + pending.reduce((n, value) => n + (value.cost ?? 0), 0) + (cost(input, output, price) ?? 0) > limits.maxCostUsd || limits.maxCostUsd && used.knownCostUsd >= limits.maxCostUsd) throw new Error('父子研究费用预算不足，拒绝下一次模型调用')
  }
  const inputProcessor: InputProcessor = { id: PROCESSOR, async processInputStep(args) {
    if (!args.messageId) throw new Error('研究预算需要原生响应消息身份')
    const scope = scopeFor(args.requestContext), key = keyFor(scope, args.messageId, args.stepNumber, args.retryCount)
    const limits = options.limits(), pricing = options.pricing(scope.resourceId)
    // UTF-8 字节数加协议余量作为文本请求的保守预留；真实计量以 provider usage 为准。
    const input = Buffer.byteLength(JSON.stringify([args.systemMessages, args.messages, args.tools ?? {}]), 'utf8') + 256
    const limited = !!(limits.maxPromptTokens || limits.maxCompletionTokens || limits.maxCostUsd)
    let output = args.modelSettings?.maxOutputTokens ?? 4096
    await transact(scope.resourceId, state => {
      if (state.receipts[key]) throw new Error('同一模型步骤已结算，禁止重放')
      if (state.pending[key]) throw new Error('同一模型步骤已在执行，拒绝重复准入')
      const used = totals(state), pending = Object.values(state.pending)
      if (limits.maxCompletionTokens) output = Math.min(output, limits.maxCompletionTokens - used.completionTokens - pending.reduce((n, item) => n + item.output, 0))
      if (limits.maxCostUsd && pricing && pricing.outputUsdPerMillion > 0) {
        const available = limits.maxCostUsd - used.knownCostUsd - pending.reduce((n, item) => n + (item.cost ?? 0), 0) - cost(input, 0, pricing)!
        output = Math.min(output, Math.floor(available * 1_000_000 / pricing.outputUsdPerMillion))
      }
      if (limited && output < 1) throw new Error('父子研究剩余预算不足以生成一个输出 token')
      assertAvailable(state, limited ? input : 0, limited ? output : 0, pricing)
      state.pending[key] = { scope, input: limited ? input : 0, output: limited ? output : 0, cost: pricing ? cost(limited ? input : 0, limited ? output : 0, pricing) : undefined, pricing }
      active.add(key)
    })
    // 同一 processor ID 的原生请求状态连接输入/输出；输出不能重新读取已变化的 Controller run。
    stepsFor(args.state)[stepSlot(args.stepNumber, args.retryCount)] = { key, scope }
    return limited ? { modelSettings: { ...args.modelSettings, maxOutputTokens: output } } : args.messageList
  } }
  const outputProcessor: OutputProcessor = { id: PROCESSOR, async processOutputStep(args) {
    const admitted = stepsFor(args.state)[stepSlot(args.stepNumber, args.retryCount)]
    if (!admitted) throw new Error('模型用量缺少对应的预算准入身份')
    const { scope, key } = admitted
    await transact(scope.resourceId, state => {
      const previous = state.receipts[key]
      if (previous?.input !== undefined && previous.output !== undefined) return
      const reservation = state.pending[key]
      const input = number(args.usage?.inputTokens), output = number(args.usage?.outputTokens)
      if (scope.callId === 'main' && input !== undefined) state.lastMainInputTokens = input
      state.receipts[key] = { input, output, cost: input === undefined || output === undefined ? undefined : cost(input, output, reservation?.pricing ?? previous?.pricing) }
      delete state.pending[key]; active.delete(key)
    })
    return args.messageList
  } }
  return { inputProcessor, outputProcessor,
    async initialize(resourceId: string, previous: { promptTokens?: number; completionTokens?: number } | null, hasHistory: boolean) {
      await transact(resourceId, state => {
        if (Object.keys(state.receipts).length || Object.keys(state.pending).length || !hasHistory) return
        state.receipts.baseline = { input: previous?.promptTokens, output: previous?.completionTokens }
      })
    },
    async admit(context: DelegationStartContext) {
      const owner = context.requestContext.get<'controller', AgentControllerRequestContext>('controller')
      if (!owner?.resourceId || owner.resourceId !== context.resourceId) throw new Error('委派预算需要受信父身份')
      await transact(owner.resourceId, state => assertAvailable(state, 0, 0, options.pricing(owner.resourceId)), false)
      context.requestContext.set(SCOPE, { resourceId: owner.resourceId, runId: context.runId, callId: context.toolCallId } satisfies Scope)
    },
    async finish(resourceId: string, runId?: string, callId?: string) {
      await transact(resourceId, state => {
        for (const [key, pending] of Object.entries(state.pending)) {
          if (runId && pending.scope.runId !== runId || callId && pending.scope.callId !== callId) continue
          state.receipts[key] ??= { pricing: pending.pricing }; delete state.pending[key]; active.delete(key)
        }
      })
    },
    async read(resourceId: string) {
      return transact(resourceId, state => {
        const usage = totals(state), pending = Object.values(state.pending)
        return { limits: options.limits(), lastMainInputTokens: state.lastMainInputTokens ?? null, contextWindow: options.contextWindow?.(resourceId) ?? 128000, usage: { ...usage, costUsd: usage.unknownCost ? null : usage.knownCostUsd },
          reserved: { promptTokens: pending.reduce((n, item) => n + item.input, 0), completionTokens: pending.reduce((n, item) => n + item.output, 0), calls: pending.length },
          unresolvedCalls: Object.keys(state.pending).filter(key => !active.has(key)).length,
          semantics: '会话累计主子步骤；文本请求保守预留，完成后按真实usage结算；不是供应商账单硬上限，图像和未知计费可能超出预留。' }
      }, false)
    },
  }
}
export type FamilyBudget = ReturnType<typeof createFamilyBudget>

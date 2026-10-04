/**
 * [INPUT]: 原生步骤编号/processor state、Controller Session 生命周期和根停止回调
 * [OUTPUT]: createRunBudget：主运行步骤上限、活动计时、观察绑定与关闭入口
 * [POS]: 仅存本进程计时句柄；预算用时随原生 processor state 落快照，不建第二套运行账
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { performance } from 'node:perf_hooks'
import type { Session, AgentControllerRequestContext } from '@mastra/core/agent-controller'
import type { InputProcessor } from '@mastra/core/processors'

interface ActiveBudget { runId: string; elapsed: number; started: number | null; timer?: ReturnType<typeof setTimeout>; state: Record<string, unknown>; expired: boolean }
export interface RunBudgetOptions { maxSteps?: number; maxActiveMs?: number; onTimeout?: (resourceId: string) => void | Promise<void> }

export function createRunBudget(options: RunBudgetOptions = {}) {
  const maxSteps = options.maxSteps ?? 100, maxActiveMs = options.maxActiveMs ?? 1_200_000
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || !Number.isFinite(maxActiveMs) || maxActiveMs < 1) throw new Error('运行预算必须为正数，步数必须是整数')
  const active = new Map<string, ActiveBudget>(), sessions = new Map<string, { session: Session; unsubscribe: () => void }>()
  function pause(budget: ActiveBudget) {
    if (budget.started !== null) budget.elapsed += performance.now() - budget.started
    budget.started = null; clearTimeout(budget.timer); budget.timer = undefined
    budget.state.activeMilliseconds = budget.elapsed
  }
  function start(resourceId: string, budget: ActiveBudget) {
    if (budget.started !== null || budget.expired) return
    budget.started = performance.now()
    budget.timer = setTimeout(() => {
      pause(budget); budget.expired = true
      const session = sessions.get(resourceId)?.session
      session?.abort()
      session?.emit({ type: 'error', error: new Error(`本次研究已达到 ${Math.round(maxActiveMs / 1000)} 秒活动时间上限，已停止。`), errorType: 'run_budget' })
      void Promise.resolve(options.onTimeout?.(resourceId)).catch(error => session?.emit({ type: 'error', error: error instanceof Error ? error : new Error(String(error)), errorType: 'run_budget_cleanup' }))
    }, Math.max(1, maxActiveMs - budget.elapsed))
    budget.timer.unref()
  }
  const inputProcessor: InputProcessor = { id: 'lumen-run-budget', processInputStep(args) {
    const owner = args.requestContext?.get<'controller', AgentControllerRequestContext>('controller')
    if (!owner?.resourceId || !sessions.has(owner.resourceId)) throw new Error('运行预算需要已绑定的主 Controller 会话')
    const runId = args.runId ?? sessions.get(owner.resourceId)!.session.run.getRunId()
    if (!runId) throw new Error('运行预算需要原生 runId')
    if (args.stepNumber >= maxSteps) throw new Error(`本次研究已达到 ${maxSteps} 个模型步骤上限，已停止。`)
    let budget = active.get(owner.resourceId)
    if (budget && budget.runId !== runId) { pause(budget); active.delete(owner.resourceId); budget = undefined }
    if (!budget) {
      const elapsed = typeof args.state.activeMilliseconds === 'number' ? args.state.activeMilliseconds : 0
      budget = { runId, elapsed, started: null, state: args.state, expired: false }
      active.set(owner.resourceId, budget)
    }
    pause(budget); budget.state = args.state; budget.state.activeMilliseconds = budget.elapsed
    if (budget.expired || budget.elapsed >= maxActiveMs) throw new Error('本次研究已达到活动时间上限，已停止。')
    start(owner.resourceId, budget)
    return args.messageList
  } }
  return { inputProcessor,
    observe(session: Session) {
      const resourceId = session.identity.getResourceId()
      if (sessions.has(resourceId)) return
      const unsubscribe = session.subscribe(event => {
        const budget = active.get(resourceId)
        if (!budget) return
        if (event.type === 'tool_approval_required' || event.type === 'tool_suspended') pause(budget)
        if (event.type === 'agent_start' || event.type === 'tool_start') start(resourceId, budget)
        if (event.type === 'agent_end') { pause(budget); if (event.reason !== 'suspended') active.delete(resourceId) }
      })
      sessions.set(resourceId, { session, unsubscribe })
    },
    close() {
      for (const budget of active.values()) pause(budget)
      for (const { unsubscribe } of sessions.values()) unsubscribe()
      active.clear(); sessions.clear()
    },
  }
}

/**
 * [INPUT]: task-store.ts 的 TaskEvent
 * [OUTPUT]: TaskBudget / BudgetUsage / DEFAULT_BUDGET / mergeBudget / computeBudgetUsage / formatBudgetUsage
 * [POS]: §存储层。event-sourced 预算计量，搬自 old_lumen agent/budget.ts 并适配本项目事件形状
 *
 * 与 core/limits.ts 区分：Limits 是循环内的硬上限；这里从持久化事件算"已用量"，供恢复与 UI。
 */
import type { TaskEvent } from './task-store.ts'

export interface TaskBudget {
  maxSteps: number
  maxSeconds: number
  maxPromptTokens?: number
  maxCompletionTokens?: number
  maxCostUsd?: number
}

export const DEFAULT_BUDGET: TaskBudget = { maxSteps: 100, maxSeconds: 1200 }

export type BudgetExhaustedDimension = 'steps' | 'time' | 'prompt_tokens' | 'completion_tokens' | 'cost'

export interface BudgetUsage {
  steps: number
  elapsedSeconds: number
  maxSteps: number
  maxSeconds: number
  stepsRemaining: number
  secondsRemaining: number
  promptTokens?: number
  completionTokens?: number
  costUsd?: number
  exhausted: boolean
  exhaustedDimension?: BudgetExhaustedDimension
}

export function mergeBudget(partial?: Partial<TaskBudget>): TaskBudget {
  const budget: TaskBudget = {
    maxSteps: Math.max(1, partial?.maxSteps ?? DEFAULT_BUDGET.maxSteps),
    maxSeconds: Math.max(1, partial?.maxSeconds ?? DEFAULT_BUDGET.maxSeconds),
  }
  if (partial?.maxPromptTokens && partial.maxPromptTokens > 0) budget.maxPromptTokens = partial.maxPromptTokens
  if (partial?.maxCompletionTokens && partial.maxCompletionTokens > 0) budget.maxCompletionTokens = partial.maxCompletionTokens
  if (partial?.maxCostUsd && partial.maxCostUsd > 0) budget.maxCostUsd = partial.maxCostUsd
  return budget
}

function parseIso(ts: string | null | undefined): number | null {
  if (!ts) return null
  const n = Date.parse(ts)
  return Number.isFinite(n) ? n : null
}

function findStartMs(events: TaskEvent[]): number | null {
  for (const event of events) {
    if (event.kind !== 'status_change') continue
    try {
      const payload = JSON.parse(event.payload_json) as { to?: string }
      if (payload.to === 'running') {
        const t = parseIso(event.created_at)
        if (t != null) return t
      }
    } catch {
      // skip corrupt
    }
  }
  return null
}

export function computeBudgetUsage(budget: TaskBudget, events: TaskEvent[], nowMs: number = Date.now()): BudgetUsage {
  const steps = events.filter((e) => e.kind === 'model_step').length
  let stepExt = 0
  let secExt = 0
  let promptTokens = 0
  let completionTokens = 0
  let costUsd = 0
  let hasUsage = false
  let hasCost = false

  for (const event of events) {
    try {
      if (event.kind === 'budget_extension') {
        const p = JSON.parse(event.payload_json) as { extraSteps?: number; extraSeconds?: number }
        if (typeof p.extraSteps === 'number' && p.extraSteps > 0) stepExt += p.extraSteps
        if (typeof p.extraSeconds === 'number' && p.extraSeconds > 0) secExt += p.extraSeconds
      } else if (event.kind === 'model_step') {
        const p = JSON.parse(event.payload_json) as {
          usage?: { promptTokens?: number; completionTokens?: number; costUsd?: number }
        }
        if (p.usage) {
          hasUsage = true
          promptTokens += p.usage.promptTokens ?? 0
          completionTokens += p.usage.completionTokens ?? 0
          if (typeof p.usage.costUsd === 'number') {
            hasCost = true
            costUsd += p.usage.costUsd
          }
        }
      }
    } catch {
      // ignore corrupt payloads
    }
  }

  const maxSteps = budget.maxSteps + stepExt
  const maxSeconds = budget.maxSeconds + secExt
  const startMs = findStartMs(events)
  const elapsedSeconds = startMs == null ? 0 : Math.max(0, (nowMs - startMs) / 1000)
  const stepsRemaining = Math.max(0, maxSteps - steps)
  const secondsRemaining = Math.max(0, maxSeconds - elapsedSeconds)
  const overPrompt = budget.maxPromptTokens != null && hasUsage && promptTokens >= budget.maxPromptTokens
  const overCompletion = budget.maxCompletionTokens != null && hasUsage && completionTokens >= budget.maxCompletionTokens
  const overCost = budget.maxCostUsd != null && hasCost && costUsd >= budget.maxCostUsd

  const exhaustedDimension: BudgetExhaustedDimension | undefined =
    stepsRemaining <= 0 ? 'steps'
      : secondsRemaining <= 0 ? 'time'
        : overPrompt ? 'prompt_tokens'
          : overCompletion ? 'completion_tokens'
            : overCost ? 'cost'
              : undefined

  const usage: BudgetUsage = {
    steps,
    elapsedSeconds,
    maxSteps,
    maxSeconds,
    stepsRemaining,
    secondsRemaining,
    exhausted: exhaustedDimension != null,
  }
  if (hasUsage) {
    usage.promptTokens = promptTokens
    usage.completionTokens = completionTokens
  }
  if (hasCost) usage.costUsd = costUsd
  if (exhaustedDimension) usage.exhaustedDimension = exhaustedDimension
  return usage
}

export function formatBudgetUsage(usage: BudgetUsage): string {
  const s = Math.round(usage.elapsedSeconds)
  const fmt = (sec: number) => (sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m${sec % 60 ? `${sec % 60}s` : ''}`)
  return `${usage.steps}/${usage.maxSteps} 步 · ${fmt(s)}/${fmt(usage.maxSeconds)}`
}

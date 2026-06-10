import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeBudgetUsage, mergeBudget, DEFAULT_BUDGET } from '../../src/storage/budget.ts'
import type { TaskEvent } from '../../src/storage/task-store.ts'

function ev(seq: number, kind: string, payload: unknown, createdAt = '2026-06-08T00:00:00.000Z'): TaskEvent {
  return { id: `e${seq}`, task_id: 't', seq, kind, payload_json: JSON.stringify(payload), agent_role: null, created_at: createdAt }
}

test('mergeBudget 用默认值兜底，过滤非正数维度', () => {
  const b = mergeBudget({ maxSteps: 5 })
  assert.equal(b.maxSteps, 5)
  assert.equal(b.maxSeconds, DEFAULT_BUDGET.maxSeconds)
  assert.equal(b.maxPromptTokens, undefined)
})

test('computeBudgetUsage 统计 model_step 步数与 token 累加', () => {
  const events: TaskEvent[] = [
    ev(1, 'status_change', { to: 'running' }, '2026-06-08T00:00:00.000Z'),
    ev(2, 'model_step', { usage: { promptTokens: 100, completionTokens: 20 } }),
    ev(3, 'tool_result', { id: 't1' }),
    ev(4, 'model_step', { usage: { promptTokens: 150, completionTokens: 30 } }),
  ]
  const usage = computeBudgetUsage(mergeBudget({ maxSteps: 10 }), events, Date.parse('2026-06-08T00:00:05.000Z'))
  assert.equal(usage.steps, 2)
  assert.equal(usage.promptTokens, 250)
  assert.equal(usage.completionTokens, 50)
  assert.equal(usage.elapsedSeconds, 5)
  assert.equal(usage.exhausted, false)
})

test('computeBudgetUsage 步数耗尽时标记 exhausted=steps', () => {
  const events = [
    ev(1, 'status_change', { to: 'running' }),
    ev(2, 'model_step', {}),
    ev(3, 'model_step', {}),
  ]
  const usage = computeBudgetUsage(mergeBudget({ maxSteps: 2 }), events)
  assert.equal(usage.exhausted, true)
  assert.equal(usage.exhaustedDimension, 'steps')
})

test('budget_extension 抬高上限', () => {
  const events = [
    ev(1, 'status_change', { to: 'running' }),
    ev(2, 'model_step', {}),
    ev(3, 'model_step', {}),
    ev(4, 'budget_extension', { extraSteps: 5 }),
  ]
  const usage = computeBudgetUsage(mergeBudget({ maxSteps: 2 }), events, Date.parse('2026-06-08T00:00:01.000Z'))
  assert.equal(usage.maxSteps, 7)
  assert.equal(usage.exhausted, false)
})

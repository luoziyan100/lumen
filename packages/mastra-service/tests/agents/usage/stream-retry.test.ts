/**
 * [INPUT]: the full application (Controller, family budget, LibSQL) and the provider HTTP fixture whose first stream is reset after one text delta
 * [OUTPUT]: R2 evidence: a mid-reply ECONNRESET retried by Mastra's default stream error processor is one step, and the thread usage holds the
 *           successful attempt's tokens. With a limit, the failed attempt becomes a retried receipt (input = the admission estimate, output 0) next to the
 *           successful one and later admissions go on; without a limit the failed attempt still settles as unknown, as before
 * [POS]: upgrade guard for #30696 (1.85) and for adapter A4 (the admission key carries the response messageId and step/retry; the retry keeps both and bumps retry)
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentControllerEvent } from '@mastra/core/agent-controller'
import { createApplication } from '../../../src/application.ts'
import { FAMILY_BUDGET_STATE } from '../../../src/agents/budget/index.ts'
import type { ResearchBudget } from '../../../src/settings/types.ts'
import { fixtureProvider } from '../../provider-fixture.ts'

interface Receipt { input?: number; output?: number; retried?: true }

async function retried(limits: ResearchBudget, check: (app: Awaited<ReturnType<typeof createApplication>>, session: Awaited<ReturnType<Awaited<ReturnType<typeof createApplication>>['session']>>, requests: unknown[]) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'lumen-stream-retry-'))
  let attempt = 0
  const fixture = fixtureProvider(() => ++attempt === 1
    ? { content: '半句', cut: true, usage: { prompt_tokens: 500, completion_tokens: 500, total_tokens: 1000 } }
    : { content: attempt === 2 ? '重试后的完整回答' : '下一轮照常回答', usage: { prompt_tokens: 30, completion_tokens: 7, total_tokens: 37 } })
  const app = await createApplication({ dataRoot: root, researchBudget: () => limits, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  try {
    const session = await app.session('p', 'retry')
    const events: AgentControllerEvent[] = []
    session.subscribe(event => { events.push(event) })
    await session.sendMessage({ content: '解释这篇论文' })
    assert.equal(fixture.requests.length, 2, 'the framework retried the reset stream once')
    assert.equal((events.find(event => event.type === 'agent_end') as { reason?: string } | undefined)?.reason, 'complete')
    assert.match(JSON.stringify(await session.thread.listMessages({ threadId: 'p:retry' })), /重试后的完整回答/)
    const steps = events.filter(event => event.type === 'usage_update' && (event as { usage: { totalTokens: number } }).usage.totalTokens > 0)
    assert.equal(steps.length, 1, `one step-finish, got ${JSON.stringify(steps)}`)
    const usage = session.getTokenUsage()
    assert.deepEqual({ prompt: usage.promptTokens, completion: usage.completionTokens }, { prompt: 30, completion: 7 })
    await check(app, session, fixture.requests)
  } finally { await app.close(); await rm(root, { recursive: true, force: true }) }
}

async function receipts(app: Awaited<ReturnType<typeof createApplication>>) {
  const store = await app.storage.getStore('threadState')
  return Object.values((await store!.getState<{ receipts: Record<string, Receipt> }>({ threadId: 'p:retry', type: FAMILY_BUDGET_STATE }))!.receipts)
}

test('R2 with a token limit: the retried attempt is a receipt of its input estimate, the success keeps provider usage, and the next turn is admitted', { timeout: 30000 }, async () => {
  await retried({ maxPromptTokens: 1_000_000 }, async (app, session, requests) => {
    const [failed, ...rest] = (await receipts(app)).sort((a, b) => Number(!a.retried) - Number(!b.retried))
    assert.equal(failed!.retried, true)
    assert.ok(failed!.input! > 0 && failed!.output === 0, JSON.stringify(failed))
    assert.deepEqual(rest.map(receipt => [receipt.input, receipt.output, receipt.retried]), [[30, 7, undefined]])
    const budget = await app.familyBudget.read('p:retry')
    assert.equal(budget.usage.unknownTokens, false)
    assert.equal(budget.usage.promptTokens, failed!.input! + 30)
    assert.deepEqual({ calls: budget.reserved.calls, unresolved: budget.unresolvedCalls }, { calls: 0, unresolved: 0 })
    await session.sendMessage({ content: '再核对一处' })
    assert.equal(requests.length, 3, 'the next turn reached the model')
    assert.match(JSON.stringify(await session.thread.listMessages({ threadId: 'p:retry' })), /下一轮照常回答/)
  })
})

test('R2 without a limit: nothing changes; the failed attempt still settles as unknown and the success keeps provider usage', { timeout: 30000 }, async () => {
  await retried({}, async app => {
    const all = await receipts(app)
    assert.equal(all.length, 2)
    assert.ok(all.some(receipt => receipt.input === undefined && receipt.output === undefined && !receipt.retried), JSON.stringify(all))
    assert.ok(all.some(receipt => receipt.input === 30 && receipt.output === 7), JSON.stringify(all))
    const budget = await app.familyBudget.read('p:retry')
    assert.deepEqual({ prompt: budget.usage.promptTokens, completion: budget.usage.completionTokens, unknown: budget.usage.unknownTokens }, { prompt: 30, completion: 7, unknown: true })
  })
})

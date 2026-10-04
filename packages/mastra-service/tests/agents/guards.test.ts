/**
 * [INPUT]: 真实 AgentController/Memory、原生 processor 和可控 provider HTTP 边界
 * [OUTPUT]: 空答复纠正/报错、步骤及活动时间停止、等待暂停和持久历史回读的行为证据
 * [POS]: 产品运行守卫集成回归；不直接调用 processor 模拟框架生命周期
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { Agent, type ToolsInput } from '@mastra/core/agent'
import { AgentController, type AgentControllerEvent } from '@mastra/core/agent-controller'
import { Mastra } from '@mastra/core/mastra'
import { createTool } from '@mastra/core/tools'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { z } from 'zod'
import { createRunBudget, type RunBudgetOptions } from '../../src/agents/guards/budget.ts'
import { createEmptyActionProcessor } from '../../src/agents/guards/empty-action.ts'
import { createHistoryTools } from '../../src/agents/guards/history.ts'
import { createInputProcessors } from '../../src/agents/context.ts'
import { trackAgentDrain } from '../../src/drain.ts'
import { createModelGateway, modelId } from '../../src/model.ts'
import { fixtureProvider, textReply, toolReply, type ProviderRequest, type Reply } from '../provider-fixture.ts'

async function harness(respond: (request: ProviderRequest, signal?: AbortSignal | null) => Reply | Promise<Reply>, options: { budget?: RunBudgetOptions; tools?: ToolsInput; history?: true } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'lumen-native-guards-'))
  const fixture = fixtureProvider(respond), settings = { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch }
  const storage = new LibSQLStore({ id: 'guards', url: `file:${join(root, 'memory.sqlite')}` })
  const memory = new Memory({ storage, options: { lastMessages: 100, semanticRecall: false, workingMemory: { enabled: false } } })
  const budget = createRunBudget(options.budget), gateway = createModelGateway(settings)
  const history = createHistoryTools(memory, (resource, thread) => { assert.equal(resource, 'p:task'); assert.equal(thread, resource) })
  const agent = new Agent({ id: 'research', name: 'Research', instructions: '执行用户研究并提供可见答复', model: modelId(settings), memory,
    tools: { ...options.tools, ...options.history ? history : {} }, inputProcessors: [budget.inputProcessor, ...createInputProcessors({ contextWindow: 1800 })],
    outputProcessors: [createEmptyActionProcessor()], maxProcessorRetries: 1,
  })
  const drain = trackAgentDrain(agent)
  const controller = new AgentController({ id: 'lumen', agent, storage, memory, gateways: [gateway],
    modes: [{ id: 'research', name: 'Research', defaultModelId: modelId(settings), metadata: { default: true } }],
    disableBuiltinTools: ['submit_plan', 'subagent', 'task_write', 'task_update', 'task_complete', 'task_check'],
  })
  const mastra = new Mastra({ agents: { research: agent }, agentControllers: { lumen: controller }, storage, gateways: { lumen: gateway } })
  await controller.init()
  const session = await controller.createSession({ resourceId: 'p:task', threadId: 'p:task' })
  budget.observe(session)
  for (const toolName of ['ask_user', 'read_history', ...Object.keys(options.tools ?? {})]) await session.permissions.setForTool({ toolName, policy: 'allow' })
  const events: AgentControllerEvent[] = []; session.subscribe(event => { events.push(event) })
  return { session, fixture, events, memory, drain,
    async close() { session.abort(); await drain(); budget.close(); await controller.destroy(); await mastra.shutdown(); await storage.close(); await rm(root, { recursive: true, force: true }) },
  }
}

test('原生 Controller 遇到空答复反馈一次后继续，连续为空明确失败', { timeout: 30000 }, async () => {
  let calls = 0
  const recovered = await harness(request => {
    if (++calls === 1) return textReply('')
    assert.match(JSON.stringify(request.messages), /Processor Feedback/)
    return textReply('纠正后的可见答复')
  })
  try {
    await recovered.session.sendMessage({ content: '解释材料' }); await recovered.drain()
    assert.equal(calls, 2)
    assert.match(JSON.stringify(await recovered.session.thread.listMessages({ threadId: 'p:task' })), /纠正后的可见答复/)
    assert.ok(!recovered.events.some(event => event.type === 'error'))
  } finally { await recovered.close() }
  const failed = await harness(() => textReply(''))
  try {
    await failed.session.sendMessage({ content: '解释材料' }); await failed.drain()
    assert.equal(failed.fixture.requests.length, 2)
    assert.ok(failed.events.some(event => event.type === 'error' && /连续两轮/.test(event.error.message)))
  } finally { await failed.close() }
})

test('原生 Controller 的 1000 默认步数不能越过产品限制，慢模型被活动计时真正取消', { timeout: 30000 }, async () => {
  let executed = 0
  const steps = await harness(() => toolReply('ping', {}, `ping-${executed}`), { budget: { maxSteps: 2 },
    tools: { ping: createTool({ id: 'ping', description: '核验一个材料', inputSchema: z.object({}), execute: async () => { executed++; return 'checked' } }) },
  })
  try {
    await steps.session.sendMessage({ content: '持续核验' }); await steps.drain()
    assert.equal(executed, 2); assert.equal(steps.fixture.requests.length, 2)
    assert.ok(steps.events.some(event => event.type === 'error' && /2 个模型步骤/.test(event.error.message)))
  } finally { await steps.close() }
  let cancelled = false
  const slow = await harness(async (_request, signal) => {
    await new Promise<void>((_resolve, reject) => {
      if (signal?.aborted) { cancelled = true; reject(signal.reason); return }
      signal?.addEventListener('abort', () => { cancelled = true; reject(signal.reason) }, { once: true })
    })
    return textReply('不应执行')
  }, { budget: { maxActiveMs: 250 } })
  try {
    await slow.session.sendMessage({ content: '读取慢资料' }); await slow.drain()
    assert.equal(cancelled, true)
    assert.ok(slow.events.some(event => event.type === 'error' && /活动时间上限/.test(event.error.message)))
  } finally { await slow.close() }
})

test('等待 ask_user 超过活动上限仍可原生恢复，等待时间不计入预算', { timeout: 30000 }, async () => {
  const app = await harness(request => request.messages.some(message => message.role === 'tool')
    ? textReply('收到答案，继续完成') : toolReply('ask_user', { question: '选哪个章节？', options: [{ label: '方法' }] }, 'ask'), { budget: { maxActiveMs: 1000 } })
  try {
    await app.session.sendMessage({ content: '研究资料' }); await app.drain()
    assert.equal(app.session.displayState.get().pendingSuspensions.size, 1)
    await delay(1200)
    assert.ok(!app.events.some(event => event.type === 'error'))
    await app.session.respondToToolSuspension({ toolCallId: 'ask', resumeData: '方法' }); await app.drain()
    assert.match(JSON.stringify(await app.session.thread.listMessages({ threadId: 'p:task' })), /收到答案，继续完成/)
    assert.ok(!app.events.some(event => event.type === 'error'))
  } finally { await app.close() }
})

test('模型能从当前 thread 回读裁掉的历史，不能通过参数读取其他项目', { timeout: 30000 }, async () => {
  let calls = 0
  const app = await harness(request => {
    if (++calls === 1) {
      assert.doesNotMatch(JSON.stringify(request.messages), /ARCHIVED_USER_REQUIREMENT/)
      return toolReply('read_history', { page: 0, perPage: 1, limit: 600 }, 'history')
    }
    if (calls === 2) {
      assert.match(JSON.stringify(request.messages), /ARCHIVED_USER_REQUIREMENT/)
      assert.doesNotMatch(JSON.stringify(request.messages), /OTHER_PROJECT_SECRET/)
      return toolReply('read_history', { page: 0, threadId: 'other:task' }, 'escape')
    }
    assert.doesNotMatch(JSON.stringify(request.messages), /OTHER_PROJECT_SECRET/)
    return textReply('已恢复用户的历史约束')
  }, { history: true })
  try {
    await app.memory.saveMessages({ messages: [{ id: 'old', threadId: 'p:task', resourceId: 'p:task', role: 'user', createdAt: new Date(0),
      content: { format: 2, parts: [{ type: 'text', text: `ARCHIVED_USER_REQUIREMENT ${'old material '.repeat(5000)}` }] } }] })
    await app.memory.createThread({ threadId: 'other:task', resourceId: 'other:task' })
    await app.memory.saveMessages({ messages: [{ id: 'other', threadId: 'other:task', resourceId: 'other:task', role: 'user', createdAt: new Date(0),
      content: { format: 2, parts: [{ type: 'text', text: 'OTHER_PROJECT_SECRET' }] } }] })
    await app.session.sendMessage({ content: '找回以前约束' }); await app.drain()
    assert.equal(calls, 3)
    assert.match(JSON.stringify(await app.session.thread.listMessages({ threadId: 'p:task' })), /已恢复用户的历史约束/)
  } finally { await app.close() }
})

test('超大最新输入通过原生 TokenLimiter 明确报错，Controller 不误报完成', { timeout: 30000 }, async () => {
  const app = await harness(() => { throw new Error('超大输入不得发送到 provider') })
  try {
    await app.memory.saveMessages({ messages: [{ id: 'prior', threadId: 'p:task', resourceId: 'p:task', role: 'user', createdAt: new Date(0),
      content: { format: 2, parts: [{ type: 'text', text: 'PRIOR_HISTORY_UNCHANGED' }] } }] })
    await app.session.sendMessage({ content: 'OVERSIZED_LATEST '.repeat(5000) }); await app.drain()
    assert.equal(app.fixture.requests.length, 0)
    assert.ok(app.events.some(event => event.type === 'error' && /超过模型可用上下文/.test(event.error.message)))
    assert.ok(app.events.some(event => event.type === 'agent_end' && event.reason === 'error'))
    assert.match(JSON.stringify(await app.memory.recall({ threadId: 'p:task', resourceId: 'p:task' })), /PRIOR_HISTORY_UNCHANGED/)
  } finally { await app.close() }
})

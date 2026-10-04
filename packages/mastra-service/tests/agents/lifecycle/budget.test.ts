/**
 * [INPUT]: 真实应用原生模型步骤、父子委派与threadState，隔离模型协议夹具
 * [OUTPUT]: 会话累计父子用量/费用、重启读取与未知价格预算拒绝证据
 * [POS]: 验证预算在模型请求前生效，而非只核对纯函数
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Agent } from '@mastra/core/agent'
import { Mastra } from '@mastra/core/mastra'
import { LocalFilesystem } from '@mastra/core/workspace'
import { RequestContext } from '@mastra/core/request-context'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { createFamilyBudget } from '../../../src/agents/budget/index.ts'
import { createSpecialists } from '../../../src/agents/specialists.ts'
import { createModelGateway, modelId } from '../../../src/model.ts'
import { createApplication } from '../../../src/application.ts'
import type { ResearchBudget } from '../../../src/settings/types.ts'
import { fixtureProvider, textReply, toolReply } from '../../provider-fixture.ts'

test('父子真实步骤累计结算并重启保持，预算耗尽及未知费用在下次模型调用前拒绝', { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-family-budget-'))
  let limits: ResearchBudget = {}, calls = 0
  const fixture = fixtureProvider(request => {
    calls++
    if (!request.tools?.some(tool => tool.function.name === 'agent-reader')) return textReply('子证据')
    return request.messages.some(message => message.role === 'tool') ? textReply('父总结') : toolReply('agent-reader', { prompt: '读取证据' }, 'delegate')
  })
  const options = { dataRoot: root, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch },
    researchBudget: () => limits, pricing: () => ({ model: 'test', inputUsdPerMillion: 1, outputUsdPerMillion: 2 }) }
  let application = await createApplication(options)
  try {
    let session = await application.session('p', 'task')
    await session.permissions.setForTool({ toolName: 'agent-reader', policy: 'allow' })
    await session.sendMessage({ content: '委派一次' })
    const usage = await application.familyBudget.read('p:task')
    assert.equal(calls, 3); assert.equal(usage.usage.promptTokens, 36); assert.equal(usage.usage.completionTokens, 12)
    assert.equal(usage.usage.unknownTokens, false); assert.equal(usage.usage.unknownCost, false)
    assert.ok(Math.abs(usage.usage.costUsd! - .00006) < 1e-10)
    await application.close(); application = await createApplication(options)
    assert.deepEqual((await application.familyBudget.read('p:task')).usage, usage.usage)
    limits = { maxPromptTokens: 36 }
    session = await application.session('p', 'task')
    await session.sendMessage({ content: '不能超过预算' }).catch(() => {})
    assert.equal(calls, 3)
    limits = { maxCostUsd: .00006 }
    await session.sendMessage({ content: '不能超过费用' }).catch(() => {})
    assert.equal(calls, 3)
  } finally { await application.close(); await rm(root, { recursive: true, force: true }) }
  const unknownRoot = await mkdtemp(join(tmpdir(), 'lumen-unknown-price-'))
  const unknown = await createApplication({ ...options, dataRoot: unknownRoot, pricing: () => undefined, researchBudget: () => ({ maxCostUsd: 1 }) })
  try {
    const session = await unknown.session('p', 'task')
    await session.sendMessage({ content: '未知价格不能当免费' }).catch(() => {})
    assert.equal(calls, 3)
  } finally { await unknown.close(); await rm(unknownRoot, { recursive: true, force: true }) }
})

test('忙会话按模型注册快照读取价格和上下文窗口，不受全局切换污染', { timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-budget-model-snapshot-'))
  let started!: () => void, release!: () => void
  const reached = new Promise<void>(resolve => { started = resolve })
  const gate = new Promise<void>(resolve => { release = resolve })
  const fixture = fixtureProvider(async () => { started(); await gate; return textReply('旧模型响应') })
  const oldModel = { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'old-model', contextWindow: 111111,
    pricing: { model: 'old-model', inputUsdPerMillion: 1, outputUsdPerMillion: 2 }, fetch: fixture.fetch }
  const newModel = { ...oldModel, model: 'new-model', contextWindow: 222222,
    pricing: { model: 'new-model', inputUsdPerMillion: 10, outputUsdPerMillion: 20 } }
  const application = await createApplication({ dataRoot: root, model: oldModel })
  try {
    const session = await application.session('p', 'task')
    const running = session.sendMessage({ content: '保持旧模型计价' })
    await reached
    await application.configureModel(newModel, '')
    const busy = await application.familyBudget.read('p:task')
    assert.equal(busy.contextWindow, 111111)
    release()
    await running
    const settled = await application.familyBudget.read('p:task')
    assert.equal(settled.contextWindow, 111111)
    assert.equal(settled.usage.costUsd, .00002)
    await application.session('p', 'task')
    assert.equal((await application.familyBudget.read('p:task')).contextWindow, 222222)
  } finally {
    release()
    await application.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('并发专家按同父剩余预算预留，预算只够一个时第二个不会到达模型', { timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-concurrent-budget-'))
  let children = 0, parents = 0
  const fixture = fixtureProvider(async request => {
    if (request.tools?.some(tool => tool.function.name === 'agent-reader')) {
      parents++
      return parents === 1 ? toolReply('agent-reader', { prompt: '第一组证据' }, 'delegate-a') : textReply('已汇总允许执行的专家，另一项预算不足')
    }
    children++
    await new Promise(resolve => setTimeout(resolve, 150))
    return textReply('一组证据')
  })
  const fetch: typeof globalThis.fetch = async (url, init) => {
    const response = await fixture.fetch(url, init)
    const chunks = (await response.text()).split('\n').map(line => {
      if (!line.startsWith('data: {')) return line
      const chunk = JSON.parse(line.slice(6)), calls = chunk.choices[0]?.delta?.tool_calls
      if (calls?.[0]?.id === 'delegate-a') calls.push({ ...calls[0], index: 1, id: 'delegate-b', function: { name: 'agent-reader', arguments: JSON.stringify({ prompt: '第二组证据' }) } })
      return `data: ${JSON.stringify(chunk)}`
    })
    return new Response(chunks.join('\n'), { headers: response.headers })
  }
  const model = { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch }
  const storage = new LibSQLStore({ id: 'budget-concurrent', url: `file:${join(root, 'memory.sqlite')}` })
  const memory = new Memory({ storage, options: { semanticRecall: false, workingMemory: { enabled: false } } })
  const filesystem = new LocalFilesystem({ basePath: join(root, 'task'), contained: true }); await filesystem.init()
  const budget = createFamilyBudget({ storage, limits: () => ({ maxCompletionTokens: 4097 }), pricing: () => undefined, mainRunId: () => 'budget-parent' })
  const specialists = createSpecialists({ model: modelId(model), memory, tools: {}, familyBudget: budget, resolveTaskFilesystem: () => filesystem })
  const parent = new Agent({ id: 'parent', name: 'parent', instructions: '并行委派两份证据', model: modelId(model), memory, agents: specialists.agents,
    inputProcessors: [budget.inputProcessor], outputProcessors: [budget.outputProcessor],
    defaultOptions: { delegation: specialists.delegation, toolCallConcurrency: { limit: 2, strategy: 'called' } } })
  const mastra = new Mastra({ agents: { parent, ...specialists.agents }, storage, gateways: { lumen: createModelGateway(model) } })
  try {
    const requestContext = new RequestContext(); requestContext.set('controller', { resourceId: 'p:task' })
    const output = await parent.stream('并发读取', { requestContext, runId: 'budget-parent', memory: { thread: 'p:task', resource: 'p:task' }, maxSteps: 3 })
    await output.getFullOutput()
    assert.equal(children, 1)
    const usage = await budget.read('p:task')
    assert.equal(usage.reserved.calls, 0); assert.equal(usage.usage.completionTokens, 12)
    assert.match(JSON.stringify(await memory.recall({ threadId: 'p:task', resourceId: 'p:task' })), /预算不足/)
  } finally { await mastra.shutdown(); await specialists.close(); await storage.close(); await filesystem.destroy(); await rm(root, { recursive: true, force: true }) }
})

test('取消先结算未知占位后，迟到的真实步骤用量仍补齐且重复回调不重复计费', { timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-late-budget-'))
  const fixture = fixtureProvider(() => textReply('已完成的真实响应'))
  const application = await createApplication({ dataRoot: root, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch },
    pricing: () => ({ model: 'test', inputUsdPerMillion: 1, outputUsdPerMillion: 2 }) })
  const processor = application.familyBudget.outputProcessor, once = processor.processOutputStep!.bind(processor)
  processor.processOutputStep = async args => {
    await application.familyBudget.finish('p:task')
    assert.equal((await application.familyBudget.read('p:task')).usage.unknownTokens, true)
    await once(args); return once(args)
  }
  try {
    const session = await application.session('p', 'task')
    await session.sendMessage({ content: '触发真实响应但让取消清理先到' })
    const { usage, reserved } = await application.familyBudget.read('p:task')
    assert.equal(usage.promptTokens, 12); assert.equal(usage.completionTokens, 4)
    assert.equal(usage.unknownTokens, false); assert.equal(usage.unknownCost, false)
    assert.equal(usage.costUsd, .00002); assert.equal(reserved.calls, 0)
  } finally { await application.close(); await rm(root, { recursive: true, force: true }) }
})

test('运行中追加要求以新模型回合计费，原生step从零开始不会误判重放', { timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-budget-followup-'))
  let calls = 0, started!: () => void, release!: () => void
  const reached = new Promise<void>(resolve => { started = resolve }), gate = new Promise<void>(resolve => { release = resolve })
  const fixture = fixtureProvider(async () => { calls++; if (calls === 1) { started(); await gate } return textReply(`第${calls}轮响应`) })
  const application = await createApplication({ dataRoot: root, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  const processor = application.familyBudget.inputProcessor, once = processor.processInputStep!.bind(processor)
  const observed: Array<{ step: number; messageId?: string; run: string | null | undefined }> = []
  try {
    const session = await application.session('p', 'task')
    processor.processInputStep = args => { observed.push({ step: args.stepNumber, messageId: args.messageId, run: session.run.getRunId() }); return once(args) }
    const running = session.sendMessage({ content: '先读取现有结果' })
    await reached
    await session.followUp({ content: '追加核对数据来源' })
    release(); await running
    for (let attempt = 0; attempt < 100 && observed.length < 2; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
    for (let attempt = 0; attempt < 100 && session.displayState.get().isRunning; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
    assert.equal(calls, 2)
    assert.equal(observed[0]?.step, 0); assert.equal(observed[1]?.step, 0)
    assert.notEqual(observed[0]?.messageId, observed[1]?.messageId)
    const budget = await application.familyBudget.read('p:task')
    assert.equal(budget.usage.promptTokens, 24); assert.equal(budget.usage.completionTokens, 8)
    assert.equal(budget.reserved.calls, 0)
  } finally { release(); await application.close(); await rm(root, { recursive: true, force: true }) }
})

test('同一原生run的新stream即使step归零也独立准入和结算，重复回调仍去重', { timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-budget-same-run-'))
  let calls = 0
  const fixture = fixtureProvider(() => { calls++; return textReply('正常的新一轮结果') })
  const model = { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch }
  const storage = new LibSQLStore({ id: 'budget-same-run', url: `file:${join(root, 'memory.sqlite')}` })
  const memory = new Memory({ storage, options: { semanticRecall: false, workingMemory: { enabled: false } } })
  const pricingResources: string[] = []
  const budget = createFamilyBudget({ storage, limits: () => ({}),
    pricing: resourceId => { pricingResources.push(resourceId ?? ''); return { model: 'test', inputUsdPerMillion: 1, outputUsdPerMillion: 2 } },
    contextWindow: resourceId => resourceId === 'p:task' ? 3333 : 4444, mainRunId: () => 'shared-run' })
  const observed: Array<{ step: number; messageId?: string }> = []
  let firstInput: Parameters<NonNullable<typeof budget.inputProcessor.processInputStep>>[0] | undefined
  const inputOnce = budget.inputProcessor.processInputStep!.bind(budget.inputProcessor)
  budget.inputProcessor.processInputStep = async args => {
    firstInput ??= args; observed.push({ step: args.stepNumber, messageId: args.messageId })
    const result = await inputOnce(args)
    await assert.rejects(async () => inputOnce(args), /已在执行/)
    return result
  }
  const outputOnce = budget.outputProcessor.processOutputStep!.bind(budget.outputProcessor)
  budget.outputProcessor.processOutputStep = async args => { await outputOnce(args); return outputOnce(args) }
  const parent = new Agent({ id: 'parent', name: 'parent', instructions: '回答当前请求', model: modelId(model), memory, inputProcessors: [budget.inputProcessor], outputProcessors: [budget.outputProcessor] })
  const mastra = new Mastra({ agents: { parent }, storage, gateways: { lumen: createModelGateway(model) } })
  try {
    const requestContext = new RequestContext(); requestContext.set('controller', { resourceId: 'p:task' })
    for (const content of ['首轮请求', '后台结果到达后继续核对']) {
      const output = await parent.stream(content, { requestContext, runId: 'shared-run', memory: { thread: 'p:task', resource: 'p:task' }, maxSteps: 1 })
      await output.getFullOutput()
    }
    await assert.rejects(async () => inputOnce(firstInput!), /已结算/)
    assert.equal(calls, 2)
    assert.deepEqual(observed.map(item => item.step), [0, 0]); assert.notEqual(observed[0]?.messageId, observed[1]?.messageId)
    const result = await budget.read('p:task')
    assert.equal(result.usage.promptTokens, 24); assert.equal(result.usage.completionTokens, 8)
    assert.equal(result.usage.costUsd, .00004); assert.equal(result.reserved.calls, 0)
    assert.equal(result.contextWindow, 3333); assert.ok(pricingResources.length > 0 && pricingResources.every(resourceId => resourceId === 'p:task'))
  } finally { await mastra.shutdown(); await storage.close(); await rm(root, { recursive: true, force: true }) }
})

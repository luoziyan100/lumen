/**
 * [INPUT]: 真正 Controller/Agent、LibSQL trace 与 HTTP 形状的确定性模型边界
 * [OUTPUT]: 录制回放无外部执行、live 无生产能力、失败/取消真实错误回灌、审批恢复证据、隔离/缺证据/标注并发与持久脱敏回归
 * [POS]: 诊断评估行为证据；所有文件和数据库位于临时根，模型网络仅在 SDK 边界替换
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Agent } from '@mastra/core/agent'
import { AgentController } from '@mastra/core/agent-controller'
import { Mastra } from '@mastra/core/mastra'
import { createTool } from '@mastra/core/tools'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { Hono } from 'hono'
import { z } from 'zod'
import { createDiagnostics, DiagnosticsError } from '../src/diagnostics/index.ts'
import { diagnosticsRoutes } from '../src/http/diagnostics.ts'
import { createModelGateway, modelId, type ModelSettings } from '../src/model.ts'
import { fixtureProvider, textReply, toolReply } from './provider-fixture.ts'
import { recordedEvidence } from '../src/diagnostics/evaluation/evidence.ts'
import { recordedAgentParts } from '../src/diagnostics/evaluation/recorded.ts'
import { EvidenceUnavailable } from '../src/diagnostics/evaluation/types.ts'

async function setup(outcome: 'success' | 'failed' | 'cancelled' = 'success') {
  const root = await mkdtemp(join(tmpdir(), 'lumen-evaluation-')), resourceId = 'project:recorded'
  const storage = new LibSQLStore({ id: 'evaluation', url: `file:${join(root, 'memory.sqlite')}` })
  const memory = new Memory({ storage, options: { semanticRecall: false, workingMemory: { enabled: false } } })
  let toolCalls = 0, live: ModelSettings | null = null
  const fixture = fixtureProvider(request => request.messages.some(message => message.role === 'tool') ? textReply('RECORDED_EXPECTED_OUTPUT') : toolReply('capture_probe', { path: 'original.txt' }, 'captured-call'))
  const settings = { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture-private-key-274983', model: 'test', fetch: fixture.fetch }
  const secrets = [settings.apiKey]
  const options = { dataRoot: root, storage, secrets: () => secrets, liveModel: () => live, authorize: async (id: string) => {
    const thread = await memory.getThreadById({ threadId: id })
    if (!thread) throw new DiagnosticsError('Session missing', 404)
    return { resourceId: thread.resourceId, threadId: thread.id }
  } }
  const diagnostics = createDiagnostics(options)
  const agent = new Agent({ id: 'evaluation-source', name: 'Evaluation source', model: modelId(settings), instructions: 'Read the fixture using capture_probe, then reply.', memory,
    tools: { capture_probe: createTool({ id: 'capture_probe', description: 'Real fixture side effect', inputSchema: z.object({ path: z.string() }), execute: async () => {
      toolCalls++; await writeFile(join(root, 'original.txt'), `PRODUCTION_SIDE_EFFECT_${toolCalls}`)
      if (outcome === 'failed') throw new Error('RECORDED_FAILURE')
      if (outcome === 'cancelled') throw new DOMException('RECORDED_CANCELLED', 'AbortError')
      return { content: 'RECORDED_TOOL_RESULT' }
    } }) } })
  const controller = new AgentController({ id: 'evaluation-source', agent, memory, storage, modes: [{ id: 'research', name: 'Research', defaultModelId: modelId(settings), metadata: { default: true } }] })
  const mastra = new Mastra({ agents: { source: agent }, agentControllers: { source: controller }, storage, observability: diagnostics.observability, gateways: { lumen: createModelGateway(settings) } })
  await controller.init()
  const session = await controller.createSession({ resourceId, threadId: resourceId })
  session.subscribe(event => { if (event.type === 'tool_approval_required') session.respondToToolApproval({ toolCallId: event.toolCallId, decision: 'approve' }) })
  await session.sendMessage({ content: 'ORIGINAL_RESEARCH_REQUEST' }); await diagnostics.flush()
  const traceId = (await diagnostics.listTraces(resourceId)).items[0]!.traceId
  const item = await diagnostics.markBadCase(resourceId, { traceId, actual: 'Observed response', expected: 'RECORDED_EXPECTED_OUTPUT' })
  const http = new Hono()
  http.route('/lumen', diagnosticsRoutes(diagnostics, async (projectId, taskId) => options.authorize(`${projectId}:${taskId}`)))
  http.onError((error, c) => c.json({ error: error.message }, error instanceof DiagnosticsError ? error.status : 500))
  return { root, resourceId, storage, memory, diagnostics, fixture, item, http, secrets,
    toolCalls: () => toolCalls, setLive(settings: ModelSettings | null) { live = settings },
    async close() { await controller.deleteSession({ resourceId }); await controller.destroy(); await mastra.shutdown(); await diagnostics.close(); await storage.close(); await rm(root, { recursive: true, force: true }) } }
}

test('真实 Controller 录制经独立 Mastra Agent 回放，模型/真实工具/文件/正式消息均不再执行', { timeout: 90000 }, async () => {
  const env = await setup()
  try {
    const before = await env.memory.recall({ threadId: env.resourceId, resourceId: env.resourceId, perPage: 100 })
    const requests = env.fixture.requests.length, calls = env.toolCalls(), original = await readFile(join(env.root, 'original.txt'), 'utf8')
    const response = await env.http.request(`/lumen/diagnostics/cases/${env.item.id}/evaluate?projectId=project&taskId=recorded`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'recorded' }) })
    assert.equal(response.status, 200)
    const result = await response.json()
    assert.equal(result.execution, 'completed', JSON.stringify(result)); assert.equal(result.executionPerformed, true)
    assert.equal(result.judgment, 'matched'); assert.equal(result.reply, 'RECORDED_EXPECTED_OUTPUT')
    assert.equal(env.fixture.requests.length, requests); assert.equal(env.toolCalls(), calls)
    assert.equal(await readFile(join(env.root, 'original.txt'), 'utf8'), original)
    const after = await env.memory.recall({ threadId: env.resourceId, resourceId: env.resourceId, perPage: 100 })
    assert.deepEqual(after.messages, before.messages)
    assert.equal((await env.diagnostics.getBadCase(env.resourceId, env.item.id)).lastEvaluation?.execution, 'completed')
    const exported = JSON.parse((await env.diagnostics.exportSession(env.resourceId)).content)
    assert.equal(exported.payload.badCases[0].lastEvaluation.execution, 'completed')
    assert.equal(env.diagnostics.readRecorded((await env.diagnostics.exportSession(env.resourceId)).content).executionPerformed, false)
    await env.memory.createThread({ threadId: 'project:other', resourceId: 'project:other' })
    await assert.rejects(env.diagnostics.evaluate('project:other', env.item.id, 'recorded'), { status: 404 })
    const edited = await env.diagnostics.updateBadCase(env.resourceId, env.item.id, { expected: 'DIFFERENT_EXPECTATION' })
    assert.equal(edited.lastEvaluation, undefined)
    assert.equal((await env.diagnostics.evaluate(env.resourceId, env.item.id, 'recorded')).judgment, 'mismatched')
  } finally { await env.close() }
})

test('缺工具证据明确 unavailable；live 使用当前模型无工具、结果重新脱敏且不把完成当通过', { timeout: 90000 }, async () => {
  const env = await setup()
  try {
    const domain = (await env.storage.getStore('observability'))!
    const trace = (await domain.getTrace({ traceId: env.item.traceId! }))!
    const tool = trace.spans.find(span => span.spanType === 'tool_call')!
    await domain.createSpan({ span: { ...tool, output: null } })
    const unavailable = await env.diagnostics.evaluate(env.resourceId, env.item.id, 'recorded')
    assert.equal(unavailable.execution, 'unavailable'); assert.equal(unavailable.executionPerformed, false); assert.equal(unavailable.judgment, 'not_evaluated')
    assert.ok(unavailable.gaps.includes('tool_result_incomplete'))
    const noModel = await env.diagnostics.evaluate(env.resourceId, env.item.id, 'live')
    assert.equal(noModel.execution, 'unavailable'); assert.ok(noModel.gaps.includes('live_model_not_configured'))
    const secret = 'live-response-private-value-483692', provider = fixtureProvider(request => {
      assert.equal(request.tools?.length ?? 0, 0)
      assert.ok(JSON.stringify(request.messages).includes('ORIGINAL_RESEARCH_REQUEST'))
      assert.ok(!JSON.stringify(request.messages).includes('RECORDED_EXPECTED_OUTPUT'))
      return textReply(`A different answer containing ${secret}`)
    })
    env.secrets.push(secret)
    env.setLive({ baseURL: 'https://fixture.invalid/v1', apiKey: 'live-fixture-key', model: 'current-model', fetch: provider.fetch })
    const calls = env.toolCalls(), result = await env.diagnostics.evaluate(env.resourceId, env.item.id, 'live')
    assert.equal(result.execution, 'completed'); assert.notEqual(result.judgment, 'matched'); assert.equal(result.model, 'openai/current-model')
    assert.equal(provider.requests.length, 1); assert.equal(env.toolCalls(), calls)
    assert.ok(!JSON.stringify(result).includes(secret)); assert.ok(!JSON.stringify(await env.diagnostics.getBadCase(env.resourceId, env.item.id)).includes(secret))
    assert.ok(!(await env.diagnostics.exportSession(env.resourceId)).content.includes(secret))
  } finally { await env.close() }
})

test('评估期间编辑拒绝旧结果回填；关闭会取消真实 SDK 请求并排空，不留下运行中的评估', { timeout: 90000 }, async () => {
  const env = await setup()
  try {
    let release!: () => void, entered!: () => void
    const started = new Promise<void>(resolve => { entered = resolve }), gate = new Promise<void>(resolve => { release = resolve })
    const provider = fixtureProvider(async () => { entered(); await gate; return textReply('LATE_ANSWER') })
    env.setLive({ baseURL: 'https://fixture.invalid/v1', apiKey: 'live-key', model: 'current-model', fetch: provider.fetch })
    const pending = env.diagnostics.evaluate(env.resourceId, env.item.id, 'live')
    await started
    await assert.rejects(env.diagnostics.evaluate(env.resourceId, env.item.id, 'live'), { status: 409 })
    await env.diagnostics.updateBadCase(env.resourceId, env.item.id, { expected: 'EDITED_EXPECTED' }); release()
    await assert.rejects(pending, { status: 409 }); assert.equal((await env.diagnostics.getBadCase(env.resourceId, env.item.id)).lastEvaluation, undefined)
    let began!: () => void
    const running = new Promise<void>(resolve => { began = resolve })
    const slow = fixtureProvider(async (_request, signal) => new Promise((_resolve, reject) => {
      began(); signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
    }))
    env.setLive({ baseURL: 'https://fixture.invalid/v1', apiKey: 'live-key', model: 'current-model', fetch: slow.fetch })
    const aborted = env.diagnostics.evaluate(env.resourceId, env.item.id, 'live')
    await running; await env.diagnostics.close()
    const result = await aborted
    assert.equal(result.execution, 'failed'); assert.equal(result.judgment, 'not_evaluated')
    assert.equal(result.detail, 'evaluation_cancelled_or_timed_out')
  } finally { await env.close() }
})

for (const outcome of ['failed', 'cancelled'] as const) {
  test(`录制${outcome}工具经原生错误通道回灌，审批暂停步骤不被跳过，且无生产副作用`, { timeout: 90000 }, async () => {
    const env = await setup(outcome)
    try {
      const trace = await env.diagnostics.readTrace(env.resourceId, env.item.traceId!)
      const evidence = recordedEvidence(trace), recorded = recordedAgentParts(evidence)
      assert.equal(evidence.tools.length, 1)
      assert.equal(evidence.steps.length, 2)
      assert.equal(evidence.tools[0]!.result.kind, 'error')
      if (evidence.tools[0]!.result.kind === 'error') assert.equal(evidence.tools[0]!.result.name, outcome === 'cancelled' ? 'AbortError' : 'Error')
      const requests: unknown[] = [], originalModel = recorded.model
      const model = { ...originalModel,
        async doGenerate(options: Parameters<typeof originalModel.doGenerate>[0]) { requests.push(structuredClone(options.prompt)); return originalModel.doGenerate(options) },
        async doStream(options: Parameters<typeof originalModel.doStream>[0]) { requests.push(structuredClone(options.prompt)); return originalModel.doStream(options) },
      }
      const before = await env.memory.recall({ threadId: env.resourceId, resourceId: env.resourceId, perPage: 100 })
      const calls = env.toolCalls(), network = env.fixture.requests.length, file = await readFile(join(env.root, 'original.txt'), 'utf8')
      const replay = new Agent({ id: `error-replay-${outcome}`, name: 'Recorded error replay', instructions: 'Replay recorded facts only.', model, tools: recorded.tools })
      const response = await replay.generate(evidence.prompt, { maxSteps: 3 })
      recorded.verify()
      assert.equal(response.text, 'RECORDED_EXPECTED_OUTPUT')
      assert.equal(requests.length, 2)
      const messages = requests[1] as Array<{ role: string; content: Array<{ type: string; output?: unknown }> }>
      const toolResult = messages.filter(message => message.role === 'tool').flatMap(message => message.content).find(part => part.type === 'tool-result')
      assert.deepEqual(toolResult?.output, { type: 'error-text', value: outcome === 'cancelled' ? 'RECORDED_CANCELLED' : 'RECORDED_FAILURE' })
      const result = await env.diagnostics.evaluate(env.resourceId, env.item.id, 'recorded')
      assert.equal(result.execution, 'completed', JSON.stringify(result)); assert.equal(result.judgment, 'matched')
      assert.equal(env.toolCalls(), calls); assert.equal(env.fixture.requests.length, network)
      assert.equal(await readFile(join(env.root, 'original.txt'), 'utf8'), file)
      assert.deepEqual((await env.memory.recall({ threadId: env.resourceId, resourceId: env.resourceId, perPage: 100 })).messages, before.messages)
    } finally { await env.close() }
  })
}

test('失败录制仍拒绝缺失、截断、脱敏、调用歧义和审批调用证据缺失', { timeout: 90000 }, async () => {
  const env = await setup('failed')
  try {
    const trace = await env.diagnostics.readTrace(env.resourceId, env.item.traceId!)
    for (const change of [
      (copy: typeof trace) => { copy.spans.find(span => span.type === 'tool_call')!.error = null },
      (copy: typeof trace) => { copy.spans.find(span => span.type === 'tool_call')!.error = { name: 'Error', message: '[REDACTED]' } },
      (copy: typeof trace) => { copy.spans.find(span => span.type === 'tool_call')!.truncated = true },
      (copy: typeof trace) => { copy.spans.push({ ...copy.spans.find(span => span.type === 'tool_call')!, spanId: 'ambiguous-copy' }) },
      (copy: typeof trace) => { copy.spans.find(span => span.type === 'tool_call')!.input = { path: 'different.txt' } },
      (copy: typeof trace) => { copy.spans = copy.spans.filter(span => !(span.type === 'model_step' && span.output != null)) },
      (copy: typeof trace) => { copy.spans = copy.spans.filter(span => span.name !== "chunk: 'tool-call'") },
    ]) {
      const copy = structuredClone(trace); change(copy)
      assert.throws(() => recordedEvidence(copy), EvidenceUnavailable)
    }
  } finally { await env.close() }
})

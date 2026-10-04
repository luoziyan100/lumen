/**
 * [INPUT]: 真实 AgentController/LibSQL/Observability，仅模型 HTTP 使用确定性 provider
 * [OUTPUT]: 原生 trace 会话归属、采集关闭、凭证脱敏、用户标注与只读导出证据
 * [POS]: 诊断生产路径回归；不读取正式数据，不把 trace 称为原始 HTTP 或完整副作用证据
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Agent } from '@mastra/core/agent'
import { AgentController } from '@mastra/core/agent-controller'
import { Mastra } from '@mastra/core/mastra'
import { createTool } from '@mastra/core/tools'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { z } from 'zod'
import { createDiagnostics, DiagnosticsError } from '../src/diagnostics/index.ts'
import { createApplication } from '../src/application.ts'
import { redactPayload } from '../src/diagnostics/redact.ts'
import { createModelGateway, modelId } from '../src/model.ts'
import { fixtureProvider, textReply, toolReply } from './provider-fixture.ts'

const secret = 'diagnostics-private-fixture-key-973518'
const another = 'opaque-fixture-bearer-492187'
const imageData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='

test('诊断脱敏覆盖嵌套键、JSON、URL、Bearer、base64 和二进制，不改原值或 token 用量', () => {
  const source = { nested: { OPENAI_API_KEY: secret }, url: `https://user:${secret}@example.invalid/a?random=${another}#fragment=${secret}`,
    line: `Authorization: Bearer ${another}`, embedded: JSON.stringify({ deepest: { 'x-api-key': secret } }),
    rawImage: `data:image/png;base64,${imageData}`, base64: imageData, encoded: Buffer.from(secret).toString('base64'), plain: imageData, urlSafe: Buffer.from(imageData, 'base64').toString('base64url'),
    opaque: secret, bare: Buffer.from(`Authorization: Bearer ${another}`).toString('base64'), binary: new Uint8Array([1, 2]), promptTokens: 42, completionTokens: 7 }
  const cleaned = redactPayload(source, [secret]), text = JSON.stringify(cleaned.value)
  for (const forbidden of [secret, another, imageData, Buffer.from(imageData, 'base64').toString('base64url'), Buffer.from(secret).toString('base64')]) assert.ok(!text.includes(forbidden), forbidden)
  assert.equal((cleaned.value as Record<string, unknown>).promptTokens, 42)
  assert.equal((cleaned.value as Record<string, unknown>).completionTokens, 7)
  assert.equal(source.nested.OPENAI_API_KEY, secret)
  assert.equal(redactPayload('evidence_missing').value, 'evidence_missing')
  assert.ok(cleaned.redacted)
  const cycle: Record<string, unknown> = {}; cycle.self = cycle
  assert.ok(redactPayload(cycle).truncated)
  assert.ok(redactPayload('x'.repeat(40000)).truncated)
})

test('真实 Mastra trace 关联受信会话、导出无凭证、标注不串会话、采集关闭后不新增 trace', { timeout: 120000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-diagnostics-'))
  const storage = new LibSQLStore({ id: 'diagnostics', url: `file:${join(root, 'memory.sqlite')}` })
  const memory = new Memory({ storage, options: { semanticRecall: false, workingMemory: { enabled: false } } })
  let enabled = true, toolReachedModel = false
  const activeSecrets = [secret], lateSecret = 'later configured credential / 716384'
  const fixture = fixtureProvider(request => {
    if (!request.messages.some(message => message.role === 'tool')) return toolReply('probe', {}, 'probe-1')
    toolReachedModel = JSON.stringify(request.messages).includes(secret)
    return textReply('DIAGNOSTIC_EVIDENCE_COMPLETE')
  })
  const settings = { baseURL: 'https://fixture.invalid/v1', apiKey: secret, model: 'test', fetch: fixture.fetch }
  const options = { dataRoot: root, storage, enabled: () => enabled, secrets: () => activeSecrets, authorize: async (resourceId: string) => {
    const thread = await memory.getThreadById({ threadId: resourceId })
    if (!thread) throw new DiagnosticsError('Session missing', 404)
    return { resourceId: thread.resourceId, threadId: thread.id }
  } }
  const diagnostics = createDiagnostics(options)
  const agent = new Agent({ id: 'diagnostics', name: 'Diagnostics', model: modelId(settings), instructions: 'Use probe, then answer', memory, defaultOptions: { maxSteps: 5 },
    tools: { probe: createTool({ id: 'probe', description: 'Return synthetic evidence', inputSchema: z.object({}), execute: async () => ({
      evidence: 'REAL_TOOL_EVIDENCE', nested: { authorization: `Bearer ${another}`, api_key: secret }, url: `https://example.invalid/?key=${secret}`, image: `data:image/png;base64,${imageData}`,
    }) }) } })
  const controller = new AgentController({ id: 'diagnostics', agent, memory, storage, modes: [{ id: 'research', name: 'Research', defaultModelId: modelId(settings), metadata: { default: true } }] })
  const mastra = new Mastra({ agents: { diagnostics: agent }, agentControllers: { diagnostics: controller }, storage, observability: diagnostics.observability, gateways: { lumen: createModelGateway(settings) } })
  const sessions: Awaited<ReturnType<typeof controller.createSession>>[] = []
  async function run(resourceId: string) {
    const session = await controller.createSession({ resourceId, threadId: resourceId }); sessions.push(session)
    session.subscribe(event => { if (event.type === 'tool_approval_required') session.respondToToolApproval({ toolCallId: event.toolCallId, decision: 'approve' }) })
    await session.sendMessage({ content: 'Run probe with synthetic material only.' })
    await diagnostics.flush()
    return diagnostics.listTraces(resourceId)
  }
  try {
    await controller.init()
    const a = await run('project:a'), b = await run('project:b')
    t.diagnostic(`native traces: A=${a.total}, B=${b.total}`)
    assert.ok(a.total > 0 && b.total > 0, '真实循环没有落下可按 resourceId 查询的 trace')
    assert.ok(toolReachedModel, '脱敏不应改写真实工具回灌给模型的结果')
    const trace = await diagnostics.readTrace('project:a', a.items[0]!.traceId)
    assert.ok(trace.spans.some(span => span.type.includes('tool')))
    assert.ok(JSON.stringify(trace).includes('REAL_TOOL_EVIDENCE'))
    for (const forbidden of [secret, another, imageData]) assert.ok(!JSON.stringify(trace).includes(forbidden), forbidden)
    await assert.rejects(diagnostics.readTrace('project:b', trace.traceId), { status: 404 })
    await assert.rejects(diagnostics.markBadCase('project:b', { traceId: trace.traceId, actual: 'foreign', expected: 'deny' }), { status: 404 })
    const item = await diagnostics.markBadCase('project:a', { traceId: trace.traceId, spanId: trace.spans[0]!.spanId, kind: 'tool_failure', actual: `Bearer ${another}`, expected: '清楚说明结果', note: `api_key=${secret}` })
    const changed = await diagnostics.updateBadCase('project:a', item.id, { note: '补充观察' })
    assert.equal(changed.kind, 'tool_failure'); assert.equal(changed.expected, '清楚说明结果'); assert.equal(changed.note, '补充观察')
    const later = await diagnostics.markBadCase('project:a', { actual: lateSecret, expected: '按当前凭证脱敏', kind: 'evidence_missing' })
    activeSecrets.push(lateSecret)
    assert.equal((await diagnostics.getBadCase('project:a', later.id)).actual, '[REDACTED]')
    assert.ok(!JSON.stringify(await diagnostics.listBadCases('project:a')).includes(lateSecret))
    await assert.rejects(diagnostics.updateBadCase('project:b', item.id, { note: 'foreign' }), { status: 404 })
    const exported = await diagnostics.exportSession('project:a')
    for (const forbidden of [secret, another, imageData, lateSecret]) assert.ok(!exported.content.includes(forbidden), forbidden)
    const pack = JSON.parse(exported.content)
    assert.equal(pack.payload.coverage.completeAudit, false)
    assert.ok(pack.payload.coverage.untracked.includes('raw_provider_http_request_response'))
    assert.ok(pack.payload.badCases.every((item: { resourceId: string }) => item.resourceId === 'project:a'))
    const inspected = diagnostics.readRecorded(exported.content)
    assert.equal(inspected.executionPerformed, false); assert.equal(inspected.checksumVerified, true); assert.equal(inspected.sourceAuthenticated, false)
    pack.payload.resourceId = 'tampered:resource'
    assert.throws(() => diagnostics.readRecorded(JSON.stringify(pack)), /完整性/)
    enabled = false
    const c = await run('project:c')
    assert.equal(c.total, 0); assert.equal(c.collectionEnabled, false)
    const offPack = JSON.parse((await diagnostics.exportSession('project:c')).content)
    assert.ok(offPack.payload.coverage.gaps.includes('collection_currently_disabled'))
    assert.ok(offPack.payload.coverage.gaps.includes('no_collected_trace'))
    diagnostics.close()
    const reopened = createDiagnostics(options)
    try { assert.equal((await reopened.getBadCase('project:a', item.id)).note, '补充观察') } finally { reopened.close() }
  } finally {
    for (const session of sessions) await controller.deleteSession({ resourceId: session.identity.getResourceId() })
    await controller.destroy(); await mastra.shutdown(); diagnostics.close(); await storage.close(); await rm(root, { recursive: true, force: true })
  }
})

test('真实专家委派后父 trace 可读；独立子资源及伪造跨项目子树省略并显式报告', { timeout: 90000 }, async t => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-diagnostic-delegation-'))
  let childCalls = 0
  const fixture = fixtureProvider(request => {
    if (request.tools?.some(tool => tool.function.name === 'agent-reader')) {
      return request.messages.some(message => message.role === 'tool') ? textReply('PARENT_DELEGATION_FINISHED') : toolReply('agent-reader', { prompt: 'READ_CHILD_SCOPE' }, 'reader-1')
    }
    childCalls++; return textReply('CHILD_WORK_REAL')
  })
  const application = await createApplication({ dataRoot, model: { baseURL: 'https://fixture.invalid/v1', apiKey: secret, model: 'test', fetch: fixture.fetch } })
  try {
    const session = await application.session('project', 'delegation')
    session.subscribe(event => { if (event.type === 'tool_approval_required') session.respondToToolApproval({ toolCallId: event.toolCallId, decision: 'approve' }) })
    await session.sendMessage({ content: '请委派读者并总结。' }); await application.diagnostics.flush()
    assert.ok(childCalls > 0, '必须真实执行专家模型')
    const list = await application.diagnostics.listTraces('project:delegation')
    assert.ok(list.total > 0)
    const traceId = list.items[0]!.traceId
    const before = await application.diagnostics.readTrace('project:delegation', traceId)
    assert.match(JSON.stringify(before), /PARENT_DELEGATION_FINISHED/)
    const storage = (await application.storage.getStore('observability'))!
    const raw = (await storage.getTrace({ traceId }))!, parent = raw.spans.find(span => !span.parentSpanId)!
    t.diagnostic(`delegated native spans=${raw.spans.length}; omitted independent spans=${before.omittedUnattributedSpans}`)
    const foreign = { ...parent, spanId: 'foreign-sibling', parentSpanId: parent.spanId, resourceId: 'other:private', input: 'FOREIGN_TRACE_CONTENT', output: null }
    await storage.createSpan({ span: foreign })
    await storage.createSpan({ span: { ...foreign, spanId: 'foreign-descendant', parentSpanId: foreign.spanId, resourceId: 'project:delegation', input: 'FALSE_PARENT_REBIND' } })
    const safe = await application.diagnostics.readTrace('project:delegation', traceId)
    assert.equal(safe.omittedUnattributedSpans, before.omittedUnattributedSpans + 2)
    assert.doesNotMatch(JSON.stringify(safe), /FOREIGN_TRACE_CONTENT|FALSE_PARENT_REBIND/)
    await assert.rejects(application.diagnostics.markBadCase('project:delegation', { traceId, spanId: foreign.spanId, actual: 'outside', expected: 'deny' }), { status: 404 })
    const exported = JSON.parse((await application.diagnostics.exportSession('project:delegation')).content)
    assert.ok(exported.payload.coverage.gaps.includes('unattributed_child_spans_omitted'))
    assert.doesNotMatch(JSON.stringify(exported), /FOREIGN_TRACE_CONTENT|FALSE_PARENT_REBIND/)
  } finally { await application.close(); await rm(dataRoot, { recursive: true, force: true }) }
})

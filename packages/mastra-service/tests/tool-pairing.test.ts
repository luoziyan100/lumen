/**
 * [INPUT]: Mastra 原生并行后台委派、Memory/LibSQL 与 provider 网络夹具
 * [OUTPUT]: 持久历史与实际模型请求中 toolCallId 唯一且配对的机制证据
 * [POS]: 2026-09-19 正式库出现同一后台委派被两条 assistant 消息重复保存；裸 Agent 不复现，原生 AgentController 1.67.0 即复现，1.82.0 已修复（适配台账 F1），不另建配对层
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Agent } from '@mastra/core/agent'
import { AgentController } from '@mastra/core/agent-controller'
import { Mastra } from '@mastra/core/mastra'
import { LocalFilesystem, Workspace } from '@mastra/core/workspace'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { createApplication } from '../src/application.ts'
import { createModelGateway, modelId } from '../src/model.ts'
import { fixtureProvider, textReply, toolsReply, type ProviderRequest } from './provider-fixture.ts'

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** 发往模型的请求里：assistant tool_calls 的 id 全局唯一，且每个都紧跟对应的 tool 结果。 */
function pairingViolations(request: ProviderRequest) {
  const problems: string[] = []
  const seen = new Set<string>()
  request.messages.forEach((message, index) => {
    for (const call of message.tool_calls ?? []) {
      if (seen.has(call.id)) problems.push(`重复 tool_call ${call.id}`)
      seen.add(call.id)
      const answered = request.messages.slice(index + 1).some(next => next.role === 'tool' && next.tool_call_id === call.id)
      if (!answered) problems.push(`悬空 tool_call ${call.id}`)
    }
  })
  return problems
}

test('并行后台委派后，持久历史与下一轮请求的 toolCallId 唯一且配对', { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-pairing-'))
  let delegated = false
  const fixture = fixtureProvider(async request => {
    const system = request.messages.filter(m => m.role === 'system').map(m => String(m.content)).join('\n')
    if (system.includes('CHILD_READER')) { await pause(300); return textReply('reader 结论') }
    if (system.includes('CHILD_VERIFIER')) { await pause(600); return textReply('verifier 结论') }
    if (!delegated) {
      delegated = true
      const name = (part: string) => request.tools!.find(t => t.function.name.includes(part))!.function.name
      return toolsReply([
        { id: 'call-reader', name: name('reader'), arguments: { prompt: 'Read', _background: { disposition: 'deferred' } } },
        { id: 'call-verifier', name: name('verifier'), arguments: { prompt: 'Verify', _background: { disposition: 'deferred' } } },
      ])
    }
    return textReply('已委派，等待专家')
  })
  const settings = { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'research-test', fetch: fixture.fetch }
  const storage = new LibSQLStore({ id: 'pairing-test', url: `file:${join(root, 'mastra.sqlite')}` })
  const memory = new Memory({ storage, options: { semanticRecall: false, workingMemory: { enabled: false } } })
  const reader = new Agent({ id: 'reader', name: 'Reader', description: 'Read papers', instructions: 'CHILD_READER', model: modelId(settings), memory })
  const verifier = new Agent({ id: 'verifier', name: 'Verifier', description: 'Verify claims', instructions: 'CHILD_VERIFIER', model: modelId(settings), memory })
  const parent = new Agent({ id: 'parent', name: 'Parent', instructions: 'Delegate', model: modelId(settings), memory,
    agents: { reader, verifier }, backgroundTasks: { tools: { reader: { enabled: true }, verifier: { enabled: true } } },
  })
  const mastra = new Mastra({ agents: { parent, reader, verifier }, storage, gateways: { lumen: createModelGateway(settings) },
    backgroundTasks: { enabled: true, recoverStaleTasksOnStart: false, defaultRetries: { maxRetries: 0 }, backpressure: 'reject' },
  })
  const thread = { thread: 'parent-thread', resource: 'parent' }
  try {
    const first = await parent.stream('Research the paper', { memory: thread, maxSteps: 5 })
    await first.consumeStream()
    const manager = mastra.backgroundTaskManager!
    for (let i = 0; i < 100; i++) {
      const { tasks } = await manager.listTasks({ threadId: 'parent-thread' })
      if (tasks.length === 2 && tasks.every(task => task.status === 'completed')) break
      await pause(100)
    }
    const { tasks } = await manager.listTasks({ threadId: 'parent-thread' })
    assert.deepEqual(tasks.map(task => task.status).sort(), ['completed', 'completed'])
    await pause(300)

    const { messages } = await memory.recall({ threadId: 'parent-thread', resourceId: 'parent' })
    const stored = messages.filter(m => m.role === 'assistant').flatMap(m => m.content.parts
      .filter(part => part.type === 'tool-invocation').map(part => ({ message: m.id, id: part.toolInvocation.toolCallId })))
    const owners = new Map<string, Set<string>>()
    for (const { message, id } of stored) owners.set(id, (owners.get(id) ?? new Set()).add(message))
    assert.deepEqual([...owners.keys()].sort(), ['call-reader', 'call-verifier'])
    const duplicated = [...owners].filter(([, ids]) => ids.size > 1).map(([id]) => id)

    const before = fixture.requests.length
    const second = await parent.stream('继续', { memory: thread, maxSteps: 3 })
    await second.consumeStream()
    const parentRequests = fixture.requests.slice(before).filter(r => !r.messages.some(m => m.role === 'system' && /CHILD_/.test(String(m.content))))
    assert.ok(parentRequests.length > 0)
    const sentIds = parentRequests[0]!.messages.flatMap(m => m.tool_calls ?? []).map(call => call.id).sort()
    assert.deepEqual(sentIds, ['call-reader', 'call-verifier'])
    const violations = parentRequests.flatMap(pairingViolations)

    assert.deepEqual({ duplicated, violations }, { duplicated: [], violations: [] })
  } finally { await mastra.shutdown(); await storage.close(); await rm(root, { recursive: true, force: true }) }
})

// 1.67.0 复现重复 id 进入下一轮请求，根因在原生 AgentController（见下一用例），1.82.0 已修复（1.85.0 复验仍通过）；子专家 workspace 元数据写入父线程单列 todo（适配台账 F2）。
test('完整应用：并行后台委派 reader/verifier 读取工作区后，父历史与下一轮请求配对唯一', { timeout: 40000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-pairing-app-'))
  let delegated = false
  const finished = new Set<string>()
  const fixture = fixtureProvider(async request => {
    const names = request.tools?.map(tool => tool.function.name) ?? []
    const results = request.messages.filter(message => message.role === 'tool')
    if (names.includes('agent-reader')) {
      if (!delegated) {
        delegated = true
        return toolsReply([
          { id: 'call-reader', name: 'agent-reader', arguments: { prompt: '精读 input.md', _background: { disposition: 'deferred' } } },
          { id: 'call-verifier', name: 'agent-verifier', arguments: { prompt: '核对 input.md', _background: { disposition: 'deferred' } } },
        ])
      }
      return textReply('已委派，等待专家')
    }
    const system = request.messages.filter(m => m.role === 'system').map(m => String(m.content)).join('\n')
    const role = system.includes('默认保持怀疑') ? 'verifier' : 'reader'
    const read = names.find(name => name.endsWith('read_file') && !/task|material|skill/.test(name))
    assert.ok(read, JSON.stringify(names))
    if (!results.length) { await pause(role === 'reader' ? 200 : 500); return toolsReply([{ id: `${role}-read`, name: read, arguments: { path: 'input.md' } }]) }
    finished.add(role)
    return textReply(`${role} 结论`)
  })
  const application = await createApplication({ dataRoot: root,
    model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch },
  })
  try {
    const session = await application.session('p', 'task')
    await mkdir(join(root, 'topics/p/work'), { recursive: true })
    await writeFile(join(root, 'topics/p/work/input.md'), 'PAPER_TEXT')
    await session.sendMessage({ content: '委派两位专家' })
    for (let i = 0; i < 150 && finished.size < 2; i++) await pause(100)
    assert.equal(finished.size, 2)
    for (let i = 0; i < 50 && session.displayState.get().isRunning; i++) await pause(100)
    await pause(800)

    const { messages } = await application.memory.recall({ threadId: 'p:task', resourceId: 'p:task' })
    const owners = new Map<string, Set<string>>()
    for (const message of messages.filter(m => m.role === 'assistant')) for (const part of message.content.parts) {
      if (part.type === 'tool-invocation') owners.set(part.toolInvocation.toolCallId, (owners.get(part.toolInvocation.toolCallId) ?? new Set()).add(message.id))
    }
    assert.ok(owners.has('call-reader') && owners.has('call-verifier'), JSON.stringify([...owners.keys()]))
    const duplicated = [...owners].filter(([, ids]) => ids.size > 1).map(([id]) => id)
    const foreign = messages.filter(m => m.content.parts.some(part => part.type === 'data-workspace-metadata'
      && String((part as { data?: { id?: string } }).data?.id ?? '').startsWith('specialist-'))).length

    const before = fixture.requests.length
    await session.sendMessage({ content: '继续' })
    const parentRequests = fixture.requests.slice(before).filter(r => r.tools?.some(t => t.function.name === 'agent-reader'))
    assert.ok(parentRequests.length > 0)
    const violations = parentRequests.flatMap(pairingViolations)

    assert.deepEqual({ duplicated, violations }, { duplicated: [], violations: [] })
    await t.test('子专家 workspace 元数据不进入父线程', { todo: '适配台账 F2：1.85.0 仍复现' }, () => { assert.equal(foreign, 0) })
  } finally { await application.close(); await rm(root, { recursive: true, force: true }) }
})

// 二分结论（2026-11-10）：processor 全关、裸 Agent + Lumen 专家均不复现；纯原生 Controller + 普通 Agent 在 1.67.0 复现，1.82.0 通过，保留为升级回归。
test('原生 AgentController：并行后台委派后同一调用不应被第二条 assistant 消息重复保存', { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-pairing-controller-'))
  let delegated = false
  const finished = new Set<string>()
  const fixture = fixtureProvider(async request => {
    const names = request.tools?.map(t => t.function.name) ?? []
    const reader = names.find(n => n.includes('reader')), verifier = names.find(n => n.includes('verifier'))
    if (reader && verifier) {
      if (delegated) return textReply('已委派')
      delegated = true
      return toolsReply([
        { id: 'call-reader', name: reader, arguments: { prompt: 'Read', _background: { disposition: 'deferred' } } },
        { id: 'call-verifier', name: verifier, arguments: { prompt: 'Verify', _background: { disposition: 'deferred' } } },
      ])
    }
    const role = request.messages.some(m => m.role === 'system' && String(m.content).includes('CHILD_VERIFIER')) ? 'verifier' : 'reader'
    await pause(role === 'reader' ? 200 : 500)
    finished.add(role)
    return textReply(`${role} 结论`)
  })
  const settings = { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'research-test', fetch: fixture.fetch }
  const storage = new LibSQLStore({ id: 'pairing-controller', url: `file:${join(root, 'mastra.sqlite')}` })
  const memory = new Memory({ storage, options: { semanticRecall: false, workingMemory: { enabled: false } } })
  const gateway = createModelGateway(settings)
  const reader = new Agent({ id: 'reader', name: 'Reader', description: 'Read papers', instructions: 'CHILD_READER', model: modelId(settings), memory })
  const verifier = new Agent({ id: 'verifier', name: 'Verifier', description: 'Verify claims', instructions: 'CHILD_VERIFIER', model: modelId(settings), memory })
  const agent = new Agent({ id: 'research', name: 'Parent', instructions: 'Delegate', model: modelId(settings), memory,
    agents: { reader, verifier }, backgroundTasks: { tools: { reader: { enabled: true }, verifier: { enabled: true } } },
  })
  const workspace = new Workspace({ id: 'pairing-ws', filesystem: new LocalFilesystem({ basePath: join(root, 'task'), contained: true }) })
  const controller = new AgentController({ id: 'lumen', agent, storage, memory, workspace: () => workspace, gateways: [gateway],
    modes: [{ id: 'research', name: '研究', defaultModelId: modelId(settings), metadata: { default: true } }], disableBuiltinTools: ['subagent', 'submit_plan'],
  })
  const mastra = new Mastra({ agents: { research: agent, reader, verifier }, agentControllers: { lumen: controller }, storage, gateways: { lumen: gateway },
    backgroundTasks: { enabled: true, recoverStaleTasksOnStart: false, defaultRetries: { maxRetries: 0 }, backpressure: 'reject' },
  })
  await controller.init()
  try {
    const session = await controller.createSession({ resourceId: 'p:task', threadId: 'p:task', workspace })
    session.subscribe(event => {
      if (event.type === 'tool_approval_required') session.respondToToolApproval({ toolCallId: event.toolCallId, decision: 'approve' })
    })
    await session.sendMessage({ content: '委派两位专家' })
    for (let i = 0; i < 100 && finished.size < 2; i++) await pause(100)
    assert.equal(finished.size, 2)
    await pause(800)
    const { messages } = await memory.recall({ threadId: 'p:task', resourceId: 'p:task' })
    const owners = new Map<string, Set<string>>()
    for (const message of messages.filter(m => m.role === 'assistant')) for (const part of message.content.parts) {
      if (part.type === 'tool-invocation') owners.set(part.toolInvocation.toolCallId, (owners.get(part.toolInvocation.toolCallId) ?? new Set()).add(message.id))
    }
    assert.deepEqual([...owners.keys()].sort(), ['call-reader', 'call-verifier'])
    assert.deepEqual([...owners].filter(([, ids]) => ids.size > 1).map(([id]) => id), [])
  } finally { await controller.destroy(); await mastra.shutdown(); await storage.close(); await rm(root, { recursive: true, force: true }) }
})

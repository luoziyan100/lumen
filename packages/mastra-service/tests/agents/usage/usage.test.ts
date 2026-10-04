/**
 * [INPUT]: 完整服务、真实 Mastra 委派/LibSQL、确定性 provider 线格式
 * [OUTPUT]: 父子统计分离、重复步骤去重、后台并发、重开与 Stop 迟到落盘的行为证据
 * [POS]: 用量迁移回归；不替换 Agent 循环，旧导入缺失值不估算
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createHttpService } from '../../../src/server.ts'
import { fixtureProvider, textReply, toolReply, type ProviderRequest, type Reply } from '../../provider-fixture.ts'

const token = 'usage-test-private-token-long-enough'
const main = (request: ProviderRequest) => request.tools?.some(tool => tool.function.name === 'agent-reader')
const gate = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done }); return { promise, resolve } }

async function until(check: () => boolean | Promise<boolean>, explanation: string) {
  const deadline = Date.now() + 12000
  while (!await check()) { if (Date.now() > deadline) throw new Error(explanation); await delay(10) }
}

async function environment(respond: (request: ProviderRequest, signal?: AbortSignal | null) => Reply | Promise<Reply>) {
  const root = await mkdtemp(join(tmpdir(), 'lumen-child-usage-'))
  const fixture = fixtureProvider(respond)
  const options = { dataRoot: root, token, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } }
  let service = await createHttpService(options)
  await service.catalog.createProject('用量核对', 'p')
  await service.catalog.createSession('p', 'task')
  const session = await service.application.session('p', 'task')
  await session.permissions.setForTool({ toolName: 'agent-reader', policy: 'allow' })
  return { get service() { return service }, session, fixture,
    async json(path: string) {
      const response = await service.app.request(`/lumen/${path}?projectId=p&taskId=task`, { headers: { Authorization: `Bearer ${token}` } })
      assert.equal(response.status, 200); return response.json()
    },
    async reopen() { await service.close(); service = await createHttpService(options) },
    async close() { await service.close(); await rm(root, { recursive: true, force: true }) },
  }
}

test('前台专家逐步入账，重复通知不重复累计，主/子快照分离并跨重启保留', { timeout: 40000 }, async () => {
  const env = await environment(request => {
    const results = request.messages.filter(message => message.role === 'tool')
    if (main(request)) return results.length ? textReply('主 Agent 已核对') : toolReply('agent-reader', { prompt: '列出材料再回报' }, 'delegate')
    return results.length ? textReply('子 Agent 已读取') : toolReply('list_files', { path: '.' }, 'list')
  })
  const processor = env.service.application.childUsage.outputProcessor
  const once = processor.processOutputStep!.bind(processor)
  processor.processOutputStep = async args => { await once(args); return once(args) }
  try {
    assert.equal(await env.service.application.childUsage.read('p:task'), null)
    await env.session.sendMessage({ content: '委派读取' })
    await env.service.application.specialistProjects.drain('p:task')
    const before = await env.json('snapshot')
    assert.deepEqual(before.displayState.childTokenUsage, { promptTokens: 24, completionTokens: 8, totalTokens: 32, reasoningTokens: 0, cachedInputTokens: 0 })
    assert.equal(before.displayState.tokenUsage.totalTokens, 32)
    assert.deepEqual((await env.json('children')).childTokenUsage, before.displayState.childTokenUsage)
    assert.equal(await env.service.application.childUsage.read('p:unknown-import'), null)
    await env.reopen()
    const after = await env.json('snapshot')
    assert.deepEqual(after.displayState.childTokenUsage, before.displayState.childTokenUsage)
    assert.equal(after.displayState.tokenUsage.totalTokens, 32)
  } finally { await env.close() }
})

test('两个同时运行的后台专家累加到同一父线程且没有跨线程污染', { timeout: 40000 }, async () => {
  const release = gate(); let started = 0, delegated = 0
  const env = await environment(async request => {
    if (!main(request)) { started++; await release.promise; return textReply('后台证据') }
    if (delegated < 2) return toolReply('agent-reader', { prompt: `证据 ${++delegated}`, _background: { disposition: 'deferred' } }, `delegate-${delegated}`)
    return textReply('等待或整合证据')
  })
  const sending = env.session.sendMessage({ content: '并行委派两份阅读' })
  try {
    await until(() => started === 2, '两个专家没有并行进入模型')
    assert.equal(await env.service.application.childUsage.read('p:task'), null)
    release.resolve(); await sending
    await until(async () => (await env.service.application.mastra.backgroundTaskManager!.listTasks({ resourceId: 'p:task' })).tasks.every(task => task.status === 'completed'), '后台专家没有完成')
    await env.service.application.specialistProjects.drain('p:task')
    assert.deepEqual(await env.service.application.childUsage.read('p:task'), { promptTokens: 24, completionTokens: 8, totalTokens: 32, reasoningTokens: 0, cachedInputTokens: 0 })
    assert.equal(await env.service.application.childUsage.read('other:task'), null)
    assert.equal((await env.json('children')).childTokenUsage.totalTokens, 32)
  } finally { release.resolve(); await sending.catch(() => {}); await env.close() }
})

test('Stop 等待此前模型响应的迟到用量落盘，取消之后仍可读取且不会清账', { timeout: 40000 }, async () => {
  const writing = gate(), release = gate()
  const env = await environment(request => main(request)
    ? toolReply('agent-reader', { prompt: '读取材料' }, 'delegate-stop') : textReply('已消耗模型用量'))
  const store = (await env.service.application.storage.getStore('threadState'))!
  const original = store.setState.bind(store)
  store.setState = async args => {
    if (args.type === 'lumen.child-token-usage.v1') { writing.resolve(); await release.promise }
    return original(args)
  }
  const sending = env.session.sendMessage({ content: '开始后停止' })
  let stopping: Promise<void> | undefined
  try {
    await writing.promise
    let stopped = false
    stopping = env.service.application.stop('p', 'task').then(() => { stopped = true })
    await delay(30); assert.equal(stopped, false)
    release.resolve(); await stopping; await sending
    assert.deepEqual(await env.service.application.childUsage.read('p:task'), { promptTokens: 12, completionTokens: 4, totalTokens: 16, reasoningTokens: 0, cachedInputTokens: 0 })
    assert.equal((await env.json('children')).childTokenUsage.totalTokens, 16)
    await env.reopen()
    assert.equal((await env.json('snapshot')).displayState.childTokenUsage.totalTokens, 16)
  } finally { release.resolve(); await stopping; await sending.catch(() => {}); await env.close() }
})

test('专家空答复纠正的两次真实模型消耗均保留，不被同一步重试覆盖', { timeout: 40000 }, async () => {
  let childCalls = 0
  const env = await environment(request => {
    if (!main(request)) return textReply(++childCalls === 1 ? '' : '纠正后证据')
    return request.messages.some(message => message.role === 'tool') ? textReply('已汇总') : toolReply('agent-reader', { prompt: '核对证据' }, 'empty-retry')
  })
  try {
    await env.session.sendMessage({ content: '委派并纠正空答复' })
    await env.service.application.specialistProjects.drain('p:task')
    assert.equal(childCalls, 2)
    assert.equal((await env.service.application.childUsage.read('p:task'))?.totalTokens, 32)
  } finally { await env.close() }
})

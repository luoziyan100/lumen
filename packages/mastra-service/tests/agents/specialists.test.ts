/**
 * [INPUT]: 原生 agents 委派、LibSQL/Workspace、角色工厂与模型 HTTP 夹具
 * [OUTPUT]: 同角色隔离产物、父历史隔离、显式证据引用与终止原因回灌的现场证据
 * [POS]: 验证公开委派钩子与真实文件系统，不维护测试调度器
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Agent } from '@mastra/core/agent'
import { Mastra } from '@mastra/core/mastra'
import { RequestContext } from '@mastra/core/request-context'
import { LocalFilesystem } from '@mastra/core/workspace'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { createSpecialists } from '../../src/agents/specialists.ts'
import { createModelGateway, modelId } from '../../src/model.ts'
import { fixtureProvider, textReply, toolReply } from '../provider-fixture.ts'

test('同父同时委派同一检索角色的上下文与目录独立，材料只读且产物回到父模型', { timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-specialist-'))
  const filesystem = new LocalFilesystem({ basePath: join(root, 'task'), contained: true })
  await filesystem.init(); await filesystem.writeFile('original.md', 'ORIGINAL_SOURCE')
  const fixture = fixtureProvider(request => {
    const results = request.messages.filter(message => message.role === 'tool')
    if (request.tools?.some(tool => tool.function.name === 'agent-searcher')) {
      if (!results.length) return toolReply('agent-searcher', { prompt: 'WRITE_0' }, 'delegate-0')
      assert.match(JSON.stringify(results), /本次独立工作目录/)
      return textReply('两个独立产物均已审阅')
    }
    const names = request.tools?.map(tool => tool.function.name) ?? []
    assert.ok(names.includes('write_file')); assert.ok(names.includes('read_task_file'))
    for (const forbidden of ['run_code', 'ask_user', 'task_write', 'write_memory', 'install_skill', 'agent-reader']) assert.ok(!names.includes(forbidden), forbidden)
    if (!results.length) return toolReply('read_task_file', { path: 'original.md' }, 'read')
    if (results.length === 1) {
      assert.match(JSON.stringify(results), /ORIGINAL_SOURCE/)
      return toolReply('write_file', { path: '../../original.md', content: 'BAD_CHANGE' }, 'escape')
    }
    if (results.length === 2) {
      assert.doesNotMatch(JSON.stringify(results.at(-1)), /Successfully wrote/)
      const text = JSON.stringify(request.messages).includes('WRITE_0') ? 'RESULT_0' : 'RESULT_1'
      return toolReply('write_file', { path: 'notes.md', content: text }, 'write')
    }
    return textReply('笔记已写入 notes.md')
  })
  // -------- provider 一轮返回两个真实工具调用，不替换框架委派实现 --------
  const parallelFetch: typeof fetch = async (url, init) => {
    const response = await fixture.fetch(url, init)
    const chunks = (await response.text()).split('\n').map(line => {
      if (!line.startsWith('data: {')) return line
      const chunk = JSON.parse(line.slice(6)), calls = chunk.choices[0]?.delta?.tool_calls
      if (calls?.[0]?.id === 'delegate-0') calls.push({ ...calls[0], index: 1, id: 'delegate-1', function: { name: 'agent-searcher', arguments: JSON.stringify({ prompt: 'WRITE_1' }) } })
      return `data: ${JSON.stringify(chunk)}`
    })
    return new Response(chunks.join('\n'), { headers: response.headers })
  }
  const settings = { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: parallelFetch }
  const storage = new LibSQLStore({ id: 'specialist-test', url: `file:${join(root, 'memory.sqlite')}` })
  const memory = new Memory({ storage, options: { semanticRecall: false, workingMemory: { enabled: false } } })
  const specialists = createSpecialists({ model: modelId(settings), memory, tools: {}, resolveTaskFilesystem: resource => {
    assert.equal(resource, 'p:task'); return filesystem
  }, modelSettings: () => ({ vision: 'off' }) })
  const contexts: RequestContext[] = []
  let bothStarted!: () => void
  const both = new Promise<void>(resolve => { bothStarted = resolve })
  const delegation = { ...specialists.delegation, onDelegationStart: async (context: Parameters<NonNullable<typeof specialists.delegation.onDelegationStart>>[0]) => {
    const result = await specialists.delegation.onDelegationStart!(context)
    contexts.push(context.requestContext)
    if (contexts.length === 2) bothStarted()
    await both
    return result
  } }
  const parent = new Agent({ id: 'parent', name: 'Parent', instructions: '委派检索并审阅产物', model: modelId(settings), memory,
    agents: specialists.agents, defaultOptions: { delegation, toolCallConcurrency: { limit: 2, strategy: 'called' } }, backgroundTasks: specialists.backgroundTasks,
  })
  const mastra = new Mastra({ agents: { parent, ...specialists.agents }, storage, gateways: { lumen: createModelGateway(settings) },
    backgroundTasks: { enabled: true, backpressure: 'reject', globalConcurrency: 4, perAgentConcurrency: 2, recoverStaleTasksOnStart: false, defaultRetries: { maxRetries: 0 } },
  })
  try {
    const requestContext = new RequestContext(); requestContext.set('controller', { resourceId: 'p:task' })
    const stream = await parent.stream('找两组证据', { memory: { thread: 'parent', resource: 'p:task' }, requestContext, maxSteps: 5 })
    assert.match((await stream.getFullOutput()).text, /两个独立产物/)
    assert.notEqual(contexts[0], contexts[1])
    assert.notDeepEqual(contexts[0]!.get('lumen.specialist'), contexts[1]!.get('lumen.specialist'))
    assert.equal(requestContext.get('lumen.specialist'), undefined)
    assert.equal(await filesystem.readFile('original.md', { encoding: 'utf8' }), 'ORIGINAL_SOURCE')
    const directories = await readdir(join(filesystem.basePath, 'workers'))
    assert.equal(directories.length, 2)
    const notes = await Promise.all(directories.map(directory => readFile(join(filesystem.basePath, 'workers', directory, 'notes.md'), 'utf8')))
    assert.deepEqual(notes.sort(), ['RESULT_0', 'RESULT_1'])
    await assert.rejects(specialists.agents.reader.stream('未绑定的直接执行', { memory: { thread: 'wrong', resource: 'p:task' } }))
  } finally { await mastra.shutdown(); await specialists.close(); await storage.close(); await filesystem.destroy(); await rm(root, { recursive: true, force: true }) }
})

test('专家保留最后一步总结，达到工具步数上限仍将真实证据返回父模型', { timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-conclusion-'))
  const filesystem = new LocalFilesystem({ basePath: join(root, 'task'), contained: true })
  await filesystem.init(); await filesystem.writeFile('evidence.txt', 'VERIFIED_EVIDENCE')
  let childCalls = 0, summarySeen = false, referenceSeen = false
  const fixture = fixtureProvider(request => {
    if (request.tools?.some(tool => tool.function.name === 'agent-reader')) {
      const results = request.messages.filter(message => message.role === 'tool')
      if (!results.length) return toolReply('agent-reader', { prompt: '读取证据', maxSteps: 3 }, 'delegate')
      if (results.length === 1) return toolReply('agent-verifier', { prompt: 'VERIFY_EXPLICIT_REFERENCE', contextFromRefs: ['reader-1'], maxSteps: 3 }, 'verify')
      summarySeen = JSON.stringify(request.messages).includes('已核对 VERIFIED_EVIDENCE')
      return textReply('已接收专家总结')
    }
    assert.doesNotMatch(JSON.stringify(request.messages), /PARENT_ONLY_HISTORY/)
    if (JSON.stringify(request.messages).includes('VERIFY_EXPLICIT_REFERENCE')) {
      referenceSeen = JSON.stringify(request.messages).includes('已核对 VERIFIED_EVIDENCE')
      return textReply('显式证据已收到')
    }
    childCalls++
    if (childCalls < 3) return toolReply('read_file', { path: 'evidence.txt' }, `read-${childCalls}`)
    assert.ok(!request.tools?.length || (request as unknown as { tool_choice: string }).tool_choice === 'none')
    assert.match(JSON.stringify(request.messages), /VERIFIED_EVIDENCE/)
    return textReply('已核对 VERIFIED_EVIDENCE')
  })
  const settings = { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch }
  const storage = new LibSQLStore({ id: 'conclusion-test', url: `file:${join(root, 'memory.sqlite')}` })
  const memory = new Memory({ storage, options: { semanticRecall: false, workingMemory: { enabled: false } } })
  const specialists = createSpecialists({ model: modelId(settings), memory, tools: {}, resolveTaskFilesystem: () => filesystem })
  const parent = new Agent({ id: 'parent', name: 'Parent', instructions: '委派一次后读结果', model: modelId(settings), memory,
    agents: specialists.agents, defaultOptions: { delegation: specialists.delegation } })
  const mastra = new Mastra({ agents: { parent, ...specialists.agents }, storage, gateways: { lumen: createModelGateway(settings) } })
  try {
    const requestContext = new RequestContext(); requestContext.set('controller', { resourceId: 'p:task' })
    const stream = await parent.stream('PARENT_ONLY_HISTORY：读取证据后委派审阅', { memory: { thread: 'p:task', resource: 'p:task' }, requestContext, maxSteps: 4 })
    assert.match((await stream.getFullOutput()).text, /已接收/)
    assert.equal(childCalls, 3); assert.equal(summarySeen, true); assert.equal(referenceSeen, true)
  } finally { await mastra.shutdown(); await specialists.close(); await storage.close(); await filesystem.destroy(); await rm(root, { recursive: true, force: true }) }
})


test('专家过滤和输出截断回报原生原因，不把空结果或片段视为完成，也不自动重试', { timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-specialist-finish-'))
  const filesystem = new LocalFilesystem({ basePath: join(root, 'task'), contained: true })
  await filesystem.init()
  let reason = 'content_filter', childCalls = 0
  const fixture = fixtureProvider(request => {
    if (request.tools?.some(tool => tool.function.name === 'agent-reader')) {
      const results = request.messages.filter(message => message.role === 'tool')
      return results.length ? textReply(JSON.stringify(results)) : toolReply('agent-reader', { prompt: '核对材料', maxSteps: 3 }, 'delegate')
    }
    childCalls++
    return textReply(reason === 'length' ? 'INCOMPLETE_FRAGMENT' : '')
  })
  const fetch: typeof globalThis.fetch = async (url, init) => {
    const request = JSON.parse(String(init?.body))
    const response = await fixture.fetch(url, init)
    if (request.tools?.some((tool: { function: { name: string } }) => tool.function.name === 'agent-reader')) return response
    return new Response((await response.text()).replaceAll('"finish_reason":"stop"', `"finish_reason":"${reason}"`), { headers: response.headers })
  }
  const settings = { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch }
  const storage = new LibSQLStore({ id: 'finish-test', url: `file:${join(root, 'memory.sqlite')}` })
  const memory = new Memory({ storage, options: { semanticRecall: false, workingMemory: { enabled: false } } })
  const specialists = createSpecialists({ model: modelId(settings), memory, tools: {}, resolveTaskFilesystem: () => filesystem })
  const parent = new Agent({ id: 'parent', name: 'Parent', instructions: '委派一次后读结果', model: modelId(settings), memory,
    agents: specialists.agents, defaultOptions: { delegation: specialists.delegation } })
  const mastra = new Mastra({ agents: { parent, ...specialists.agents }, storage, gateways: { lumen: createModelGateway(settings) } })
  try {
    for (reason of ['content_filter', 'length']) {
      const requestContext = new RequestContext(); requestContext.set('controller', { resourceId: 'p:task' })
      const output = await parent.stream('核对材料', { requestContext, memory: { thread: reason, resource: 'p:task' }, maxSteps: 3 })
      const text = (await output.getFullOutput()).text
      assert.match(text, /专家未完成/)
      assert.match(text, new RegExp(reason.replace('_', '-')))
      if (reason === 'length') assert.match(text, /未完成片段：INCOMPLETE_FRAGMENT/)
    }
    assert.equal(childCalls, 2)
  } finally { await mastra.shutdown(); await specialists.close(); await storage.close(); await filesystem.destroy(); await rm(root, { recursive: true, force: true }) }
})

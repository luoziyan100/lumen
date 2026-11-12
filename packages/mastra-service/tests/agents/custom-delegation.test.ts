/**
 * [INPUT]: 用户层 Markdown 角色、原生 agents 与 Mastra 委派钩子
 * [OUTPUT]: 同一组专家被两个主题并发委派：公开工具名一致、内部 ID 带定义指纹、文件按主题隔离，显式白名单不被工作区工具扩大
 * [POS]: 自定义角色接线的真实模型协议证据，不模拟框架调度
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Agent, type DelegationStartContext } from '@mastra/core/agent'
import { Mastra } from '@mastra/core/mastra'
import { RequestContext } from '@mastra/core/request-context'
import { LocalFilesystem } from '@mastra/core/workspace'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { loadAgentCatalog } from '../../src/agents/catalog/registry.ts'
import { createSpecialists } from '../../src/agents/specialists.ts'
import { createModelGateway, modelId } from '../../src/model.ts'
import { fixtureProvider, textReply, toolReply } from '../provider-fixture.ts'

test('同一组自定义角色被两个主题并发委派，文件按主题隔离、内部 ID 带定义指纹', { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-custom-delegation-'))
  const fixture = fixtureProvider(request => {
    const results = request.messages.filter(message => message.role === 'tool')
    if (request.tools?.some(tool => tool.function.name === 'agent-scout')) {
      if (!results.length) return toolReply('agent-scout', { prompt: '读取 source.txt' }, 'delegate')
      return textReply(JSON.stringify(results))
    }
    assert.deepEqual(request.tools?.map(tool => tool.function.name), ['read_file'])
    assert.match(JSON.stringify(request.messages), /ROLE_USER/)
    if (!results.length) return toolReply('read_file', { path: 'source.txt' }, 'read')
    const topic = JSON.stringify(results).includes('SOURCE_alpha') ? 'alpha' : 'beta'
    assert.doesNotMatch(JSON.stringify(results), topic === 'alpha' ? /SOURCE_beta/ : /SOURCE_alpha/)
    return textReply(`RESULT_${topic}`)
  })
  const settings = { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch }
  const storage = new LibSQLStore({ id: 'custom-test', url: `file:${join(root, 'memory.sqlite')}` })
  const memory = new Memory({ storage, options: { semanticRecall: false, workingMemory: { enabled: false } } })
  const files = new Map<string, LocalFilesystem>()
  await mkdir(join(root, 'user'))
  await writeFile(join(root, 'user', 'scout.md'), '---\nname: scout\nkind_preset: explore\ntools: read_file\n---\nROLE_USER')
  const catalog = await loadAgentCatalog({ roots: { userAgentsDir: join(root, 'user') }, togglesPath: join(root, 'toggles.json') })
  for (const topic of ['alpha', 'beta']) {
    const filesystem = new LocalFilesystem({ basePath: join(root, 'topics', topic, 'work'), contained: true })
    await filesystem.init(); await filesystem.writeFile('source.txt', `SOURCE_${topic}`); files.set(`${topic}:task`, filesystem)
  }
  const group = createSpecialists({ model: modelId(settings), memory, tools: {}, versioned: true, roles: catalog.roles,
    resolveTaskFilesystem: resource => files.get(resource)!, modelSettings: () => ({ vision: 'off' }) })
  const contexts: DelegationStartContext[] = []
  const parent = new Agent({ id: 'parent', name: 'Parent', model: modelId(settings), memory, instructions: '委派 scout 读取材料',
    agents: () => group.agents,
    defaultOptions: { delegation: { hookErrorStrategy: 'throw', enableResultReferences: true,
      onDelegationStart: async context => { contexts.push(context); return group.delegation.onDelegationStart!(context) },
      onDelegationComplete: context => group.delegation.onDelegationComplete!(context),
    } },
  })
  const mastra = new Mastra({ agents: { parent, ...group.registeredAgents }, storage,
    gateways: { lumen: createModelGateway(settings) },
  })
  try {
    const results = await Promise.all(['alpha', 'beta'].map(async topic => {
      const requestContext = new RequestContext(); requestContext.set('controller', { resourceId: `${topic}:task` })
      const output = await parent.stream('读取本主题资料', { requestContext, memory: { thread: `${topic}:task`, resource: `${topic}:task` }, maxSteps: 3 })
      return (await output.getFullOutput()).text
    }))
    assert.match(results[0]!, /RESULT_alpha/); assert.doesNotMatch(results[0]!, /RESULT_beta/)
    assert.match(results[1]!, /RESULT_beta/); assert.doesNotMatch(results[1]!, /RESULT_alpha/)
    assert.match(group.agents.scout!.id, /^scout--[a-f0-9]{20}$/)
    assert.equal(contexts.filter(context => context.primitiveId === group.agents.scout!.id).length, 2)
    assert.deepEqual(new Set(contexts.map(context => context.resourceId)), new Set(['alpha:task', 'beta:task']))
  } finally {
    await mastra.shutdown(); await group.close(); await storage.close()
    await Promise.all([...files.values()].map(filesystem => filesystem.destroy())); await rm(root, { recursive: true, force: true })
  }
})

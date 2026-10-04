/**
 * [INPUT]: 两项目同名 Markdown 角色、原生动态 agents 与 Mastra 委派钩子
 * [OUTPUT]: 公开工具名一致，内部身份/指令/文件隔离，显式白名单不被工作区工具扩大
 * [POS]: 自定义角色项目接线的真实模型协议证据，不模拟框架调度
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

test('同名自定义角色通过原生动态 agents 按项目委派，权限与内部 ID 不串用', { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-custom-delegation-'))
  const fixture = fixtureProvider(request => {
    const results = request.messages.filter(message => message.role === 'tool')
    if (request.tools?.some(tool => tool.function.name === 'agent-scout')) {
      if (!results.length) return toolReply('agent-scout', { prompt: '读取 source.txt' }, 'delegate')
      return textReply(JSON.stringify(results))
    }
    assert.deepEqual(request.tools?.map(tool => tool.function.name), ['read_file'])
    const project = JSON.stringify(request.messages).includes('ROLE_ALPHA') ? 'alpha' : 'beta'
    if (!results.length) return toolReply('read_file', { path: 'source.txt' }, 'read')
    assert.match(JSON.stringify(results), new RegExp(`SOURCE_${project}`))
    return textReply(`RESULT_${project}`)
  })
  const settings = { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch }
  const storage = new LibSQLStore({ id: 'custom-test', url: `file:${join(root, 'memory.sqlite')}` })
  const memory = new Memory({ storage, options: { semanticRecall: false, workingMemory: { enabled: false } } })
  const files = new Map<string, LocalFilesystem>(), groups: Record<string, ReturnType<typeof createSpecialists>> = {}
  for (const project of ['alpha', 'beta']) {
    const directory = join(root, project)
    await mkdir(directory)
    await writeFile(join(directory, 'scout.md'), `---\nname: scout\nkind_preset: explore\ntools: read_file\n---\nROLE_${project.toUpperCase()}`)
    const catalog = await loadAgentCatalog({ roots: { userAgentsDir: join(root, 'user'), workspaceAgentsDir: directory }, togglesPath: join(root, 'toggles.json') })
    const filesystem = new LocalFilesystem({ basePath: join(directory, 'task'), contained: true })
    await filesystem.init(); await filesystem.writeFile('source.txt', `SOURCE_${project}`); files.set(`${project}:task`, filesystem)
    groups[project] = createSpecialists({ model: modelId(settings), memory, tools: {}, projectId: project, roles: catalog.roles,
      resolveTaskFilesystem: resource => files.get(resource)!, modelSettings: () => ({ vision: 'off' }) })
  }
  const contexts: DelegationStartContext[] = []
  const groupFor = (id: string) => Object.values(groups).find(group => group.accepts(id))!
  const parent = new Agent({ id: 'parent', name: 'Parent', model: modelId(settings), memory, instructions: '委派 scout 读取材料',
    agents: ({ requestContext }) => {
      const owner = requestContext.get('controller') as { resourceId: string }
      return groups[owner.resourceId.split(':')[0]!]!.agents
    },
    defaultOptions: { delegation: { hookErrorStrategy: 'throw', enableResultReferences: true,
      onDelegationStart: async context => { contexts.push(context); return groupFor(context.primitiveId).delegation.onDelegationStart!(context) },
      onDelegationComplete: context => groupFor(context.primitiveId).delegation.onDelegationComplete!(context),
    } },
  })
  const mastra = new Mastra({ agents: { parent, ...groups.alpha!.registeredAgents, ...groups.beta!.registeredAgents }, storage,
    gateways: { lumen: createModelGateway(settings) },
  })
  try {
    const results = await Promise.all(['alpha', 'beta'].map(async project => {
      const requestContext = new RequestContext(); requestContext.set('controller', { resourceId: `${project}:task` })
      const output = await parent.stream('读取本项目资料', { requestContext, memory: { thread: `${project}:task`, resource: `${project}:task` }, maxSteps: 3 })
      return (await output.getFullOutput()).text
    }))
    assert.match(results[0]!, /RESULT_alpha/); assert.doesNotMatch(results[0]!, /RESULT_beta/)
    assert.match(results[1]!, /RESULT_beta/); assert.doesNotMatch(results[1]!, /RESULT_alpha/)
    assert.notEqual(groups.alpha!.agents.scout!.id, groups.beta!.agents.scout!.id)
    assert.ok(contexts.some(context => context.primitiveId === groups.alpha!.agents.scout!.id))
    const original = contexts.find(context => context.primitiveId === groups.alpha!.agents.scout!.id)!
    const wrong = new RequestContext(); wrong.set('controller', { resourceId: 'beta:task' })
    await assert.rejects(Promise.resolve().then(() => groups.alpha!.delegation.onDelegationStart!({ ...original, resourceId: 'beta:task', requestContext: wrong })), /project does not match/)
  } finally {
    await mastra.shutdown(); await Promise.all(Object.values(groups).map(group => group.close())); await storage.close()
    await Promise.all([...files.values()].map(filesystem => filesystem.destroy())); await rm(root, { recursive: true, force: true })
  }
})

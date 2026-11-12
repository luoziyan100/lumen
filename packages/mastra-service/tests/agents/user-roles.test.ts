/**
 * [INPUT]: 完整服务组合、用户角色目录 Markdown 配置、原生 Controller 与 provider 协议夹具
 * [OUTPUT]: 用户角色注册、HTTP 重载/启停、父历史过滤与实际委派后果的集成证据
 * [POS]: 防止角色解析已通过而应用仍使用静态六角色的接线回归
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHttpService } from '../../src/server.ts'
import { fixtureProvider, textReply, toolReply } from '../provider-fixture.ts'
import { ensureTopic } from '../topic-fixture.ts'

test('应用注册用户角色，空闲重载与全局停用实际改变后续模型能力', { timeout: 60000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-user-roles-'))
  const fixture = fixtureProvider(request => {
    const tools = request.tools?.map(tool => tool.function.name) ?? []
    if (!tools.includes('agent-reader')) {
      assert.doesNotMatch(JSON.stringify(request.messages), /PARENT_ONLY_HISTORY/)
      assert.match(JSON.stringify(request.messages), /按用户角色回报/)
      return textReply(JSON.stringify(request.messages).includes('ROLE_TWO') ? 'RESULT_TWO' : 'RESULT_ONE')
    }
    if (!tools.includes('agent-scout')) return textReply('SCOUT_DISABLED')
    const results = request.messages.filter(message => message.role === 'tool')
    return results.length ? textReply(JSON.stringify(results)) : toolReply('agent-scout', { prompt: '按用户角色回报' }, 'delegate')
  })
  const token = 'user-role-private-token-for-local-test'
  const service = await createHttpService({ dataRoot: root, token,
    model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch },
  })
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const request = (path: string, method = 'GET', body?: unknown) => service.app.request(`/lumen${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) })
  const role = join(root, 'subagents', 'scout.md')
  const definition = (instruction: string) => `---\nname: scout\nkind_preset: explore\ntools: read_file\n---\n${instruction}`
  async function run(task: string) {
    await service.catalog.createSession('p', task)
    const session = await service.application.session('p', task)
    await session.permissions.setForTool({ toolName: 'agent-scout', policy: 'allow' })
    await session.sendMessage({ content: '委派 scout。PARENT_ONLY_HISTORY：父任务还需写最终报告，子任务只按自己的委派执行。' })
    return JSON.stringify(await service.application.memory.recall({ threadId: `p:${task}`, resourceId: `p:${task}` }))
  }
  try {
    ensureTopic(service, 'p')
    await mkdir(join(root, 'subagents'), { recursive: true })
    await writeFile(role, definition('ROLE_ONE'))
    const listing = await (await request('/agents')).json()
    assert.ok(listing.roles.some((role: { id: string }) => role.id === 'scout'))
    assert.match(await run('first'), /RESULT_ONE/)
    const oldId = (await service.application.specialists.get()).agents.scout!.id
    await writeFile(role, definition('ROLE_TWO'))
    assert.equal((await request('/agents/reload', 'POST', {})).status, 200)
    assert.notEqual((await service.application.specialists.get()).agents.scout!.id, oldId)
    assert.match(await run('second'), /RESULT_TWO/)
    assert.equal((await request('/agents/scout', 'PATCH', { disabled: true })).status, 200)
    assert.match(await run('third'), /SCOUT_DISABLED/)
    assert.equal((await request('/agents/scout', 'PATCH', { disabled: false })).status, 200)
    assert.match(await run('fourth'), /RESULT_TWO/)
  } finally { await service.close(); await rm(root, { recursive: true, force: true }) }
})

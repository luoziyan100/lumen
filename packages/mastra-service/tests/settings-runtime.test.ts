/**
 * [INPUT]: 产品设置 HTTP、真实 Controller 与本机模型 HTTP 夹具
 * [OUTPUT]: 空配置启动、延迟模型切换、运行中配置保护和清除密钥后的禁止执行
 * [POS]: 验证设置落盘与实际模型请求一致，不以配置 DTO 成功代替生效
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serve } from '@hono/node-server'
import { createHttpService } from '../src/server.ts'
import { fixtureProvider, textReply, toolReply } from './provider-fixture.ts'

test('设置从空配置启动并延迟切换实际模型，挂起任务保持旧模型，清空凭证后禁止执行', { timeout: 25000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-settings-runtime-'))
  const requests: string[] = []
  let ask = false
  const fixture = fixtureProvider(request => ask ? toolReply('ask_user', { question: '需要哪个章节？' }) : textReply(`模型 ${request.model}`))
  const provider = serve({ hostname: '127.0.0.1', port: 0, fetch: async request => {
    requests.push(new URL(request.url).pathname)
    return fixture.fetch(request.url, { method: request.method, body: await request.text(), signal: request.signal })
  } })
  if (!provider.listening) await new Promise<void>(resolve => provider.once('listening', resolve))
  const address = provider.address(); assert.ok(address && typeof address !== 'string')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const token = 'settings-runtime-token-at-least-24-characters'
  let service = await createHttpService({ dataRoot: root, token })
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const request = (path: string, method = 'GET', body?: unknown) => service.app.request(path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) })
  const update = (body: unknown) => request('/lumen/settings', 'PATCH', body)
  try {
    assert.equal((await request('/lumen/sessions', 'POST', { projectId: 'default', taskId: 'settings' })).status, 200)
    assert.equal((await request('/api/agent-controller/lumen/sessions/default%3Asettings/messages', 'POST', { message: 'hello' })).status, 409)
    const initial = await update({ upsertProfile: { id: 'model', name: '模型', provider: 'openai', baseUrl: `${baseUrl}/a/v1`, apiKey: 'test-key', models: ['same', 'next'], activeModel: 'same' }, userInstructions: '引用要注明章节' })
    assert.equal(initial.status, 200)
    assert.doesNotMatch(await initial.text(), /test-key/)
    let session = await service.application.session('default', 'settings')
    await session.sendMessage({ content: '读材料' })
    assert.equal(requests.at(-1), '/a/v1/chat/completions')
    assert.match(JSON.stringify(fixture.requests.at(-1)), /引用要注明章节/)
    assert.equal((await update({ upsertProfile: { id: 'model', baseUrl: `${baseUrl}/b/v1` } })).status, 200)
    await session.sendMessage({ content: '继续' })
    assert.equal(requests.at(-1), '/b/v1/chat/completions')
    ask = true
    await session.sendMessage({ content: '请先问我' })
    assert.equal((await (await request('/lumen/settings')).json() as { busy: boolean }).busy, true)
    assert.equal((await update({ activeProfileId: 'model', upsertProfile: { id: 'model', activeModel: 'next' } })).status, 200)
    assert.equal((await (await request('/lumen/settings')).json() as { profiles: Array<{ activeModel: string }> }).profiles[0]?.activeModel, 'next')
    assert.equal(fixture.requests.at(-1)?.model, 'same', '挂起任务仍保持开始时的模型')
    assert.equal((await update({ upsertProfile: { id: 'model', baseUrl: `${baseUrl}/c/v1` } })).status, 409)
    assert.equal(service.settings.effective()?.baseUrl, `${baseUrl}/b/v1`)
    await service.close()
    service = await createHttpService({ dataRoot: root, token })
    assert.equal((await update({ upsertProfile: { id: 'model', baseUrl: `${baseUrl}/c/v1` } })).status, 409, '重启后未打开的挂起研究仍阻止完整配置修改')
    assert.equal((await request('/lumen/stop', 'POST', { projectId: 'default', taskId: 'settings' })).status, 200)
    assert.equal((await (await request('/lumen/settings')).json() as { busy: boolean }).busy, false)
    ask = false
    session = await service.application.session('default', 'settings')
    await session.sendMessage({ content: '下一轮使用新模型' })
    assert.equal(fixture.requests.at(-1)?.model, 'next', '停止后下一轮才应用新模型')
    assert.equal((await update({ upsertProfile: { id: 'model', clearApiKey: true } })).status, 200)
    assert.equal(service.application.hasModel(), false)
    const count = fixture.requests.length
    assert.equal((await request('/api/agent-controller/lumen/sessions/default%3Asettings/messages', 'POST', { message: '不能执行' })).status, 409)
    await service.close()
    service = await createHttpService({ dataRoot: root, token })
    session = await service.application.session('default', 'settings')
    assert.equal(session.displayState.get().pendingSuspensions.size, 0)
    assert.equal(service.application.hasModel(), false)
    assert.equal(fixture.requests.length, count)
  } finally {
    await service.close()
    if ('closeAllConnections' in provider) provider.closeAllConnections()
    await new Promise<void>((resolve, reject) => provider.close(error => error ? reject(error) : resolve()))
    await rm(root, { recursive: true, force: true })
  }
})

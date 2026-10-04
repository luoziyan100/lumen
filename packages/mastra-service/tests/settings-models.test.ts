/**
 * [INPUT]: 真实 Mastra 模型路由/缓存、配置版本注册表、SDK HTTP 网络 fixture
 * [OUTPUT]: 端点切换与流前上游错误安全重试的真实 Mastra 行为证据
 * [POS]: 验证模型配置隔离与 SSE 重试边界；正文或工具增量后禁止重放
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { Agent } from '@mastra/core/agent'
import { Mastra } from '@mastra/core/mastra'
import { createConfiguredModels } from '../src/settings/models.ts'
import { fixtureProvider, textReply } from './provider-fixture.ts'

function sse(...frames: unknown[]): Response {
  return new Response(frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join('') + 'data: [DONE]\n\n',
    { headers: { 'Content-Type': 'text/event-stream' } })
}

const roleOnly = { id: 'early-error', created: 1, model: 'retry-test', object: 'chat.completion.chunk',
  choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] }
const upstreamError = { error: { message: 'upstream failed', type: 'upstream_error' } }

test('相同有效配置复用模型注册版本，只有配置变化才新增 provider', async () => {
  const models = createConfiguredModels()
  const input = { model: 'vendor/shared-model', apiKey: 'same-secret', baseURL: 'https://first.invalid/v1' }
  const first = models.select(input)
  assert.equal(models.select({ ...input }), first)
  assert.equal(models.select({ ...input, fetch: globalThis.fetch }), first)
  assert.equal(Object.keys(await models.gateway.fetchProviders()).length, 1)
  const second = models.select({ ...input, baseURL: 'https://second.invalid/v1' })
  assert.notEqual(second, first)
  assert.equal(Object.keys(await models.gateway.fetchProviders()).length, 2)
})

test('真实 Mastra 同名模型与同 key 切换 endpoint 后使用新配置，旧版本保持独立', { timeout: 15000 }, async () => {
  const calls: string[] = []
  const a = fixtureProvider(() => textReply('endpoint A'))
  const b = fixtureProvider(() => textReply('endpoint B'))
  const fetch: typeof globalThis.fetch = async (url, init) => {
    calls.push(String(url))
    const origin = new URL(String(url)).origin
    assert.ok(['https://first.invalid', 'https://second.invalid'].includes(origin))
    return (origin === 'https://first.invalid' ? a : b).fetch(url, init)
  }
  const models = createConfiguredModels()
  const input = { model: 'vendor/shared-model', apiKey: 'same-secret', baseURL: 'https://first.invalid/v1', fetch }
  const first = models.select(input)
  input.baseURL = 'https://mutated.invalid/v1'
  let selected = first
  const agent = new Agent({ id: 'settings-model-test', name: 'Settings model', instructions: 'Return the provider evidence', model: () => selected })
  const mastra = new Mastra({ agents: { research: agent }, gateways: { lumen: models.gateway } })
  try {
    assert.equal((await agent.generate('Which endpoint?')).text, 'endpoint A')
    selected = models.select({ ...input, baseURL: 'https://second.invalid/v1' })
    assert.notEqual(selected, first)
    assert.equal((await agent.generate('Which endpoint now?')).text, 'endpoint B')
    selected = first
    assert.equal((await agent.generate('Use the original configuration')).text, 'endpoint A')
    assert.deepEqual(calls, ['https://first.invalid/v1/chat/completions', 'https://second.invalid/v1/chat/completions', 'https://first.invalid/v1/chat/completions'])
    assert.ok(!JSON.stringify(await models.gateway.fetchProviders()).includes('same-secret'))
    assert.ok(!first.includes('same-secret'))
  } finally { await mastra.shutdown() }
})

test('真实 Mastra 在 role-only 后遇到流内上游错误，仅重试两次并交付成功流', { timeout: 15000 }, async () => {
  const success = fixtureProvider(() => textReply('恢复后的答复'))
  let calls = 0
  const fetch: typeof globalThis.fetch = (input, init) => ++calls <= 2
    ? Promise.resolve(sse(roleOnly, upstreamError)) : success.fetch(input, init)
  const models = createConfiguredModels()
  const selected = models.select({ baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'retry-test', fetch })
  const agent = new Agent({ id: 'retry-model-test', name: 'Retry model', instructions: 'Answer once', model: () => selected })
  const mastra = new Mastra({ agents: { research: agent }, gateways: { lumen: models.gateway } })
  try {
    const output = await (await agent.stream('请回答')).getFullOutput()
    assert.equal(output.text, '恢复后的答复')
    assert.equal(calls, 3)
    assert.equal(success.requests.length, 1)
  } finally { await mastra.shutdown() }
})

test('真实 Mastra 已收到正文或工具增量后不重发流内错误请求', { timeout: 15000 }, async () => {
  for (const delta of [{ content: 'partial' }, { tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'probe', arguments: '{}' } }] }]) {
    let calls = 0
    const fetch: typeof globalThis.fetch = async () => {
      calls++
      return sse({ ...roleOnly, choices: [{ index: 0, delta: { role: 'assistant', ...delta }, finish_reason: null }] }, upstreamError)
    }
    const models = createConfiguredModels()
    const selected = models.select({ baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'retry-test', fetch })
    const agent = new Agent({ id: `started-${calls}-${'content' in delta ? 'text' : 'tool'}`, name: 'Started model', instructions: 'Answer once', model: () => selected })
    const mastra = new Mastra({ agents: { research: agent }, gateways: { lumen: models.gateway } })
    try {
      await (await agent.stream('请回答', { maxSteps: 1 })).consumeStream().catch(() => {})
      assert.equal(calls, 1)
    } finally { await mastra.shutdown() }
  }
})

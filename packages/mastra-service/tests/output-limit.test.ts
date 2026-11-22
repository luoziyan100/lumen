/**
 * [INPUT]: the HTTP service (createHttpService), the official MastraClient session SSE and the provider HTTP fixture (finish_reason length with no text)
 * [OUTPUT]: R1 evidence: a model step that stops at its output limit before any text or tool call fails the run over HTTP/SSE with the product code
 *           run.output_limit (Chinese text, no English framework wording), sends one model request only, and never triggers the empty-action retry;
 *           truncated text at the limit stays the Controller's own length finish (unchanged since 1.82)
 * [POS]: the boundary between Mastra 1.85's length error (#30595) and guards/empty-action.ts (stop/end-turn only)
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serve } from '@hono/node-server'
import { MastraClient, type AgentControllerEvent } from '@mastra/client-js'
import { createHttpService } from '../src/server.ts'
import { fixtureProvider, type ProviderRequest, type Reply } from './provider-fixture.ts'

const token = 'test-local-token-at-least-24-characters'

async function run(respond: (request: ProviderRequest) => Reply, message: string) {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-output-limit-'))
  const fixture = fixtureProvider(respond)
  const service = await createHttpService({ dataRoot, token, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'research-test', fetch: fixture.fetch } })
  const server = serve({ fetch: service.app.fetch, hostname: '127.0.0.1', port: 0 })
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const baseUrl = `http://127.0.0.1:${address.port}`, headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const events: AgentControllerEvent[] = []
  let unsubscribe: (() => void) | undefined
  try {
    const topic = (await (await fetch(`${baseUrl}/lumen/topics`, { method: 'POST', headers, body: JSON.stringify({ title: '额度' }) })).json() as { id: string }).id
    assert.equal((await fetch(`${baseUrl}/lumen/topics/${topic}/sessions`, { method: 'POST', headers, body: JSON.stringify({ taskId: 't' }) })).status, 201)
    const session = new MastraClient({ baseUrl, headers: { Authorization: `Bearer ${token}` } }).getAgentController('lumen').session(`${topic}:t`)
    let ended!: () => void
    const done = new Promise<void>(resolve => { ended = resolve })
    unsubscribe = (await session.subscribe({ onEvent: event => { events.push(event); if (event.type === 'agent_end') ended() } })).unsubscribe
    await session.sendMessage(message)
    await done
    return { events, requests: fixture.requests }
  } finally {
    unsubscribe?.()
    if ('closeAllConnections' in server) server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await service.close()
    await rm(dataRoot, { recursive: true, force: true })
  }
}

test('R1: a step that stops at the output limit with no text or tool call fails over HTTP/SSE with run.output_limit, one model request, no empty-action retry', { timeout: 30000 }, async () => {
  const { events, requests } = await run(() => ({ content: '', finish: 'length', usage: { prompt_tokens: 30, completion_tokens: 64, total_tokens: 94 } }), '解释这篇论文')
  const end = events.find(event => event.type === 'agent_end') as { reason?: string } | undefined
  assert.equal(end?.reason, 'error', 'the run ends as a failure, not complete')
  const errors = events.filter(event => event.type === 'error').map(event => (event as { error: { message?: string; codes?: string[] } }).error)
  assert.equal(errors.length, 1, JSON.stringify(errors))
  assert.deepEqual(errors[0]!.codes, ['run.output_limit'])
  assert.match(errors[0]!.message ?? '', /输出额度/)
  assert.doesNotMatch(JSON.stringify(errors), /maximum output length|maxOutputTokens/)
  assert.equal(requests.length, 1, 'neither the framework nor empty-action.ts sends a second model request')
  assert.doesNotMatch(JSON.stringify(requests), /上一轮没有可见正文/)
})

test('R1 boundary: truncated text that ends at the limit is kept; the Controller reports its own length finish as in 1.82, without run.output_limit', { timeout: 30000 }, async () => {
  const { events, requests } = await run(() => ({ content: '截断的半句回答', finish: 'length' }), '解释这篇论文')
  assert.match(JSON.stringify(events), /截断的半句回答/, 'the truncated text reaches the client')
  const errors = events.filter(event => event.type === 'error') as unknown as { error: { codes?: string[] }; finishReason?: string }[]
  assert.equal(errors.length, 1)
  assert.equal(errors[0]!.finishReason, 'length')
  assert.equal(errors[0]!.error.codes, undefined)
  assert.equal(requests.length, 1)
})

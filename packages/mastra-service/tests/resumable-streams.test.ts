/**
 * [INPUT]: the full application (main agent, registered specialists, Controller, Mastra pubsub and server cache) and the provider HTTP fixture
 * [OUTPUT]: B1 evidence: Mastra 1.83+ turns resumable streams on for agents registered on Mastra; Lumen keeps them off (durable: false), so a full run
 *           with one delegation publishes nothing on agent stream topics, writes no run log or ownership record to the server cache and leaves no subscription
 * [POS]: upgrade guard for the 1.83 default change (#28424, #29503); persisted history after an SSE drop stays the only catch-up path
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Agent } from '@mastra/core/agent'
import { EventEmitterPubSub } from '@mastra/core/events'
import { Mastra } from '@mastra/core/mastra'
import { createApplication } from '../src/application.ts'
import { fixtureProvider, textReply, toolReply } from './provider-fixture.ts'

const model = (fetch: typeof globalThis.fetch) => ({ baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch })

test('B1: a plain agent registered on Mastra has resumable streams by default', async () => {
  const agent = new Agent({ id: 'probe', name: 'Probe', instructions: 'probe', model: 'openai/gpt-5-mini' })
  const mastra = new Mastra({ agents: { probe: agent } })
  try { assert.equal(mastra.getAgent('probe').hasResumableStreams(), true) } finally { await mastra.shutdown() }
})

test('B1: the main agent and every specialist keep streams off; a full run with a delegation leaves no stream publication, cache entry or subscription', { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-streams-'))
  const fixture = fixtureProvider(request => {
    if (request.messages.some(m => m.role === 'system' && String(m.content).includes('只读材料'))) return textReply('CHILD_EVIDENCE')
    if (request.messages.some(m => m.role === 'tool')) return textReply('PARENT_DONE')
    return toolReply('agent-reader', { prompt: '读一遍材料' })
  })
  const app = await createApplication({ dataRoot: root, model: model(fixture.fetch) })
  const published: string[] = [], subscribed = new Map<string, number>(), cached: string[] = []
  const cache = app.mastra.getServerCache(), proto = EventEmitterPubSub.prototype, { publish, subscribe, unsubscribe } = proto
  proto.publish = function (topic, ...rest) { published.push(topic); return publish.call(this, topic, ...rest) }
  proto.subscribe = function (topic, ...rest) { subscribed.set(topic, (subscribed.get(topic) ?? 0) + 1); return subscribe.call(this, topic, ...rest) }
  proto.unsubscribe = function (topic, ...rest) { subscribed.set(topic, (subscribed.get(topic) ?? 0) - 1); return unsubscribe.call(this, topic, ...rest) }
  for (const method of ['set', 'listPush', 'listPushIndexed', 'increment'] as const) {
    const original = cache[method].bind(cache) as (key: string, ...rest: unknown[]) => Promise<unknown>
    Object.assign(cache, { [method]: (key: string, ...rest: unknown[]) => { cached.push(key); return original(key, ...rest) } })
  }
  try {
    const session = await app.session('topic', 'streams')
    session.subscribe(event => {
      if (event.type === 'tool_approval_required') session.respondToToolApproval({ toolCallId: event.toolCallId, decision: 'approve' })
    })
    await session.sendMessage({ content: '委派专家读材料' })
    assert.ok(fixture.requests.some(r => r.messages.some(m => m.role === 'tool' && JSON.stringify(m.content).includes('CHILD_EVIDENCE'))), 'the delegation ran')
    const agents = [app.agent, ...Object.values((await app.specialists.get()).registeredAgents)]
    for (const agent of agents) assert.equal(agent.hasResumableStreams(), false, `${agent.id} publishes a resumable stream`)
    assert.deepEqual(published.filter(topic => topic.startsWith('agent.stream')), [], 'no run published on an agent stream topic')
    assert.deepEqual(cached.filter(key => /agent|run|stream/i.test(key)), [], 'no run log or ownership record in the server cache')
    assert.deepEqual([...subscribed].filter(([topic, count]) => topic.startsWith('agent.stream') && count !== 0), [], 'no stream subscription left behind')
    assert.ok(published.length > 0, 'the spy sees the pubsub Mastra uses')
    await app.close()
    assert.deepEqual([...subscribed].filter(([topic, count]) => topic.startsWith('agent.') && count !== 0), [], 'closing releases the Controller thread streams')
  } finally { Object.assign(proto, { publish, subscribe, unsubscribe }); await app.close(); await rm(root, { recursive: true, force: true }) }
})

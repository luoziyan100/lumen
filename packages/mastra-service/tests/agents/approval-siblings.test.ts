/**
 * [INPUT]: the full application (Controller permission categories, explicit ask rules, topic workspace) and the provider HTTP fixture returning two tool calls in one response
 * [OUTPUT]: R4 evidence (#30605): after one call of a response waits for approval and is approved, its sibling call is still judged by Lumen's
 *           permission rules: an allowed category runs on its own, an explicit ask still asks; neither is bypassed and nothing asks twice.
 *           Covered in-stream (answered while the run waits) and across a service restart (approved through the official tool-approval route after reopening)
 * [POS]: upgrade guard for sibling tool calls across an approval resume; the Controller passes the category resolver, Lumen adds no approval layer
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentControllerWireEvent } from '@mastra/core/agent-controller'
import { createApplication } from '../../src/application.ts'
import { createHttpService } from '../../src/server.ts'
import { fixtureProvider, textReply, toolsReply, type Call } from '../provider-fixture.ts'
import { ensureTopic } from '../topic-fixture.ts'

const token = 'approval-siblings-token-at-least-24-characters'
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
type Pending = Extract<AgentControllerWireEvent, { type: 'display_state_changed' }>['displayState']['pendingApprovals']

async function until(check: () => Promise<boolean>, message: string) {
  for (let i = 0; i < 400; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 25)) }
  assert.fail(message)
}

async function siblings(calls: Call[], ask: string[]) {
  const root = await mkdtemp(join(tmpdir(), 'lumen-approval-siblings-'))
  const fixture = fixtureProvider(request => request.messages.some(message => message.role === 'tool') ? textReply('两件都处理完了') : toolsReply(calls))
  const app = await createApplication({ dataRoot: root, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  try {
    const session = await app.session('p', 'siblings')
    const work = join(root, 'topics/p/work')
    await (await app.workspaceFor('p')).filesystem!.writeFile('seed.txt', 'SEED_CONTENT')
    for (const toolName of ask) await session.permissions.setForTool({ toolName, policy: 'ask' })
    const approvals: string[] = []
    session.subscribe(event => {
      if (event.type !== 'tool_approval_required') return
      approvals.push(`${event.toolName}:${event.toolCallId}`)
      void session.respondToToolApproval({ toolCallId: event.toolCallId, decision: 'approve' })
    })
    let ended!: () => void
    const done = new Promise<void>(resolve => { ended = resolve })
    session.subscribe(event => { if (event.type === 'agent_end' && event.reason !== 'suspended') ended() })
    await session.sendMessage({ content: '两件事一起做' })
    await done
    const results = fixture.requests.flatMap(request => request.messages.filter(message => message.role === 'tool').map(message => `${message.tool_call_id}:${JSON.stringify(message.content)}`))
    const files = Object.fromEntries(await Promise.all(['a.md', 'b.md'].map(async path => [path, await readFile(join(work, path), 'utf8').catch(() => null)] as const)))
    return { approvals, results, files }
  } finally { await app.close(); await rm(root, { recursive: true, force: true }).catch(() => {}) }
}

test('R4: an approved write and its allowed sibling read: the read runs on its own after the resume, without asking', { timeout: 30000 }, async () => {
  const outcome = await siblings([
    { id: 'write-a', name: 'write_file', arguments: { path: 'a.md', content: 'A_WRITTEN' } },
    { id: 'read-seed', name: 'read_file', arguments: { path: 'seed.txt' } },
  ], ['write_file'])
  assert.deepEqual(outcome.approvals, ['write_file:write-a'], 'only the explicit ask asks')
  assert.ok(outcome.results.some(result => result.startsWith('read-seed:') && result.includes('SEED_CONTENT')), JSON.stringify(outcome.results))
  assert.equal(outcome.files['a.md'], 'A_WRITTEN', 'the approved write ran')
})

test('R4: two writes that both need asking: approving the first does not let the second run unasked', { timeout: 30000 }, async () => {
  const outcome = await siblings([
    { id: 'write-a', name: 'write_file', arguments: { path: 'a.md', content: 'A_WRITTEN' } },
    { id: 'write-b', name: 'write_file', arguments: { path: 'b.md', content: 'B_WRITTEN' } },
  ], ['write_file'])
  assert.deepEqual([...outcome.approvals].sort(), ['write_file:write-a', 'write_file:write-b'], 'each write asked once')
  assert.deepEqual(outcome.files, { 'a.md': 'A_WRITTEN', 'b.md': 'B_WRITTEN' }, 'both ran after their own approval')
})

async function restarted(calls: Call[], approveFirst: string) {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-approval-siblings-restart-'))
  const fixture = fixtureProvider(request => request.messages.some(message => message.role === 'tool') ? textReply('两件都处理完了') : toolsReply(calls))
  const model = { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch }
  let service = await createHttpService({ dataRoot, token, model })
  const request = async <T>(path: string, method = 'GET', body?: unknown) => {
    const response = await service.app.request(path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    assert.equal(response.status, 200, `${method} ${path}`)
    return await response.json() as T
  }
  const pending = async () => Object.values((await request<{ displayState: { pendingApprovals: Pending } }>('/lumen/snapshot?topicId=p&taskId=siblings')).displayState.pendingApprovals).map(card => card.toolCallId).sort()
  const approve = (toolCallId: string) => request<{ ok: boolean }>(`/api/agent-controller/lumen/sessions/${encodeURIComponent('p:siblings')}/tool-approval`, 'POST', { toolCallId, approved: true })
  const work = join(dataRoot, 'topics/p/work'), file = (path: string) => readFile(join(work, path), 'utf8').catch(() => null)
  try {
    ensureTopic(service, 'p')
    await service.catalog.createSession('p', 'siblings')
    const session = await service.application.session('p', 'siblings')
    await (await service.application.workspaceFor('p')).filesystem!.writeFile('seed.txt', 'SEED_CONTENT')
    await session.permissions.setForTool({ toolName: 'write_file', policy: 'ask' })
    let parked!: () => void
    const waiting = new Promise<void>(resolve => { parked = resolve })
    session.subscribe(event => { if (event.type === 'tool_approval_required') parked() })
    void session.sendMessage({ content: '两件事一起做' }).catch(() => {})
    await waiting
    await service.close()
    service = await createHttpService({ dataRoot, token, model })
    const before = await pending()
    assert.equal((await approve(approveFirst)).ok, true)
    return { before, pending, approve, file, requests: fixture.requests, close }
  } catch (error) { await close(); throw error }
  async function close() { await service.close(); await rm(dataRoot, { recursive: true, force: true }) }
}

test('R4 after a restart: approving the write resumes the run; the allowed sibling read runs on its own and nothing else asks', { timeout: 40000 }, async () => {
  const run = await restarted([
    { id: 'write-a', name: 'write_file', arguments: { path: 'a.md', content: 'A_WRITTEN' } },
    { id: 'read-seed', name: 'read_file', arguments: { path: 'seed.txt' } },
  ], 'write-a')
  try {
    assert.deepEqual(run.before, ['write-a'], 'only the write waits across the restart')
    await until(async () => await run.file('a.md') === 'A_WRITTEN' && run.requests.length >= 2, 'the approved write did not resume')
    await until(async () => (await run.pending()).length === 0, 'something still waits for approval')
    assert.ok(JSON.stringify(run.requests.at(-1)!.messages).includes('SEED_CONTENT'), 'the read result reached the model')
  } finally { await run.close() }
})

test('R4 after a restart: two writes that both need asking: approving one leaves the other waiting; it runs only after its own approval', { timeout: 40000 }, async () => {
  const run = await restarted([
    { id: 'write-a', name: 'write_file', arguments: { path: 'a.md', content: 'A_WRITTEN' } },
    { id: 'write-b', name: 'write_file', arguments: { path: 'b.md', content: 'B_WRITTEN' } },
  ], 'write-a')
  try {
    assert.ok(run.before.includes('write-a'), JSON.stringify(run.before))
    await until(async () => await run.file('a.md') === 'A_WRITTEN', 'the approved write did not resume')
    await until(async () => (await run.pending()).includes('write-b'), 'the second write did not ask')
    assert.equal(await run.file('b.md'), null, 'the second write did not run unasked')
    assert.equal((await run.approve('write-b')).ok, true)
    await until(async () => await run.file('b.md') === 'B_WRITTEN' && (await run.pending()).length === 0, 'the second write did not run after its approval')
  } finally { await run.close() }
})

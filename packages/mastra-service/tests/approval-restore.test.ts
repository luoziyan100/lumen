/**
 * [INPUT]: 完整 HTTP 服务、真实 Controller/LibSQL 持久挂起与模型 HTTP 夹具
 * [OUTPUT]: 待审批的研究在服务重启后重新出现审批卡，经官方 tool-approval 路由批准后继续执行并解除配置写闸
 * [POS]: lifecycle/questions restoreSuspendedApprovals 的跨进程回归；不替用户批准，只恢复展示
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentControllerWireEvent } from '@mastra/core/agent-controller'
import { createHttpService } from '../src/server.ts'
import { fixtureProvider, textReply, toolReply } from './provider-fixture.ts'
import { ensureTopic } from './topic-fixture.ts'

const token = 'approval-restore-token-at-least-24-characters'
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
type Snapshot = { displayState: Extract<AgentControllerWireEvent, { type: 'display_state_changed' }>['displayState'] }

async function until(check: () => Promise<boolean>, message: string) {
  for (let i = 0; i < 200; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 25)) }
  assert.fail(message)
}

test('重启后待审批的研究重新出现审批卡，批准后继续执行并解除配置写闸', { timeout: 30000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-approval-restore-'))
  const fixture = fixtureProvider(request => request.messages.some(message => message.role === 'tool')
    ? textReply('笔记已写入')
    : toolReply('write_file', { path: 'notes/approved.md', content: '批准后写入' }, 'call-write'))
  const model = { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch }
  let service = await createHttpService({ dataRoot, token, model })
  const request = async <T>(path: string, method = 'GET', body?: unknown) => {
    const response = await service.app.request(path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    assert.equal(response.status, 200, `${method} ${path}`)
    return await response.json() as T
  }
  try {
    ensureTopic(service, 'default')
    await service.catalog.createSession('default', 'approve')
    const session = await service.application.session('default', 'approve')
    await session.permissions.setForTool({ toolName: 'write_file', policy: 'ask' })
    let parked!: () => void
    const pending = new Promise<void>(resolve => { parked = resolve })
    session.subscribe(event => { if (event.type === 'tool_approval_required') parked() })
    void session.sendMessage({ content: '写一份笔记' }).catch(() => {})
    await pending
    await service.close()

    service = await createHttpService({ dataRoot, token, model })
    assert.equal((await request<{ busy: boolean }>('/lumen/settings')).busy, true, '未处理的持久审批仍挡配置写闸')
    const snapshot = await request<Snapshot>('/lumen/snapshot?topicId=default&taskId=approve')
    const [card] = Object.values(snapshot.displayState.pendingApprovals)
    assert.equal(card?.toolName, 'write_file', '重启后打开会话必须重新出现审批卡')
    assert.equal(card?.toolCallId, 'call-write')

    const ack = await request<{ ok: boolean; reason?: string }>(`/api/agent-controller/lumen/sessions/${encodeURIComponent('default:approve')}/tool-approval`, 'POST', { toolCallId: 'call-write', approved: true })
    assert.equal(ack.ok, true, JSON.stringify(ack))
    const file = join(dataRoot, 'topics/default/work/notes/approved.md')
    await until(async () => (await readFile(file, 'utf8').catch(() => '')) === '批准后写入', '批准后研究未继续执行')
    await until(async () => !(await request<{ busy: boolean }>('/lumen/settings')).busy, '批准完成后配置写闸未解除')
  } finally { await service.close(); await rm(dataRoot, { recursive: true, force: true }) }
})

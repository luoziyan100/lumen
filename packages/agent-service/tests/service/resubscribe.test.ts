/**
 * 再次 subscribe 同一 task 必须重新回放事件流。
 * UI 每次点进会话都清屏、靠回放重建;"已订阅就跳过回放"会让看过一次的会话
 * 再点回去一片空白(2026-07-09 客户上报:新对话→点回最近会话,记录不见)。
 */
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { createService } from '../../src/service.ts'
import type { ServerMessage } from '../../src/protocol/messages.ts'
import { ScriptedModel, assistantReply } from '../helpers/scripted-model.ts'

test('重复 subscribe:每次都回放(点走再点回,聊天记录不丢)', async (t: TestContext) => {
  const home = await mkdtemp(path.join(tmpdir(), 'lumen-resub-'))
  const service = createService({ home, port: 0, modelPort: new ScriptedModel([assistantReply('答一')]) })
  const handle = await service.start()
  t.after(async () => {
    await service.runtime.drain()
    await handle.close()
    await rm(home, { recursive: true, force: true })
  })

  const ws = new WebSocket(`ws://127.0.0.1:${handle.port}/?token=${service.token}`)
  // 注册在 service 关闭之后(after 钩子 LIFO):断言失败时也先关 ws,免得 handle.close 等活连接挂死
  t.after(() => { try { ws.close() } catch { /* 已关 */ } })
  await new Promise<void>((r) => ws.addEventListener('open', () => r(), { once: true }))

  const userReplays: string[] = [] // 收到的 user 事件 id 流水(重复回放会出现同 id 两次)
  let taskId = ''
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(String((ev as MessageEvent).data)) as ServerMessage
    if (m.type === 'task_created') taskId = m.taskId
    if (m.type === 'event' && m.event.kind === 'user') userReplays.push(m.event.id)
  })

  // 开一个会话并等它跑完:submit 内部已订阅并回放第一遍
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('等 reply 超时')), 4000)
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(String((ev as MessageEvent).data)) as ServerMessage
      if (m.type === 'event' && m.event.kind === 'reply') { clearTimeout(timer); resolve() }
    })
    ws.send(JSON.stringify({ type: 'submit', projectId: 'p', userText: '第一句' }))
  })
  assert.equal(userReplays.length, 1, 'submit 后应回放一遍 user 事件')

  // 模拟「点去别处再点回来」:同一连接再次 subscribe → 必须重新回放
  ws.send(JSON.stringify({ type: 'subscribe', taskId }))
  await new Promise((r) => setTimeout(r, 600))
  assert.equal(userReplays.length, 2, '再次 subscribe 必须重新回放历史(否则 UI 清屏后一片空白)')
  ws.close()
})

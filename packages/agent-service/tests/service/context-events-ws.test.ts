/**
 * 方案 B 协议层验收:压缩/水位事件必须能穿过真实 WebSocket 到达客户端,
 * 且重新 subscribe 的回放里也带上(UI 清屏重建靠回放)。
 * 真服务 + 真 WS,只有模型是脚本;用超大 usage 锚点逼水位过阈值,不依赖窗口配置。
 */
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { createService } from '../../src/service.ts'
import type { ServerMessage } from '../../src/protocol/messages.ts'
import { ScriptedModel, assistantReply } from '../helpers/scripted-model.ts'

test('压缩与水位事件穿过 WS:实时广播 + 回放都在场', async (t: TestContext) => {
  const home = await mkdtemp(path.join(tmpdir(), 'lumen-ctxws-'))
  // 第一轮回答带天文数字 usage —— 任何窗口下水位都超阈值,第二轮必触发回合前压缩
  const model = new ScriptedModel([
    { ...assistantReply('第一轮回答'), usage: { promptTokens: 5_000_000, completionTokens: 10 } },
    assistantReply('第二轮回答'),
  ])
  const service = createService({ home, port: 0, modelPort: model })
  const handle = await service.start()
  t.after(async () => {
    await service.runtime.drain()
    await handle.close()
    await rm(home, { recursive: true, force: true })
  })

  const ws = new WebSocket(`ws://127.0.0.1:${handle.port}/?token=${service.token}`)
  t.after(() => { try { ws.close() } catch { /* 已关 */ } })
  await new Promise<void>((r) => ws.addEventListener('open', () => r(), { once: true }))

  const live: string[] = [] // 实时收到的事件 kind 流水
  let taskId = ''
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(String((ev as MessageEvent).data)) as ServerMessage
    if (m.type === 'task_created') taskId = m.taskId
    if (m.type === 'event') live.push(m.event.kind)
  })

  const waitReply = (send: () => void): Promise<void> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('等 reply 超时')), 4000)
      const on = (ev: MessageEvent | Event): void => {
        const m = JSON.parse(String((ev as MessageEvent).data)) as ServerMessage
        if (m.type === 'event' && m.event.kind === 'reply') {
          clearTimeout(timer)
          ws.removeEventListener('message', on)
          resolve()
        }
      }
      ws.addEventListener('message', on)
      send()
    })

  // 第一轮给足真实体量(5 万字符 ≈ 2.5 万 token):归档预算(默认 2 万)装不下它,第二轮必然切在新轮起点
  await waitReply(() => ws.send(JSON.stringify({ type: 'submit', projectId: 'p', userText: '第一轮问题:' + '实'.repeat(50_000) })))
  await new Promise((r) => setTimeout(r, 300)) // context_usage 在 status_change 之后落
  assert.ok(live.includes('context_usage'), `第一轮后应广播水位事件:${live.join(',')}`)
  assert.ok(!live.includes('compaction'), '单轮不该压缩')

  await waitReply(() => ws.send(JSON.stringify({ type: 'continue', taskId, userText: '第二轮问题' })))
  await new Promise((r) => setTimeout(r, 300))
  assert.ok(live.includes('compaction'), `第二轮前应广播压缩事件:${live.join(',')}`)
  assert.equal(model.calls.length, 2, '压缩零额外模型调用')

  // 清屏重订阅:回放流里必须还有 compaction(UI 重建分隔线靠它)
  const replay: string[] = []
  const ws2 = new WebSocket(`ws://127.0.0.1:${handle.port}/?token=${service.token}`)
  t.after(() => { try { ws2.close() } catch { /* 已关 */ } })
  await new Promise<void>((r) => ws2.addEventListener('open', () => r(), { once: true }))
  ws2.addEventListener('message', (ev) => {
    const m = JSON.parse(String((ev as MessageEvent).data)) as ServerMessage
    if (m.type === 'event') replay.push(m.event.kind)
  })
  ws2.send(JSON.stringify({ type: 'subscribe', taskId }))
  await new Promise((r) => setTimeout(r, 600))
  assert.ok(replay.includes('compaction'), `回放应包含压缩事件:${replay.join(',')}`)
  assert.ok(replay.includes('context_usage'), '回放应包含水位事件')
  ws.close(); ws2.close()
})

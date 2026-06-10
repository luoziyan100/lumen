import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { createService } from '../../src/service.ts'
import type { ServerMessage } from '../../src/protocol/messages.ts'
import { ScriptedModel, assistantReply } from '../helpers/scripted-model.ts'

test('createService 组装真实工具集与角色并启动，submit 跑通，写出 portfile', async (t: TestContext) => {
  const home = await mkdtemp(path.join(tmpdir(), 'lumen-home-'))
  const service = createService({ home, port: 0, modelPort: new ScriptedModel([assistantReply('你好，我是 Lumen')]) })
  const handle = await service.start()
  t.after(async () => {
    await service.runtime.drain()
    await handle.close()
    await rm(home, { recursive: true, force: true })
  })

  assert.ok(existsSync(path.join(home, 'agent-service.json')), '应写出 portfile')

  const ws = new WebSocket(`ws://127.0.0.1:${handle.port}`)
  await new Promise<void>((r) => ws.addEventListener('open', () => r(), { once: true }))

  const reply = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 4000)
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(String((ev as MessageEvent).data)) as ServerMessage
      if (m.type === 'event' && m.event.kind === 'reply') {
        clearTimeout(timer)
        resolve(JSON.parse(m.event.payload_json).reply as string)
      }
    })
    ws.send(JSON.stringify({ type: 'submit', projectId: 'p', userText: '你好' }))
  })

  assert.match(reply, /Lumen/)
  ws.close()
})

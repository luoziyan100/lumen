import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { createService } from '../../src/service.ts'
import type { ServerMessage } from '../../src/protocol/messages.ts'
import { ScriptedModel, assistantReply } from '../helpers/scripted-model.ts'
import { buildMinimalPdf } from '../helpers/minimal-pdf.ts'

test('createService 组装真实工具集与角色并启动，submit 跑通，写出带 token 的 portfile', async (t: TestContext) => {
  const home = await mkdtemp(path.join(tmpdir(), 'lumen-home-'))
  const service = createService({ home, port: 0, modelPort: new ScriptedModel([assistantReply('你好，我是 Lumen')]) })
  const handle = await service.start()
  t.after(async () => {
    await service.runtime.drain()
    await handle.close()
    await rm(home, { recursive: true, force: true })
  })

  const portfilePath = path.join(home, 'agent-service.json')
  assert.ok(existsSync(portfilePath), '应写出 portfile')
  const portfile = JSON.parse(await readFile(portfilePath, 'utf8')) as { port: number; token: string }
  assert.equal(portfile.token, service.token, 'portfile 应包含服务 token')
  assert.equal(((await stat(portfilePath)).mode & 0o777), 0o600, 'portfile 权限应为 0600')

  const ws = new WebSocket(`ws://127.0.0.1:${handle.port}/?token=${portfile.token}`)
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

test('鉴权：无 token / 错 token 的连接被立即关闭（4401），不进协议处理', async (t: TestContext) => {
  const home = await mkdtemp(path.join(tmpdir(), 'lumen-auth-'))
  const service = createService({ home, port: 0, modelPort: new ScriptedModel([]) })
  const handle = await service.start()
  t.after(async () => {
    await handle.close()
    await rm(home, { recursive: true, force: true })
  })

  const closedWith = (url: string): Promise<number> =>
    new Promise<number>((resolve, reject) => {
      const ws = new WebSocket(url)
      const timer = setTimeout(() => reject(new Error('未被关闭')), 3000)
      ws.addEventListener('close', (ev) => {
        clearTimeout(timer)
        resolve((ev as CloseEvent).code)
      })
    })

  assert.equal(await closedWith(`ws://127.0.0.1:${handle.port}`), 4401, '无 token 应被 4401 关闭')
  assert.equal(await closedWith(`ws://127.0.0.1:${handle.port}/?token=wrong`), 4401, '错 token 应被 4401 关闭')
})

test('HTTP:上传 PDF → 取回二进制 + 列入资产;无 token 拒、不存在 404', async (t: TestContext) => {
  const home = await mkdtemp(path.join(tmpdir(), 'lumen-http-'))
  const service = createService({ home, port: 0, modelPort: new ScriptedModel([]) })
  const handle = await service.start()
  t.after(async () => { await handle.close(); await rm(home, { recursive: true, force: true }) })

  const tk = service.token
  const baseUrl = `http://127.0.0.1:${handle.port}`
  const pdf = new Uint8Array(buildMinimalPdf('uploaded pdf body'))

  const up = await fetch(`${baseUrl}/upload?project=p&name=mine.pdf&token=${tk}`, { method: 'POST', body: pdf })
  assert.equal(up.status, 200)
  assert.equal(((await up.json()) as { path: string }).path, 'papers/mine.pdf')

  const got = await fetch(`${baseUrl}/pdf?project=p&path=${encodeURIComponent('papers/mine.pdf')}&token=${tk}`)
  assert.equal(got.status, 200)
  assert.equal(got.headers.get('content-type'), 'application/pdf')
  assert.equal(new Uint8Array(await got.arrayBuffer()).length, pdf.length)

  const assets = await service.runtime.listAssets('p')
  assert.ok(assets.some((a) => a.path === 'papers/mine.pdf' && a.kind === 'pdf'), '上传的 PDF 应列入资产')

  assert.equal((await fetch(`${baseUrl}/pdf?project=p&path=papers/mine.pdf`)).status, 401, '无 token 拒')
  assert.equal((await fetch(`${baseUrl}/pdf?project=p&path=papers/nope.pdf&token=${tk}`)).status, 404, '不存在 404')
})

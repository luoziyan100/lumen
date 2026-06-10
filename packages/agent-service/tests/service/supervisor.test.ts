import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { spawnService } from '../../src/supervisor.ts'
import { LumenClient } from '../../src/client/agent-client.ts'

const ENTRY = path.resolve(import.meta.dirname, '..', '..', 'src', 'service.ts')

test('进程生命周期：service 作为独立子进程启动 → 写 portfile → 可连接 → 可停止', async (t: TestContext) => {
  const home = await mkdtemp(path.join(tmpdir(), 'lumen-sup-'))
  // 不给 ANTHROPIC_API_KEY：服务仍应起来并绑端口（model 只在 submit 时才需要）
  const proc = await spawnService({ home, entry: ENTRY, env: { ANTHROPIC_API_KEY: '' } })
  t.after(async () => {
    proc.stop()
    await rm(home, { recursive: true, force: true })
  })

  assert.ok(proc.port > 0, '应从 portfile 读到真实端口')
  assert.ok(existsSync(path.join(home, 'agent-service.json')), 'portfile 应存在')

  assert.ok(proc.token, 'portfile 应带 token')

  // 独立进程，本测试进程通过 WS 连上它（模拟 UI 客户端，带 token）
  const client = new LumenClient(`ws://127.0.0.1:${proc.port}`, { token: proc.token })
  await client.connect()
  const tasks = await client.list('p')
  assert.ok(Array.isArray(tasks), 'list 应返回数组')
  client.close()

  // stop() 之后端口应释放（进程被杀）——这正是"完全退出 app 才杀 sidecar"的对照
  proc.stop()
})

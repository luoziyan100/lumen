import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { SettingsStore, type PublicSettings } from '../../src/storage/settings.ts'
import { createService } from '../../src/service.ts'
import type { ServerMessage } from '../../src/protocol/messages.ts'
import { ScriptedModel, assistantReply } from '../helpers/scripted-model.ts'

const DEFAULTS = { provider: 'openai' as const, baseUrl: 'https://relay.example', apiKey: 'sk-env-key-1234567890', model: 'glm-5' }

async function tmp(t: TestContext): Promise<string> {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-set-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  return base
}

test('种子:空配置启动种一个继承 .env 的 default(不复制 env key 进文件)', async (t) => {
  const file = path.join(await tmp(t), 'settings.json')
  const store = new SettingsStore(file, DEFAULTS)
  const pub = store.toPublic()
  assert.equal(pub.profiles.length, 1)
  assert.equal(pub.profiles[0].id, 'default')
  assert.equal(pub.profiles[0].apiKeyMasked, '继承 .env')
  assert.deepEqual(pub.profiles[0].models, [DEFAULTS.model])
  assert.equal(pub.profiles[0].activeModel, DEFAULTS.model)
  assert.equal(pub.activeProfileId, 'default')
  assert.equal(store.effective().apiKey, DEFAULTS.apiKey)
  // 种子先在内存;首次 update 才落盘。落盘不含 env key 明文,只写 models/activeModel
  store.update({})
  const disk = await readFile(file, 'utf8')
  assert.doesNotMatch(disk, /sk-env-key/)
  assert.match(disk, /"models"/)
  assert.doesNotMatch(disk, /"model":/)
})

test('迁移:旧平铺 settings.json → 单 profile,字段保留', async (t) => {
  const file = path.join(await tmp(t), 'settings.json')
  await writeFile(file, JSON.stringify({ provider: 'openai', baseUrl: 'https://old.example', apiKey: 'sk-old-key-000011112222', model: 'old-model', userInstructions: '先给结论' }))
  const store = new SettingsStore(file, DEFAULTS)
  const pub = store.toPublic()
  assert.equal(pub.profiles.length, 1)
  assert.equal(pub.profiles[0].model, 'old-model')
  assert.deepEqual(pub.profiles[0].models, ['old-model'])
  assert.equal(pub.profiles[0].activeModel, 'old-model')
  assert.match(pub.profiles[0].apiKeyMasked, /^sk-old…2222$/)
  assert.equal(pub.userInstructions, '先给结论')
  assert.equal(store.effective().apiKey, 'sk-old-key-000011112222')
})

test('迁移:旧 profile.model 单字段 → models/activeModel', async (t) => {
  const file = path.join(await tmp(t), 'settings.json')
  await writeFile(file, JSON.stringify({
    profiles: [{ id: 'mp-1', name: 'DeepSeek', provider: 'openai', baseUrl: 'https://api.deepseek.com', apiKey: 'sk-ds-key-aaaabbbbcccc', model: 'deepseek-v4-flash' }],
    activeProfileId: 'mp-1',
  }))
  const store = new SettingsStore(file, DEFAULTS)
  const p = store.toPublic().profiles[0]
  assert.deepEqual(p.models, ['deepseek-v4-flash'])
  assert.equal(p.activeModel, 'deepseek-v4-flash')
  assert.equal(p.model, 'deepseek-v4-flash')
  store.update({}) // 触发落盘
  const disk = JSON.parse(await readFile(file, 'utf8')) as { profiles: Array<Record<string, unknown>> }
  assert.deepEqual(disk.profiles[0].models, ['deepseek-v4-flash'])
  assert.equal(disk.profiles[0].activeModel, 'deepseek-v4-flash')
  assert.equal(disk.profiles[0].model, undefined)
})

test('多 profile:新增 DeepSeek → 启用切换;key 不跨 profile 继承', async (t) => {
  const file = path.join(await tmp(t), 'settings.json')
  const store = new SettingsStore(file, DEFAULTS)

  // 新增(无 key):不得继承 env key
  let pub = store.update({ upsertProfile: { name: 'DeepSeek', provider: 'openai', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' } })
  const ds = pub.profiles.find((p) => p.name === 'DeepSeek')!
  assert.equal(ds.hasApiKey, false, '非 default profile 不许继承 .env key')
  assert.deepEqual(ds.models, ['deepseek-chat'])

  // 启用 DeepSeek → effective 换过去;无 key 时 effective.apiKey 为空(模型层会给清晰报错)
  pub = store.update({ activeProfileId: ds.id })
  assert.equal(pub.activeProfileId, ds.id)
  assert.equal(store.effective().model, 'deepseek-chat')
  assert.equal(store.effective().apiKey, undefined)

  // 补 key → 生效;掩码不含明文
  pub = store.update({ upsertProfile: { id: ds.id, apiKey: 'sk-ds-key-aaaabbbbcccc' } })
  assert.equal(store.effective().apiKey, 'sk-ds-key-aaaabbbbcccc')
  assert.doesNotMatch(JSON.stringify(pub), /sk-ds-key-aaaabbbbcccc/)

  // 编辑传空 key = 保持;单字段 model 更新 active
  store.update({ upsertProfile: { id: ds.id, apiKey: '', model: 'deepseek-reasoner' } })
  assert.equal(store.effective().apiKey, 'sk-ds-key-aaaabbbbcccc')
  assert.equal(store.effective().model, 'deepseek-reasoner')

  // 删除启用中的 → 回退到剩余第一个
  pub = store.update({ deleteProfileId: ds.id })
  assert.equal(pub.activeProfileId, 'default')

  // 0600 + 重载持久
  assert.equal(((await stat(file)).mode & 0o777), 0o600)
  const reloaded = new SettingsStore(file, DEFAULTS)
  assert.equal(reloaded.toPublic().profiles.length, 1)
})

test('同卡多 models:列表替换 + activeModel 切换,不新建 profile', async (t) => {
  const file = path.join(await tmp(t), 'settings.json')
  const store = new SettingsStore(file, DEFAULTS)

  let pub = store.update({
    upsertProfile: {
      name: 'DeepSeek',
      provider: 'openai',
      baseUrl: 'https://api.deepseek.com',
      models: ['deepseek-v4-flash'],
      activeModel: 'deepseek-v4-flash',
      apiKey: 'sk-ds-key-aaaabbbbcccc',
    },
  })
  const ds = pub.profiles.find((p) => p.name === 'DeepSeek')!
  assert.equal(pub.profiles.length, 2) // default + DeepSeek

  pub = store.update({
    upsertProfile: {
      id: ds.id,
      models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
      activeModel: 'deepseek-v4-pro',
    },
  })
  const next = pub.profiles.find((p) => p.id === ds.id)!
  assert.deepEqual(next.models, ['deepseek-v4-flash', 'deepseek-v4-pro'])
  assert.equal(next.activeModel, 'deepseek-v4-pro')
  assert.equal(next.model, 'deepseek-v4-pro')
  assert.equal(pub.profiles.length, 2, '不得因加模型 ID 而多出 profile 卡')

  store.update({ activeProfileId: ds.id })
  assert.equal(store.effective().model, 'deepseek-v4-pro')

  // active 指向已删 ID → 回退首项
  pub = store.update({
    upsertProfile: { id: ds.id, models: ['deepseek-v4-flash'], activeModel: 'deepseek-v4-pro' },
  })
  assert.equal(pub.profiles.find((p) => p.id === ds.id)!.activeModel, 'deepseek-v4-flash')
})

test('WS 端到端:profiles CRUD + 用户指令进系统提示词', async (t: TestContext) => {
  const home = await tmp(t)
  const model = new ScriptedModel([assistantReply('好的')])
  const service = createService({ home, port: 0, modelPort: model, provider: 'openai', model: 'glm-5', apiKey: 'sk-x' })
  const handle = await service.start()
  t.after(async () => {
    await service.runtime.drain()
    await handle.close()
  })

  const ws = new WebSocket(`ws://127.0.0.1:${handle.port}/?token=${service.token}`)
  await new Promise<void>((r) => ws.addEventListener('open', () => r(), { once: true }))
  const ask = (payload: unknown): Promise<PublicSettings> =>
    new Promise((resolve) => {
      const handler = (ev: MessageEvent): void => {
        const m = JSON.parse(String(ev.data)) as ServerMessage
        if (m.type === 'settings') {
          ws.removeEventListener('message', handler as never)
          resolve(m.settings as PublicSettings)
        }
      }
      ws.addEventListener('message', handler as never)
      ws.send(JSON.stringify(payload))
    })

  let pub = await ask({ type: 'get_settings' })
  assert.equal(pub.profiles.length, 1)

  pub = await ask({ type: 'update_settings', settings: { upsertProfile: { name: 'Claude 官方', provider: 'anthropic', model: 'claude-sonnet-4-6', apiKey: 'sk-ant-xxxx' } } })
  assert.equal(pub.profiles.length, 2)
  assert.deepEqual(pub.profiles.find((p) => p.name === 'Claude 官方')!.models, ['claude-sonnet-4-6'])

  pub = await ask({ type: 'update_settings', settings: { userInstructions: '永远先给结论' } })
  assert.equal(pub.userInstructions, '永远先给结论')

  const taskId = service.runtime.submit({ projectId: 'p', userText: '你好' })
  await service.runtime.waitFor(taskId)
  const system = model.calls[0].find((m) => m.role === 'system')
  assert.match(system?.content ?? '', /# 用户自定义指令\n永远先给结论/)

  ws.close()
})

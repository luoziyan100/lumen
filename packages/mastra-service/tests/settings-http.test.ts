/**
 * [INPUT]: 真实设置文件、Hono 路由、运行边界回调
 * [OUTPUT]: 脱敏响应、输入拒绝、保存前限制与保存后通知的 HTTP 行为证据
 * [POS]: 设置产品接口验证；模型密钥和磁盘导入路径不进入公开读取端点
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { settingsRoutes } from '../src/settings/routes.ts'
import { openSettingsStore, SettingsError } from '../src/settings/store.ts'
import type { PublicSettings } from '../src/settings/types.ts'

test('设置 HTTP 仅返回脱敏档案，非法输入不保存且不调用运行回调', async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-settings-http-'))
  const store = await openSettingsStore({ dataRoot })
  let changes = 0, busy = false
  const app = settingsRoutes(store, { busy: () => busy, changed: () => { changes++ } })
  const update = (body: unknown) => app.request('/settings', { method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  try {
    const secret = 'fixture-key-never-return-to-ui'
    const created = await update({ upsertProfile: { id: 'one', models: ['a', 'b'], activeModel: 'b', apiKey: secret } })
    assert.equal(created.status, 200)
    assert.ok(!(await created.text()).includes(secret))
    const publicSettings = await (await app.request('/settings')).json() as PublicSettings
    assert.equal(publicSettings.busy, false)
    assert.equal(publicSettings.profiles[0]?.hasApiKey, true)
    assert.ok(!('apiKey' in publicSettings.profiles[0]!))
    busy = true
    assert.equal((await (await app.request('/settings')).json() as PublicSettings).busy, true)
    busy = false
    const before = await readFile(join(dataRoot, 'settings.json'), 'utf8')
    for (const input of [
      { upsertProfile: { id: '../outside' } },
      { upsertProfile: { id: 'one', provider: 'unknown' } },
      { upsertProfile: { id: 'one', baseUrl: `https://name:${secret}@example.invalid` } },
      { upsertProfile: { id: 'one', models: [5] } },
      { upsertProfile: { id: 'one', vision: 'sometimes' } },
      { upsertProfile: { id: 'one', activeModel: 'missing' } },
      { collectExecEvidence: 'false' }, { path: '/private/settings.json' }, {},
    ]) {
      const result = await update(input)
      assert.equal(result.status, 400)
      assert.ok(!(await result.text()).includes(secret))
    }
    assert.equal(changes, 1)
    assert.equal(await readFile(join(dataRoot, 'settings.json'), 'utf8'), before)
    assert.equal((await app.request('/settings/import', { method: 'POST' })).status, 404)
  } finally { await store.close(); await rm(dataRoot, { recursive: true, force: true }) }
})

test('运行边界先拒绝不保存，接受后的回调按提交顺序读取已保存设置', async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-settings-http-'))
  const store = await openSettingsStore({ dataRoot })
  let running = true, failRuntime = false
  const seen: string[] = []
  const scopes: string[] = []
  const app = settingsRoutes(store, {
    withUpdate: async work => {
      scopes.push('enter')
      try { return await work() } finally { scopes.push('leave') }
    },
    beforeChange: () => { if (running) throw new SettingsError('Agent is running', 409) },
    changed: async next => {
      assert.equal(store.toPublic().userInstructions, next.userInstructions)
      assert.equal(JSON.parse(await readFile(join(dataRoot, 'settings.json'), 'utf8')).userInstructions, next.userInstructions)
      if (failRuntime) throw new Error('fixture internal credentials must not be returned')
      seen.push(next.userInstructions)
    },
  })
  const update = (userInstructions: string) => app.request('/settings', { method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userInstructions }) })
  try {
    assert.equal((await update('拒绝保存')).status, 409)
    assert.equal(store.isInitialized(), false)
    running = false
    const responses = await Promise.all([update('第一条'), update('第二条')])
    assert.deepEqual(responses.map(response => response.status), [200, 200])
    assert.deepEqual(seen, ['第一条', '第二条'])
    failRuntime = true
    const result = await update('已保存但未应用')
    assert.equal(result.status, 500)
    const body = await result.json() as { saved: boolean; error: string; settings: PublicSettings }
    assert.equal(body.saved, true)
    assert.equal(body.settings.userInstructions, '已保存但未应用')
    assert.ok(!body.error.includes('credentials'))
    assert.deepEqual(scopes, ['enter', 'leave', 'enter', 'leave', 'enter', 'leave', 'enter', 'leave'])
  } finally { await store.close(); await rm(dataRoot, { recursive: true, force: true }) }
})

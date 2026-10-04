/**
 * [INPUT]: 设置存储公开/内部接口、真实临时目录和权限故障
 * [OUTPUT]: 多模型档案、凭证隔离、原子保存失败与显式旧格式导入证据
 * [POS]: 设置领域的持久化行为验证，不启动正式服务或读取真实用户凭证
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openSettingsStore, SettingsError } from '../src/settings/store.ts'

const root = () => mkdtemp(join(tmpdir(), 'lumen-settings-'))
const sampleKey = 'sk-fixture-credential-keep-private'

test('多档案多模型可重开，公开 DTO 不泄露 key，空值和掩码更新保留真实凭证', async () => {
  const dataRoot = await root()
  let store = await openSettingsStore({ dataRoot })
  try {
    assert.equal(store.isInitialized(), false)
    assert.equal(store.effective(), null)
    await store.update({ upsertProfile: { id: 'a', name: '兼容服务', provider: 'openai',
      baseUrl: 'https://provider.invalid/v1/chat/completions', apiKey: sampleKey,
      models: [' first ', 'second', 'first', ''], activeModel: 'second', vision: 'on', contextWindow: 200000 } })
    const publicView = store.toPublic()
    assert.deepEqual(publicView.profiles[0]!.models, ['first', 'second'])
    assert.equal(publicView.profiles[0]!.hasApiKey, true)
    assert.ok(!JSON.stringify(publicView).includes(sampleKey))
    assert.ok(!('apiKey' in publicView.profiles[0]!))
    assert.equal(store.modelSettings()?.baseURL, 'https://provider.invalid/v1')
    assert.equal(store.modelSettings()?.model, 'second')
    for (const apiKey of ['', publicView.profiles[0]!.apiKeyMasked, 'sk-fix…vate', '已配置', '********']) {
      await store.update({ upsertProfile: { id: 'a', apiKey } })
      assert.equal(store.effective()?.apiKey, sampleKey)
    }
    publicView.profiles[0]!.models.length = 0
    assert.equal(store.toPublic().profiles[0]!.models.length, 2)
    await store.update({ upsertProfile: { id: 'b', name: '无凭证的另一厂商', provider: 'anthropic', models: ['other'] } })
    await store.update({ activeProfileId: 'b', userInstructions: '每条结论标记来源', collectExecEvidence: false })
    assert.equal(store.toPublic().profiles[1]!.hasApiKey, false)
    assert.equal(store.effective()?.apiKey, '')
    assert.throws(() => store.modelSettings(), /incomplete/)
    await store.update({ activeProfileId: 'a', upsertProfile: { id: 'a', models: ['first'], vision: 'off', contextWindow: 0 } })
    assert.equal(store.effective()?.model, 'first')
    assert.equal(store.effective()?.contextWindow, undefined)
    assert.equal((await stat(join(dataRoot, 'settings.json'))).mode & 0o777, 0o600)
    await store.close()
    store = await openSettingsStore({ dataRoot })
    assert.equal(store.effective()?.apiKey, sampleKey)
    assert.equal(store.effective()?.vision, 'off')
    assert.equal(store.toPublic().userInstructions, '每条结论标记来源')
    assert.equal(store.toPublic().collectExecEvidence, false)
    await store.update({ upsertProfile: { id: 'a', clearApiKey: true } })
    assert.equal(store.toPublic().profiles[0]!.hasApiKey, false)
  } finally { await store.close(); await rm(dataRoot, { recursive: true, force: true }) }
})

test('删除活动档案切换剩余配置，非法切换不落盘，全部删除后不复活默认凭证', async () => {
  const dataRoot = await root()
  let store = await openSettingsStore({ dataRoot })
  try {
    for (const id of ['a', 'b']) await store.update({ upsertProfile: { id, models: [id], apiKey: `${sampleKey}-${id}` } })
    await store.update({ activeProfileId: 'b' })
    await store.update({ deleteProfileId: 'b' })
    assert.equal(store.toPublic().activeProfileId, 'a')
    const disk = await readFile(join(dataRoot, 'settings.json'), 'utf8')
    await assert.rejects(store.update({ activeProfileId: 'missing' }), SettingsError)
    await assert.rejects(store.update({ upsertProfile: { id: 'a', activeModel: 'not-listed' } }), SettingsError)
    assert.equal(await readFile(join(dataRoot, 'settings.json'), 'utf8'), disk)
    assert.equal(store.toPublic().activeProfileId, 'a')
    await store.update({ deleteProfileId: 'a' })
    await store.close()
    store = await openSettingsStore({ dataRoot })
    assert.deepEqual(store.toPublic().profiles, [])
    assert.equal(store.toPublic().activeProfileId, null)
    assert.equal(store.modelSettings(), null)
    await assert.rejects(store.importLegacy({ data: { model: 'resurrect', apiKey: sampleKey } }), /initialized/)
  } finally { await store.close(); await rm(dataRoot, { recursive: true, force: true }) }
})

test('并发更新串行提交，磁盘写入失败保留上一内存与磁盘版本且后续保存可恢复',
  { skip: process.getuid?.() === 0 ? 'root 不受目录写权限限制' : false }, async () => {
    const dataRoot = await root()
    const store = await openSettingsStore({ dataRoot })
    try {
      await Promise.all([
        store.update({ upsertProfile: { id: 'a', models: ['one'], apiKey: sampleKey } }),
        store.update({ userInstructions: '保留我' }),
        store.update({ collectExecEvidence: false }),
      ])
      assert.equal(store.toPublic().userInstructions, '保留我')
      assert.equal(store.toPublic().collectExecEvidence, false)
      const before = store.toPublic(), bytes = await readFile(join(dataRoot, 'settings.json'), 'utf8')
      await chmod(dataRoot, 0o500)
      await assert.rejects(store.update({ userInstructions: '不应生效', upsertProfile: { id: 'a', apiKey: 'replacement-secret' } }), /save settings/)
      assert.deepEqual(store.toPublic(), before)
      assert.equal(store.effective()?.apiKey, sampleKey)
      assert.equal(await readFile(join(dataRoot, 'settings.json'), 'utf8'), bytes)
      await chmod(dataRoot, 0o700)
      await store.update({ userInstructions: '写入恢复' })
      assert.equal(store.toPublic().userInstructions, '写入恢复')
      assert.deepEqual(await readdir(dataRoot), ['settings.json'])
    } finally { await chmod(dataRoot, 0o700); await store.close(); await rm(dataRoot, { recursive: true, force: true }) }
  })

test('旧多档案对象仅显式导入一次，旧单模型字段和无效活动选择被规范化', async () => {
  const dataRoot = await root()
  const store = await openSettingsStore({ dataRoot })
  try {
    const imported = await store.importLegacy({ data: { activeProfileId: 'not-existing', collectExecEvidence: false,
      userInstructions: '保留迁移指令', profiles: [
        { id: 'legacy', provider: 'openai', name: '旧服务', model: 'old-model', apiKey: sampleKey, vision: 'auto' },
        { id: 'newer', provider: 'anthropic', models: ['x', 'y'], activeModel: 'invalid', vision: 'on' },
      ] } })
    assert.equal(imported.activeProfileId, 'legacy')
    assert.deepEqual(imported.profiles[0]!.models, ['old-model'])
    assert.equal(imported.profiles[1]!.activeModel, 'x')
    assert.equal(imported.profiles[1]!.hasApiKey, false)
    assert.equal(store.modelSettings()?.apiKey, sampleKey)
    assert.equal(store.modelSettings()?.baseURL, 'https://api.openai.com/v1')
    assert.equal(imported.collectExecEvidence, false)
    assert.equal(imported.userInstructions, '保留迁移指令')
    await assert.rejects(store.importLegacy({ data: {} }), /initialized/)
  } finally { await store.close(); await rm(dataRoot, { recursive: true, force: true }) }
})

test('显式旧文件导入不修改源文件，损坏当前文件拒绝加载且不覆盖', async () => {
  const dataRoot = await root(), sourceRoot = await root()
  const sourcePath = join(sourceRoot, 'legacy.json')
  const source = JSON.stringify({ provider: 'anthropic', apiKey: sampleKey, model: 'research', userInstructions: '旧格式' })
  await writeFile(sourcePath, source, { mode: 0o600 })
  const store = await openSettingsStore({ dataRoot })
  try {
    await store.importLegacy({ path: sourcePath })
    assert.equal(store.toPublic().activeProfileId, 'default')
    assert.equal(store.modelSettings()?.baseURL, 'https://api.anthropic.com/v1')
    assert.equal(await readFile(sourcePath, 'utf8'), source)
    await store.close()
    const broken = `{"apiKey":"${sampleKey}",`
    await writeFile(join(dataRoot, 'settings.json'), broken)
    await assert.rejects(openSettingsStore({ dataRoot }), error => {
      assert.match(String(error), /Invalid settings document/)
      assert.ok(!String(error).includes(sampleKey))
      return true
    })
    assert.equal(await readFile(join(dataRoot, 'settings.json'), 'utf8'), broken)
  } finally { await store.close(); await rm(dataRoot, { recursive: true, force: true }); await rm(sourceRoot, { recursive: true, force: true }) }
})

/**
 * [INPUT]: 合成旧项目绑定、外部资料目录与延迟 ask_user 事件
 * [OUTPUT]: 授权源复制/只读重绑定及非邻接工具配对行为证明
 * [POS]: 离线迁移的外部资料与历史身份边界，不读取正式项目配置
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, readFile, readdir, realpath, stat, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { importLegacyData, MigrationBlockedError } from '../../src/migration/importer.ts'
import { inspectLegacy } from '../../src/migration/source.ts'
import { fingerprint, scanSource } from '../../src/migration/files.ts'
import { legacyFixture } from './fixture.ts'

test('显式旧 source_path 复制进入共享资料及只读档案，源和原目录均不变', async () => {
  const fixture = await legacyFixture()
  try {
    const library = join(fixture.root, 'library')
    await mkdir(library)
    await writeFile(join(library, 'paper.txt'), '外部证据', { mode: 0o600 })
    fixture.db.prepare('UPDATE projects SET source_path = ?').run(library)
    const original = fingerprint((await scanSource(library)).files)
    const missing = await importLegacyData(fixture)
    assert.equal(missing.ready, false)
    assert.ok(missing.issues.some(issue => issue.code === 'external_library'))
    const libraries = [{ projectId: 'p', sourcePath: library, mode: 'copy' as const }]
    const report = await importLegacyData({ ...fixture, libraries, dryRun: false })
    assert.equal(report.ready, true)
    assert.equal(report.libraries[0]!.externalFilesArchived, true)
    assert.equal(report.libraries[0]!.scope, 'shared')
    assert.equal(await readFile(join(fixture.targetRoot, 'projects/p/shared/library/paper.txt'), 'utf8'), '外部证据')
    const archived = join(fixture.targetRoot, 'archive/legacy-v1/libraries/p/paper.txt')
    assert.equal(await readFile(archived, 'utf8'), '外部证据')
    assert.equal((await stat(archived)).mode & 0o222, 0)
    assert.equal(fingerprint((await scanSource(library)).files), original)
    assert.equal((await importLegacyData({ ...fixture, libraries, dryRun: false })).alreadyImported, true)
    await assert.rejects(importLegacyData({ ...fixture, libraries: [{ ...libraries[0]!, mode: 'bind' }] }), /different external source mapping/)
  } finally { await fixture.close() }
})

test('显式 bind 仅保留原配置的独立只读 source 范围，不遍历或归档外部依赖树', async () => {
  const fixture = await legacyFixture()
  try {
    const library = join(fixture.root, 'external-code')
    await mkdir(library)
    await writeFile(join(library, 'source.txt'), '保持外部原件')
    await symlink('/some/unavailable/dependency', join(library, 'dependency'))
    fixture.db.prepare('UPDATE projects SET source_path = ?').run(library)
    const report = await importLegacyData({ ...fixture, libraries: [{ projectId: 'p', sourcePath: library, mode: 'bind' }], dryRun: false })
    assert.equal(report.ready, true)
    assert.deepEqual(report.libraries[0]!.files, [])
    assert.equal(report.libraries[0]!.externalFilesArchived, false)
    assert.equal(report.libraries[0]!.scope, 'source')
    assert.ok(report.issues.some(issue => issue.code === 'external_source_bound'))
    const path = join(fixture.targetRoot, 'projects/p/source.json')
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { version: 1, path: await realpath(library), readOnly: true })
    assert.equal((await stat(path)).mode & 0o777, 0o600)
    await assert.rejects(stat(join(fixture.targetRoot, 'projects/p/source')), { code: 'ENOENT' })
    await assert.rejects(stat(join(fixture.targetRoot, 'archive/legacy-v1/libraries')), { code: 'ENOENT' })
    assert.deepEqual((await readdir(library)).sort(), ['dependency', 'source.txt'])
  } finally { await fixture.close() }
})

test('映射必须等于旧配置且唯一，复制目标不能覆盖已有共享资料', async () => {
  const fixture = await legacyFixture()
  try {
    const library = join(fixture.root, 'library'), other = join(fixture.root, 'other')
    await mkdir(library); await mkdir(other)
    fixture.db.prepare('UPDATE projects SET source_path = ?').run(library)
    const invalid = await importLegacyData({ ...fixture, libraries: [{ projectId: 'p', sourcePath: other, mode: 'bind' }] })
    assert.equal(invalid.ready, false)
    assert.ok(invalid.issues.some(issue => issue.code === 'invalid_source_mapping'))
    const repeated = { projectId: 'p', sourcePath: library, mode: 'copy' as const }
    const duplicate = await importLegacyData({ ...fixture, libraries: [repeated, repeated] })
    assert.ok(duplicate.issues.some(issue => issue.code === 'duplicate_source_mapping'))
    await fixture.file('workspaces/p/shared/library/preserve.txt', '不能覆盖')
    const collision = await importLegacyData({ ...fixture, libraries: [repeated] })
    assert.ok(collision.issues.some(issue => issue.code === 'target_collision'))
    await assert.rejects(importLegacyData({ ...fixture, libraries: [repeated], dryRun: false }), MigrationBlockedError)
    await assert.rejects(stat(fixture.targetRoot), { code: 'ENOENT' })
  } finally { await fixture.close() }
})

test('延迟 ask_user 答复按调用身份配对，跨后续用户和模型事件仍保留原结果顺序来源', async () => {
  const fixture = await legacyFixture()
  try {
    fixture.event('model_step', { content: '需要澄清', toolCalls: [{ id: 'ask-delayed', name: 'ask_user', arguments: { question: '哪项资料' } }] })
    fixture.event('tool_call', { id: 'ask-delayed', name: 'ask_user', args: { question: '哪项资料' } })
    fixture.event('user', { content: '继续处理其他部分' })
    fixture.event('model_step', { content: '处理其他部分', toolCalls: [] })
    fixture.event('tool_result', { id: 'ask-delayed', providerCallId: 'ask-delayed', operationId: 'ask-delayed', name: 'ask_user', llmContent: '用户最终选择资料A' })
    const plan = await inspectLegacy(fixture)
    assert.equal(plan.report.ready, true)
    const message = plan.messages.get('task-a')!.find(message => message.content.parts.some(part => part.type === 'tool-invocation' && part.toolInvocation.toolCallId === 'ask-delayed'))!
    assert.match(JSON.stringify(message), /用户最终选择资料A/)
    assert.match(JSON.stringify(message.content.metadata?.legacyToolResults), /"seq":12/)
    assert.equal(plan.report.issues.filter(issue => issue.code.includes('tool_result')).length, 0)
  } finally { await fixture.close() }
})

test('只读扫描期间源持续变化时明确标记非一致快照，不发布目标', async () => {
  const fixture = await legacyFixture()
  let timer: NodeJS.Timeout | undefined
  let pending = Promise.resolve()
  try {
    await fixture.file('a-changing.txt', 'initial')
    await fixture.file('z-large.bin', Buffer.alloc(8 * 1024 * 1024, 1))
    let revision = 0
    timer = setInterval(() => {
      pending = pending.then(() => writeFile(join(fixture.sourceRoot, 'a-changing.txt'), String(++revision)))
    }, 1)
    const report = await importLegacyData(fixture)
    assert.equal(report.ready, false)
    assert.ok(report.issues.some(issue => issue.code === 'source_changed_during_inspection'))
    await assert.rejects(stat(fixture.targetRoot), { code: 'ENOENT' })
  } finally { clearInterval(timer); await pending; await fixture.close() }
})

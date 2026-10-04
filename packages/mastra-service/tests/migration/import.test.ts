/**
 * [INPUT]: 合成旧 WAL 数据根、离线导入器、真实 Mastra Memory 与项目目录
 * [OUTPUT]: 历史正文/空白/来源/文件保留、空目标原子发布、幂等与路径拒绝证据
 * [POS]: 全数据切换前的副本演练，不读写正式用户数据
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, readFile, readdir, stat, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { createCatalog } from '../../src/catalog/catalog.ts'
import { openSettingsStore } from '../../src/settings/store.ts'
import { fingerprint, scanSource } from '../../src/migration/files.ts'
import { importLegacyData, MigrationBlockedError } from '../../src/migration/importer.ts'
import { legacyFixture } from './fixture.ts'

test('离线导入保留真实历史和工具来源，完整封存原根并复制材料，重复运行不重复追加', async () => {
  const fixture = await legacyFixture()
  try {
    const originalText = '  研究问题\n<working_memory>原样保留的历史标记</working_memory>\n  '
    fixture.db.prepare("UPDATE task_events SET payload_json = json_set(payload_json, '$.content', ?) WHERE kind = 'user'").run(originalText)
    fixture.event('empty_action', { nudge: '旧运行时催促保留来源，不重新执行' })
    const before = await scanSource(fixture.sourceRoot)
    const dry = await importLegacyData(fixture)
    assert.equal(dry.dryRun, true)
    assert.equal(dry.ready, true)
    assert.equal(dry.counts.messages, 3)
    assert.equal(dry.tables.unknown_future_table, 1)
    assert.equal(dry.archivedEventKinds['worker:model_step'], 1)
    assert.equal(dry.archivedEventKinds.empty_action, 1)
    await assert.rejects(stat(fixture.targetRoot), { code: 'ENOENT' })
    assert.equal(fingerprint((await scanSource(fixture.sourceRoot)).files), fingerprint(before.files))
    await mkdir(fixture.targetRoot)
    const report = await importLegacyData({ ...fixture, dryRun: false })
    assert.equal(report.ready, true)
    assert.ok(!JSON.stringify(report).includes('synthetic-credential'))
    assert.equal(fingerprint((await scanSource(fixture.sourceRoot)).files), fingerprint(before.files))
    assert.equal(await readFile(join(fixture.targetRoot, 'projects/p/tasks/task-a/docs/a.md'), 'utf8'), '论文原文证据')
    assert.equal(await readFile(join(fixture.targetRoot, 'projects/p/shared/docs/common.md'), 'utf8'), '共享材料')
    assert.equal(await readFile(join(fixture.targetRoot, 'projects/p/memory/research.md'), 'utf8'), '项目长期记忆')
    assert.match(await readFile(join(fixture.targetRoot, 'projects/p/skills/review/SKILL.md'), 'utf8'), /审查论文/)
    assert.equal((await stat(join(fixture.targetRoot, 'skills/user-helper/run.sh'))).mode & 0o100, 0o100)
    const archive = join(fixture.targetRoot, 'archive/legacy-v1')
    assert.deepEqual(await readFile(join(archive, 'source/unknown.data')), await readFile(join(fixture.sourceRoot, 'unknown.data')))
    assert.equal((await stat(join(archive, 'source/lumen.sqlite'))).mode & 0o222, 0)
    assert.equal((await stat(archive)).mode & 0o222, 0)
    assert.match(await readFile(join(archive, 'events.jsonl'), 'utf8'), /fieldNotKnownToImporter/)
    const storage = new LibSQLStore({ id: 'verify-import', url: `file:${join(fixture.targetRoot, 'mastra.sqlite')}` })
    const memory = new Memory({ storage, options: { semanticRecall: false } })
    const catalog = createCatalog(fixture.targetRoot, memory)
    try {
      const session = await catalog.getSession('p', 'task-a')
      assert.equal(session.title, '旧论文研究')
      assert.equal(session.pinned, true)
      assert.equal(session.archived, true)
      assert.equal(session.createdAt, fixture.created)
      assert.equal(session.updatedAt, fixture.updated)
      assert.equal(session.unread, false)
      assert.equal(catalog.getProject('p').archived, true)
      assert.equal(catalog.getProject('p').createdAt, fixture.created)
      assert.equal(catalog.getProject('p').updatedAt, fixture.updated)
      const history = await memory.recall({ threadId: 'p:task-a', perPage: false })
      assert.equal(history.messages.length, 3)
      assert.equal(history.messages[0]?.content.parts.find(part => part.type === 'text')?.text, originalText)
      assert.match(JSON.stringify(history.messages), /论文原文证据/)
      assert.match(JSON.stringify(history.messages), /external_verification/)
      assert.match(JSON.stringify(history.messages), /保留来源字段/)
      assert.match(JSON.stringify(history.messages), /核对来源/)
      assert.match(JSON.stringify(history.messages), /旧运行时催促保留来源，不重新执行/)
      assert.match(JSON.stringify(history.messages), /data:image\/png;base64,AAAA/)
      assert.ok(!JSON.stringify(history.messages).includes('子代理私有推理'))
      assert.ok(!JSON.stringify(history.messages).includes('阅读投影不应重复导入'))
      assert.deepEqual(history.messages.map(message => message.role), ['user', 'assistant', 'assistant'])
    } finally { await catalog.close(); await storage.close() }
    const settings = await openSettingsStore({ dataRoot: fixture.targetRoot })
    assert.equal(settings.effective()?.apiKey, 'synthetic-credential')
    assert.equal(settings.toPublic().collectExecEvidence, false)
    await settings.close()
    await writeFile(join(fixture.targetRoot, 'new-work.txt'), '迁移后的新产物')
    const repeated = await importLegacyData({ ...fixture, dryRun: false })
    assert.equal(repeated.alreadyImported, true)
    assert.equal(await readFile(join(fixture.targetRoot, 'new-work.txt'), 'utf8'), '迁移后的新产物')
  } finally { await fixture.close() }
})

test('未结束任务、孤立工具和缺附件被列为阻塞，目标不发布且源根不变', async () => {
  const fixture = await legacyFixture()
  try {
    fixture.db.exec("UPDATE tasks SET status='running', active_turn_id='active-turn'")
    fixture.event('model_step', { content: '', toolCalls: [{ id: 'dangling', name: 'write_file', arguments: { path: 'unknown.md' } }] })
    fixture.event('user', { content: '缺材料', uploads: [{ name: 'lost.pdf', path: 'papers/lost.pdf' }] })
    const before = fingerprint((await scanSource(fixture.sourceRoot)).files)
    const report = await importLegacyData(fixture)
    assert.equal(report.ready, false)
    const codes = new Set(report.issues.map(issue => issue.code))
    assert.ok(codes.has('unfinished_task'))
    assert.ok(codes.has('missing_tool_result'))
    assert.ok(codes.has('missing_attachment'))
    await assert.rejects(importLegacyData({ ...fixture, dryRun: false }), MigrationBlockedError)
    await assert.rejects(stat(fixture.targetRoot), { code: 'ENOENT' })
    assert.equal(fingerprint((await scanSource(fixture.sourceRoot)).files), before)
  } finally { await fixture.close() }
})

test('拒绝重叠目标、非空目标和 symlink 逃逸，根外 library 不被擅自读取', async () => {
  const fixture = await legacyFixture()
  try {
    await assert.rejects(importLegacyData({ sourceRoot: fixture.sourceRoot, targetRoot: join(fixture.sourceRoot, 'new') }), /overlap/)
    await mkdir(fixture.targetRoot)
    await writeFile(join(fixture.targetRoot, 'keep.txt'), '不要覆盖')
    await assert.rejects(importLegacyData(fixture), /empty/)
    const secondTarget = join(fixture.root, 'second')
    await symlink('/etc', join(fixture.sourceRoot, 'escaped'))
    fixture.db.prepare('UPDATE projects SET source_path = ?').run('/outside/explicit-source/library')
    const report = await importLegacyData({ sourceRoot: fixture.sourceRoot, targetRoot: secondTarget })
    assert.equal(report.ready, false)
    assert.ok(report.issues.some(issue => issue.code === 'unsupported_file' && issue.path === 'escaped'))
    assert.ok(report.issues.some(issue => issue.code === 'external_library'))
    await assert.rejects(importLegacyData({ sourceRoot: fixture.sourceRoot, targetRoot: secondTarget, dryRun: false }), MigrationBlockedError)
    assert.deepEqual(await readdir(fixture.targetRoot), ['keep.txt'])
  } finally { await fixture.close() }
})

test('损坏 payload 和同 provider 调用 ID 的错误宿主配对不能伪装成完整历史', async () => {
  const fixture = await legacyFixture()
  try {
    fixture.db.prepare("UPDATE task_events SET payload_json = ? WHERE kind = 'tool_result'")
      .run(JSON.stringify({ id: 'provider-call', name: 'read_file', operationId: 'different-host-operation', llmContent: '不能误配给旧调用' }))
    fixture.event('user', { content: '下一问' })
    fixture.db.prepare("UPDATE task_events SET payload_json = '[]' WHERE id = ?").run('event-8')
    const report = await importLegacyData(fixture)
    assert.equal(report.ready, false)
    assert.ok(report.issues.some(issue => issue.code === 'orphan_tool_result'))
    assert.ok(report.issues.some(issue => issue.code === 'missing_tool_result'))
    assert.ok(report.issues.some(issue => issue.code === 'invalid_payload'))
    await assert.rejects(importLegacyData({ ...fixture, dryRun: false }), MigrationBlockedError)
  } finally { await fixture.close() }
})

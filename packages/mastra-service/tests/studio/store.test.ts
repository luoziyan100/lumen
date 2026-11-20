/**
 * [INPUT]: 真实临时数据根中的 catalog.sqlite 与 library/ 文件
 * [OUTPUT]: 主题/资料库/引用/白板存储行为证明：新主题自带白板且没有容量、去重与只读落盘、引用与进度、旧区块里的被引用数；画布本身见 canvas.test.ts
 * [POS]: studio 存储层回归；不经模型，直接调用存储接口，重开数据库验证持久化
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openStudio } from '../../src/studio/studio.ts'
import { StudioError } from '../../src/studio/errors.ts'
import { legacyBlock } from './canvas-fixtures.ts'


async function rejects(work: () => unknown, status: number, pattern: RegExp) {
  await assert.rejects(async () => work(), (error: unknown) => {
    assert.ok(error instanceof StudioError, String(error))
    assert.equal(error.status, status)
    assert.match(error.message, pattern)
    return true
  })
}

test('新主题自带一张进行中白板；改名、归档与重开后持久', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-studio-store-'))
  try {
    let studio = openStudio(root)
    const topic = studio.topics.create('AI 产业与技术扩散')
    const sheets = studio.board.sheets(topic.id)
    assert.equal(sheets.length, 1)
    assert.deepEqual([sheets[0]!.state, sheets[0]!.used, sheets[0]!.title], ['live', 0, 'AI 产业与技术扩散'])
    assert.ok(!('capacity' in sheets[0]!), '画布没有容量（R11，2026-11-19）')
    const second = studio.board.createSheet(topic.id)
    assert.equal(studio.board.writableSheet(topic.id).id, second.id, '最新开的一张是写入目标')
    studio.topics.update(topic.id, { archived: true })
    assert.deepEqual(studio.topics.list().map(item => item.id), [])
    studio.close()
    studio = openStudio(root)
    assert.equal(studio.topics.get(topic.id).archived, true)
    assert.equal(studio.board.sheets(topic.id).length, 2)
    await rejects(() => studio.topics.get('missing'), 404, /没有这个主题/)
    studio.close()
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('资料库按 sha256 去重，原件只读落盘；引用、取消引用与被引用数按主题记', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-studio-library-'))
  const studio = openStudio(root)
  try {
    const first = await studio.library.add({ name: '../../David 1990.pdf', bytes: Buffer.from('%PDF-1.4 dynamo'), addedBy: 'you' })
    assert.equal(first.created, true)
    assert.deepEqual([first.item.kind, first.item.mediaType, first.item.file, first.item.title], ['pdf', 'application/pdf', 'David 1990.pdf', 'David 1990'])
    const path = studio.library.path(first.item)
    assert.equal(path, join(root, 'library', first.item.id, 'David 1990.pdf'), '文件名清洗后不能逃出 library/<id>/')
    assert.equal((await stat(path)).mode & 0o777, 0o400)
    assert.equal(await readFile(path, 'utf8'), '%PDF-1.4 dynamo')
    const again = await studio.library.add({ name: 'copy.pdf', bytes: Buffer.from('%PDF-1.4 dynamo'), addedBy: 'ai' })
    assert.deepEqual([again.created, again.item.id, again.item.addedBy], [false, first.item.id, 'you'])
    const racing = await Promise.all([1, 2, 3].map(() => studio.library.add({ name: 'note.md', bytes: Buffer.from('# 同时到达'), addedBy: 'you' })))
    assert.equal(new Set(racing.map(result => result.item.id)).size, 1, '并发收入同一内容只留一份')
    assert.equal(racing.filter(result => result.created).length, 1)
    assert.equal(studio.library.list().length, 2)
    await rejects(() => studio.library.add({ name: 'empty.txt', bytes: new Uint8Array(), addedBy: 'you' }), 400, /空的/)

    const a = studio.topics.create('主题 A'), b = studio.topics.create('主题 B')
    assert.equal(studio.topics.reference(a.id, first.item.id), true)
    assert.equal(studio.topics.reference(a.id, first.item.id), false, '重复引用幂等')
    studio.topics.reference(b.id, first.item.id)
    studio.topics.setProgress(a.id, first.item.id, 0.6)
    studio.topics.setProgress(a.id, first.item.id, 0.2)
    legacyBlock(studio.db, studio.board.sheets(a.id)[0]!.id, { title: '引用原件', sources: [{ itemId: first.item.id, page: 3 }] })
    const [material] = studio.topics.materials(a.id)
    assert.deepEqual([material!.readProgress, material!.citedBy], [0.6, 1], '进度只前进；被引用数按旧数据里的当前区块计')
    assert.deepEqual([studio.topics.materials(b.id)[0]!.readProgress, studio.topics.materials(b.id)[0]!.citedBy], [0, 0], '同一原件，进度按主题分开')
    await rejects(() => studio.topics.reference(a.id, 'missing'), 404, /资料库里没有/)
  } finally { studio.close(); await rm(root, { recursive: true, force: true }) }
})

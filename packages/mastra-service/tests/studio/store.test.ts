/**
 * [INPUT]: 真实临时数据根中的 catalog.sqlite 与 library/ 文件
 * [OUTPUT]: 主题/资料库/引用/白板/区块/版本存储行为证明：去重、容量拒绝（R11）、rev 冲突、出处边界（R15）、取消引用不动区块（R10）、失败不留半块（R8）
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

const origin = (topicId: string, run = 'run-1') => ({ threadId: `${topicId}:task-1`, runId: run })
const note = (markdown: string) => ({ kind: 'text' as const, title: markdown.slice(0, 20), content: { markdown } })

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
    assert.deepEqual([sheets[0]!.state, sheets[0]!.capacity, sheets[0]!.used, sheets[0]!.title], ['live', 8, 0, 'AI 产业与技术扩散'])
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
    studio.board.draw(a.id, { ...note('引用原件'), sources: [{ itemId: first.item.id, page: 3 }] }, origin(a.id))
    const [material] = studio.topics.materials(a.id)
    assert.deepEqual([material!.readProgress, material!.citedBy], [0.6, 1], '进度只前进；被引用数按当前区块计')
    assert.deepEqual([studio.topics.materials(b.id)[0]!.readProgress, studio.topics.materials(b.id)[0]!.citedBy], [0, 0], '同一原件，进度按主题分开')
    await rejects(() => studio.topics.reference(a.id, 'missing'), 404, /资料库里没有/)
  } finally { studio.close(); await rm(root, { recursive: true, force: true }) }
})

test('区块画、改、取代：容量满拒绝（R11），rev 冲突拒绝，内容与种类必须匹配，失败不留半块（R8）', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-studio-board-'))
  const studio = openStudio(root)
  try {
    const topic = studio.topics.create('扩散为什么慢')
    const ladder = studio.board.draw(topic.id, { kind: 'ladder', title: '从直觉到原理', content: { rungs: [{ level: 1, text: '电来了，工厂没马上变快' }, { level: 2, text: '每台机器一个电机' }], here: 1, breakAt: 2 } }, origin(topic.id))
    assert.deepEqual([ladder.rev, ladder.used, ladder.capacity], [1, 1, 8])
    const table = studio.board.draw(topic.id, { kind: 'table', title: '电和 AI', content: { columns: ['', '电', 'AI'], rows: [['旧用法', '换大电机', '加聊天框']], guessCells: [[0, 2]] }, near: ladder.blockId }, origin(topic.id))
    const view = studio.board.view(ladder.sheetId)
    assert.deepEqual(view.blocks.map(block => block.kind), ['ladder', 'table'])
    assert.equal(view.blocks[1]!.x, view.blocks[0]!.x, 'near 落在同一列')
    assert.ok(view.blocks[1]!.y > view.blocks[0]!.y)
    assert.deepEqual([view.blocks[0]!.threadId, view.blocks[0]!.runId], [`${topic.id}:task-1`, 'run-1'])

    await rejects(() => studio.board.draw(topic.id, { kind: 'text', title: '错配', content: { rungs: [] } }, origin(topic.id)), 400, /「text」区块的内容不合格式/)
    await rejects(() => studio.board.draw(topic.id, { kind: 'ladder', title: '断点不存在', content: { rungs: [{ level: 1, text: 'a' }], here: 3 } }, origin(topic.id)), 400, /here 必须指向已有的一级/)
    await rejects(() => studio.board.draw(topic.id, { kind: 'widget', title: '太大', content: { html: 'x'.repeat(64 * 1024 + 1) } }, origin(topic.id)), 400, /超过 64KB/)

    const updated = studio.board.update(topic.id, { blockId: table.blockId, content: { columns: ['', '电', 'AI'], rows: [['旧用法', '换大电机', '加聊天框'], ['重排', '单层厂房', '?']] }, baseRev: 1 }, origin(topic.id, 'run-2'))
    assert.equal(updated.rev, 2)
    await rejects(() => studio.board.update(topic.id, { blockId: table.blockId, title: '基于旧版', baseRev: 1 }, origin(topic.id)), 409, /现在是第 2 版，你基于第 1 版/)
    await rejects(() => studio.board.update(topic.id, { blockId: table.blockId, content: { markdown: '换种类' }, baseRev: 2 }, origin(topic.id)), 400, /「table」区块的内容不合格式/)

    for (let index = 3; index <= 8; index++) studio.board.draw(topic.id, note(`第 ${index} 块`), origin(topic.id))
    const before = studio.board.view(ladder.sheetId).blocks.length
    await rejects(() => studio.board.draw(topic.id, note('第 9 块'), origin(topic.id)), 409, /这张白板满了（8\/8）/)
    assert.equal(studio.board.view(ladder.sheetId).blocks.length, before, '拒绝后没有半块落库')
    assert.equal(studio.board.sheets(topic.id).length, 1, '满了不自动开新白板')

    const replacement = studio.board.view(ladder.sheetId).blocks.at(-1)!
    studio.board.supersede(topic.id, { blockId: ladder.blockId, by: replacement.id }, origin(topic.id))
    const superseded = studio.board.view(ladder.sheetId).blocks.find(block => block.id === ladder.blockId)!
    assert.deepEqual([superseded.state, superseded.supersededBy, superseded.rev], ['superseded', replacement.id, 2], '取代不删，只标灰')
    assert.equal(studio.board.sheet(ladder.sheetId).used, 7, '已取代的不占容量')
    await rejects(() => studio.board.update(topic.id, { blockId: ladder.blockId, title: '改旧块', baseRev: 2 }, origin(topic.id)), 409, /已经不是当前区块/)
    studio.board.draw(topic.id, note('腾出位置后再画'), origin(topic.id))

    const other = studio.topics.create('另一个主题')
    await rejects(() => studio.board.update(other.id, { blockId: table.blockId, title: '跨主题', baseRev: 2 }, origin(other.id)), 404, /这个主题的白板上没有区块/)
  } finally { studio.close(); await rm(root, { recursive: true, force: true }) }
})

test('出处只能指向本主题引用的材料或本主题的对话（R15）；取消引用不改区块（R10）', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-studio-sources-'))
  const studio = openStudio(root)
  try {
    const topic = studio.topics.create('出处'), other = studio.topics.create('别的主题')
    const { item } = await studio.library.add({ name: 'paper.pdf', bytes: Buffer.from('%PDF-1.7 sources'), addedBy: 'you' })
    studio.topics.reference(other.id, item.id)
    await rejects(() => studio.board.draw(topic.id, { ...note('未引用的材料'), sources: [{ itemId: item.id, page: 2 }] }, origin(topic.id)), 400, /不在这个主题的引用清单里/)
    await rejects(() => studio.board.draw(topic.id, { ...note('别处的对话'), sources: [{ threadId: `${other.id}:t` }] }, origin(topic.id)), 400, /不属于这个主题/)
    await rejects(() => studio.board.draw(topic.id, { ...note('坏格式'), sources: [{ itemId: item.id, page: 0 }] }, origin(topic.id)), 400, /出处格式不对/)
    studio.topics.reference(topic.id, item.id)
    const drawn = studio.board.draw(topic.id, { ...note('有出处'), sources: [{ itemId: item.id, page: 2, quote: '生产率滞后' }, { threadId: `${topic.id}:t` }] }, origin(topic.id))
    const inferred = studio.board.draw(topic.id, note('AI 推断'), origin(topic.id))
    assert.equal(studio.topics.unreference(topic.id, item.id), true)
    const blocks = studio.board.view(drawn.sheetId).blocks
    assert.deepEqual(blocks.find(block => block.id === drawn.blockId)!.sources, [{ itemId: item.id, page: 2, quote: '生产率滞后' }, { threadId: `${topic.id}:t` }], '取消引用后区块与出处原样保留')
    assert.deepEqual(blocks.find(block => block.id === inferred.blockId)!.sources, [], '无出处存为空数组，前端显示「AI 推断」')
    assert.equal(studio.library.get(item.id).id, item.id, '取消引用不删原件')
  } finally { studio.close(); await rm(root, { recursive: true, force: true }) }
})

test('版本按运行收集改过的白板，快照完整且不随后续修改变化（R7）', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-studio-versions-'))
  const studio = openStudio(root)
  try {
    const topic = studio.topics.create('版本')
    const first = studio.board.draw(topic.id, note('第一轮'), origin(topic.id, 'run-a'))
    studio.board.draw(topic.id, note('第一轮第二块'), origin(topic.id, 'run-a'))
    assert.deepEqual(studio.board.changedSheets('run-a'), [first.sheetId])
    assert.deepEqual(studio.board.changedSheets('run-unrelated'), [])
    const v1 = studio.board.writeVersion(first.sheetId, origin(topic.id, 'run-a'))
    studio.board.update(topic.id, { blockId: first.blockId, content: { markdown: '第二轮改写' }, baseRev: 1 }, origin(topic.id, 'run-b'))
    const v2 = studio.board.writeVersion(first.sheetId, origin(topic.id, 'run-b'))
    const stored = studio.board.versions(first.sheetId)
    assert.deepEqual(stored.map(version => [version.version, version.runId]), [[1, 'run-a'], [2, 'run-b']])
    assert.deepEqual(stored[0]!.snapshot, v1.snapshot)
    assert.deepEqual((stored[0]!.snapshot.blocks[0]!.content as { markdown: string }).markdown, '第一轮')
    assert.deepEqual((v2.snapshot.blocks[0]!.content as { markdown: string }).markdown, '第二轮改写')
  } finally { studio.close(); await rm(root, { recursive: true, force: true }) }
})

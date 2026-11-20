/**
 * [INPUT]: a real catalog.sqlite in a temporary data root; the canvas fixtures standing in for the app
 * [OUTPUT]: CanvasStore behaviour: the user's save merges by id (higher version wins, the service records the author, a newer save may undo its own delete),
 *           AI draws queue as ops with checked ids/bindings/frames/files, the commit tags AI elements and only lets the user's elements gain bindings, R5 erase
 *           (the user's text refused whole, strokes recycled and restorable, the AI's own deleted with labels), no AI path revives a tombstone, R7 snapshots
 *           (one per changed run, autosaves alone none), viewport, glance freshness, R17 sheet delete and L1 topic delete leave no canvas rows,
 *           and interleaved user saves with AI commits lose nothing
 * [POS]: studio canvas storage regression; no model, the store's interface directly, data reopened where persistence matters
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openStudio } from '../../src/studio/studio.ts'
import { StudioError } from '../../src/studio/errors.ts'
import { element, layOut, png } from './canvas-fixtures.ts'

const run = (id = 'run-1') => ({ threadId: 'topic:task', runId: id })
const code = (work: () => unknown, expected: string) => assert.throws(work, (error: unknown) => error instanceof StudioError && error.code === expected)

async function withStudio(work: (studio: ReturnType<typeof openStudio>, sheetId: string, root: string) => Promise<void> | void) {
  const root = await mkdtemp(join(tmpdir(), 'lumen-canvas-'))
  const studio = openStudio(root)
  try {
    const topic = studio.topics.create('画布')
    await work(studio, studio.board.sheets(topic.id)[0]!.id, root)
  } finally { studio.close(); await rm(root, { recursive: true, force: true }) }
}

test('用户保存按元素合并：版本高的为准，旧版本被退回，作者由服务记；更新的保存可以撤回自己的删除', () => withStudio((studio, sheetId) => {
  const canvas = studio.board.canvas
  assert.deepEqual(canvas.save(sheetId, [element('u1'), element('u2', 'text', { text: '我的字' })]), { saved: 2, kept: [] })
  const stale = canvas.save(sheetId, [element('u1', 'rectangle', { version: 1, x: 999 })])
  assert.equal(stale.saved, 0)
  assert.equal(stale.kept[0]!.x, 0, '同版本不覆盖，返回服务端的那份')
  canvas.save(sheetId, [element('u1', 'rectangle', { version: 2, x: 50 })])
  assert.equal(canvas.liveElements(sheetId).find(row => row.element.id === 'u1')!.element.x, 50)
  canvas.save(sheetId, [element('u1', 'rectangle', { version: 3, isDeleted: true })])
  assert.equal(canvas.liveElements(sheetId).length, 1)
  canvas.save(sheetId, [element('u1', 'rectangle', { version: 4, isDeleted: false })])
  assert.deepEqual(canvas.liveElements(sheetId).map(row => [row.element.id, row.author]), [['u1', 'you'], ['u2', 'you']], '用户自己的撤销（更高版本）把它带回来')
  code(() => canvas.save(sheetId, [{ id: 'x', type: 'rectangle' }]), 'board.element_invalid')
  code(() => canvas.save(sheetId, [element('../bad')]), 'board.element_invalid')
  assert.equal(studio.board.sheet(sheetId).used, 2)
}))

test('AI 画先排队：id 由系统补，重复、复用墓碑、连到线上、框住用户的元素、引用不存在的图片都拒绝', () => withStudio((studio, sheetId) => {
  const canvas = studio.board.canvas
  canvas.save(sheetId, [element('mine'), element('myline', 'line'), element('gone', 'rectangle', { isDeleted: true })])
  const op = canvas.queueDraw(sheetId, '两个框', [{ type: 'rectangle', x: 0, y: 0, label: { text: '原因' } }, { type: 'arrow', id: 'link', x: 0, y: 0, start: { id: 'mine' } }], run())
  assert.equal(op.ids.length, 2)
  assert.match(op.ids[0]!, /^a[0-9a-f]{8}$/)
  assert.deepEqual(canvas.ops(sheetId).map(item => item.id), [op.id])
  code(() => canvas.queueDraw(sheetId, '重复', [{ type: 'text', id: 'dup', x: 0, y: 0, text: 'a' }, { type: 'text', id: 'dup', x: 0, y: 0, text: 'b' }], run()), 'board.element_exists')
  code(() => canvas.queueDraw(sheetId, '复用', [{ type: 'text', id: 'gone', x: 0, y: 0, text: 'a' }], run()), 'board.element_exists')
  code(() => canvas.queueDraw(sheetId, '排队中', [{ type: 'text', id: 'link', x: 0, y: 0, text: 'a' }], run()), 'board.element_exists')
  code(() => canvas.queueDraw(sheetId, '连线', [{ type: 'arrow', x: 0, y: 0, end: { id: 'myline' } }], run()), 'board.element_invalid')
  code(() => canvas.queueDraw(sheetId, '没有', [{ type: 'arrow', x: 0, y: 0, end: { id: 'nowhere' } }], run()), 'board.element_missing')
  code(() => canvas.queueDraw(sheetId, '框', [{ type: 'frame', x: 0, y: 0, children: ['mine'] }], run()), 'board.not_yours')
  code(() => canvas.queueDraw(sheetId, '图', [{ type: 'image', x: 0, y: 0, fileId: 'nofile' }], run()), 'board.file_missing')
  assert.equal(canvas.ops(sheetId).length, 1, '拒绝的一笔不留排队')
}))

test('提交：新元素记为 AI 并打 customData.author，用户的元素只多出绑定，第二次提交拒绝；AI 改不了用户的元素', () => withStudio((studio, sheetId) => {
  const canvas = studio.board.canvas
  canvas.save(sheetId, [element('mine', 'rectangle', { boundElements: null }), element('words', 'text', { text: '用户的字' })])
  const op = canvas.queueDraw(sheetId, '连过来', [{ type: 'ellipse', id: 'ai1', x: 0, y: 0, label: { text: '想法' } }, { type: 'arrow', id: 'ai2', x: 0, y: 0, start: { id: 'ai1' }, end: { id: 'mine' } }], run())
  const laid = layOut(op)
  // The app's binding on the user's shape, plus an attempt to change its geometry that must not stick
  laid.push(element('mine', 'rectangle', { version: 2, x: 777, boundElements: [{ id: 'ai2', type: 'arrow' }] }), element('words', 'text', { version: 2, text: '被改' }))
  assert.equal(canvas.commit(sheetId, op.id, laid).committed, 4)
  const rows = new Map(canvas.liveElements(sheetId).map(row => [row.element.id, row]))
  assert.deepEqual(['ai1', 'ai1-label', 'ai2'].map(id => [rows.get(id)!.author, rows.get(id)!.element.customData?.author]), [['ai', 'ai'], ['ai', 'ai'], ['ai', 'ai']])
  assert.deepEqual([rows.get('mine')!.author, rows.get('mine')!.element.x, rows.get('mine')!.element.boundElements], ['you', 0, [{ id: 'ai2', type: 'arrow' }]])
  assert.equal(rows.get('words')!.element.text, '用户的字')
  assert.equal(canvas.ops(sheetId).length, 0)
  code(() => canvas.commit(sheetId, op.id, laid), 'board.op_done')

  code(() => canvas.queueUpdate(sheetId, '改用户的', [{ id: 'mine', x: 5 }], run()), 'board.not_yours')
  code(() => canvas.queueUpdate(sheetId, '改字', [{ id: 'ai1', text: '新' }], run()), 'board.element_invalid')
  const update = canvas.queueUpdate(sheetId, '挪一下', [{ id: 'ai1', x: 40 }, { id: 'ai1-label', text: '新想法' }], run('run-2'))
  canvas.commit(sheetId, update.id, [{ ...rows.get('ai1')!.element, version: 2, x: 40 }, { ...rows.get('ai1-label')!.element, version: 2, text: '新想法' }])
  assert.equal(canvas.liveElements(sheetId).find(row => row.element.id === 'ai1-label')!.element.text, '新想法')
}))

test('擦除（R5）：用户的字一律拒绝且一笔不擦；用户的线条进回收可一键恢复；AI 自己的连同标签删掉；墓碑不被 AI 复活', () => withStudio((studio, sheetId) => {
  const canvas = studio.board.canvas
  canvas.save(sheetId, [element('stroke', 'freedraw'), element('note', 'text', { text: '用户的字' }), element('box', 'rectangle', { boundElements: [{ id: 'boxlabel', type: 'text' }] }),
    element('boxlabel', 'text', { text: '框里的字', containerId: 'box' }), element('plain')])
  const op = canvas.queueDraw(sheetId, 'AI 的框', [{ type: 'rectangle', id: 'aibox', x: 0, y: 0, label: { text: '临时' } }], run())
  canvas.commit(sheetId, op.id, layOut(op))

  code(() => canvas.erase(sheetId, ['stroke', 'note'], '误触', run()), 'board.user_text')
  code(() => canvas.erase(sheetId, ['box'], '画废', run()), 'board.user_text')
  assert.equal(canvas.liveElements(sheetId).length, 7, '拒绝时一笔都没擦')

  const erased = canvas.erase(sheetId, ['stroke', 'plain', 'aibox'], '画废的两笔和我的临时框', run())
  assert.deepEqual([erased.recycled.sort(), erased.removed.sort()], [['plain', 'stroke'], ['aibox', 'aibox-label']])
  assert.deepEqual(canvas.erasures(sheetId).map(item => [item.elementIds.sort(), item.reason]), [[['plain', 'stroke'], '画废的两笔和我的临时框']])
  assert.deepEqual(canvas.liveElements(sheetId).map(row => row.element.id).sort(), ['box', 'boxlabel', 'note'])

  // AI writes never bring a tombstone back
  const redo = canvas.queueUpdate.bind(canvas)
  code(() => redo(sheetId, '复活', [{ id: 'aibox', x: 1 }], run()), 'board.element_missing')
  code(() => canvas.queueDraw(sheetId, '复活', [{ type: 'rectangle', id: 'aibox', x: 0, y: 0 }], run()), 'board.element_exists')

  assert.equal(canvas.restore(sheetId).restored, 2)
  assert.deepEqual(canvas.liveElements(sheetId).map(row => row.element.id).sort(), ['box', 'boxlabel', 'note', 'plain', 'stroke'])
  assert.equal(canvas.erasures(sheetId).length, 0)
  assert.ok(canvas.liveElements(sheetId).find(row => row.element.id === 'stroke')!.element.version > 2, '恢复是更高的版本，前端合并得到')

  canvas.erase(sheetId, ['plain'], '又画废了', run())
  canvas.dismiss(sheetId)
  assert.equal(canvas.erasures(sheetId).length, 0)
  assert.ok(!canvas.liveElements(sheetId).some(row => row.element.id === 'plain'), '「知道了」只收起提示，笔画仍删着')
}))

test('R7：一轮结束场景变了才留快照；用户自动保存本身不进版本；pendingSheets 带上本轮目标', () => withStudio((studio, sheetId) => {
  const canvas = studio.board.canvas, thread = 'topic:task'
  assert.equal(studio.board.writeVersion(sheetId, run()), null, '空白板不留版本')
  canvas.save(sheetId, [element('u1')])
  assert.equal(canvas.snapshots(sheetId).length, 0, '自动保存不是版本')
  assert.equal(canvas.changed(sheetId), true)
  const op = canvas.queueDraw(sheetId, '一笔', [{ type: 'text', id: 't1', x: 0, y: 0, text: '一' }], run('run-a'))
  assert.deepEqual(canvas.changedBy(thread), [sheetId])
  const first = studio.board.writeVersion(sheetId, run('run-a'))
  assert.equal(first!.version, 1)
  assert.deepEqual(canvas.snapshots(sheetId)[0]!.ops.map(item => item.id), [op.id], '还没落笔的一笔随快照记下')
  canvas.commit(sheetId, op.id, layOut(op))
  assert.equal(studio.board.writeVersion(sheetId, run('run-b'))!.version, 2)
  assert.equal(studio.board.writeVersion(sheetId, run('run-c')), null, '没变就不留')
  assert.equal(canvas.changed(sheetId), false)
  assert.deepEqual(canvas.snapshots(sheetId).map(item => [item.version, item.runId, item.elements.map(row => row.element.id)]), [[1, 'run-a', ['u1']], [2, 'run-b', ['u1', 't1']]])
  assert.deepEqual(canvas.changedBy(thread), [], '快照之后这段对话没有新改动')
}))

test('视口每张一行覆盖写；glance 只在没有待落笔且场景版本追上时算最新', () => withStudio((studio, sheetId) => {
  const canvas = studio.board.canvas
  assert.equal(canvas.viewport(sheetId), null)
  canvas.setViewport(sheetId, { x: 1, y: 2, width: 300, height: 200 })
  canvas.setViewport(sheetId, { x: 10, y: 20, width: 800, height: 600 })
  assert.deepEqual(canvas.viewport(sheetId), { x: 10, y: 20, width: 800, height: 600 })
  assert.equal(Number(studio.db.prepare('SELECT COUNT(*) AS n FROM canvas_viewports').get()!.n), 1)

  canvas.save(sheetId, [element('u1', 'rectangle', { version: 3 })])
  assert.equal(canvas.sceneVersion(sheetId), 3)
  assert.equal(canvas.glanceCurrent(sheetId), false)
  canvas.setGlance(sheetId, 3, png())
  assert.equal(canvas.glanceCurrent(sheetId), true)
  const op = canvas.queueDraw(sheetId, '一笔', [{ type: 'text', id: 't1', x: 0, y: 0, text: '一' }], run())
  assert.equal(canvas.glanceCurrent(sheetId), false, '有一笔还没落')
  canvas.commit(sheetId, op.id, layOut(op))
  assert.equal(canvas.glanceCurrent(sheetId), false, '画面还停在旧场景')
  canvas.setGlance(sheetId, 4, png())
  assert.deepEqual([canvas.glanceCurrent(sheetId), canvas.glance(sheetId)!.width], [true, 1])
  code(() => canvas.setGlance(sheetId, 5, new Uint8Array([1, 2, 3])), 'board.element_invalid')
}))

test('删白板（R17）与删主题（L1，经删除日志）都不留画布的任何一行', () => withStudio((studio, sheetId) => {
  const canvas = studio.board.canvas, topicId = studio.board.sheet(sheetId).topicId
  const fill = (id: string) => {
    canvas.save(id, [element(`${id}-u`, 'freedraw')], [{ id: 'f1', mimeType: 'image/png', dataURL: `data:image/png;base64,${Buffer.from(png()).toString('base64')}` }])
    canvas.queueDraw(id, '一笔', [{ type: 'text', id: `${id}-t`, x: 0, y: 0, text: '一' }], run())
    canvas.erase(id, [`${id}-u`], '误触', run())
    canvas.setViewport(id, { x: 0, y: 0, width: 10, height: 10 })
    canvas.setGlance(id, 1, png())
    studio.board.writeVersion(id, run())
  }
  const tables = ['canvas_elements', 'canvas_files', 'canvas_ops', 'canvas_erasures', 'canvas_snapshots', 'canvas_viewports', 'canvas_glances']
  const rows = (id?: string) => tables.reduce((n, table) => n + Number(studio.db.prepare(`SELECT COUNT(*) AS n FROM ${table}${id ? ' WHERE sheet_id = ?' : ''}`).get(...(id ? [id] : []))!.n), 0)
  fill(sheetId)
  const second = studio.board.createSheet(topicId)
  fill(second.id)
  assert.equal(rows(sheetId), 7)
  code(() => studio.board.deleteSheet(topicId, sheetId, { confirmed: false, busy: new Set(), since: new Date().toISOString() }), 'board.confirm_delete')
  studio.board.deleteSheet(topicId, sheetId, { confirmed: true, busy: new Set(), since: new Date().toISOString() })
  assert.equal(rows(sheetId), 0)
  assert.equal(rows(second.id), 7)
  studio.deletions.mark(topicId)
  studio.deletions.finishTopic(topicId)
  assert.equal(rows(), 0, '删主题顺着外键带走所有画布行')
}))

test('交错写：用户保存与 AI 提交交替发生，两边的笔画都在', () => withStudio((studio, sheetId) => {
  const canvas = studio.board.canvas
  const expected = new Set<string>()
  for (let round = 0; round < 6; round++) {
    const op = canvas.queueDraw(sheetId, `第 ${round} 笔`, [{ type: 'ellipse', id: `ai${round}`, x: round * 10, y: 0 }], run(`run-${round}`))
    // The user keeps drawing while the app lays the AI's stroke out
    canvas.save(sheetId, [element(`you${round}`, 'freedraw'), ...(round ? [element(`you${round - 1}`, 'freedraw', { version: 2, x: round })] : [])])
    canvas.commit(sheetId, op.id, layOut(op))
    expected.add(`ai${round}`).add(`you${round}`)
  }
  assert.deepEqual(new Set(canvas.liveElements(sheetId).map(row => row.element.id)), expected)
  assert.equal(canvas.liveElements(sheetId).find(row => row.element.id === 'you4')!.element.x, 5, '用户后来的修改也在')
}))

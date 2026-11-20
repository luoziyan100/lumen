/**
 * [INPUT]: canvas-sync.ts with the real @excalidraw/excalidraw (helpers/excalidraw-env); a real HTTP service and catalog for the interleaved round trip
 * [OUTPUT]: the app side of the co-drawn canvas: the ledger sends only what the service lacks (tombstones too); merging the service's elements keeps the user's
 *           unsaved strokes and newer edits, and `kept` copies replace ours; an AI draw lays out with its stored ids, an arrow to the user's shape binds through
 *           a copy and only adds itself to that shape's bound list; an update re-measures text and skips erased elements; interleaved user saves and AI commits
 *           through the real routes lose nothing on either side, and the service records the AI's strokes as the AI's
 * [POS]: the frontend reconcile evidence Q3 asks for; the store-level interleaving lives in mastra-service/tests/studio/canvas.test.ts
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { JSDOM } from 'jsdom'
import { serve } from '@hono/node-server'
import { createHttpService } from '../../mastra-service/src/server.ts'
import { fixtureProvider, textReply } from '../../mastra-service/tests/provider-fixture.ts'
import { ensureTopic } from '../../mastra-service/tests/topic-fixture.ts'
import { LumenApi, type CanvasElement } from '../src/mastra/data/client.ts'
import { loadExcalidraw } from './helpers/excalidraw-env.ts'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
for (const name of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'DocumentFragment', 'MutationObserver', 'getComputedStyle', 'navigator']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name as keyof typeof dom.window] })
}
const X = await loadExcalidraw()
const { Ledger, layOutOp, mergeRemote, sceneVersion, viewportOf } = await import('../src/mastra/studio/canvas-sync.ts')
type Element = ReturnType<typeof X.convertToExcalidrawElements>[number]

/** A user's stroke as Excalidraw makes it */
const stroke = (id: string, x = 0, type: 'rectangle' | 'ellipse' = 'rectangle') => X.convertToExcalidrawElements([{ type, id, x, y: 0, width: 80, height: 40 }], { regenerateIds: false })[0]!
const words = (id: string, text: string) => X.convertToExcalidrawElements([{ type: 'text', id, x: 0, y: 100, text }], { regenerateIds: false })[0]!
const appState = () => X.restoreAppState(null, null) as never
const op = (kind: 'draw' | 'update', items: unknown[]) => ({ id: 'op1', kind, title: 't', skeletons: kind === 'draw' ? items : [], patches: kind === 'update' ? items : [], ids: [], threadId: null, runId: null, createdAt: '' })
const ids = (elements: readonly { id: string; isDeleted?: boolean }[]) => elements.filter(element => !element.isDeleted).map(element => element.id).sort()

test('Ledger：只发服务端没有的版本，删除（墓碑）也算一次保存', () => {
  const ledger = new Ledger(), a = stroke('a'), b = stroke('b')
  assert.deepEqual(ledger.unsent([a, b]).map(element => element.id), ['a', 'b'])
  ledger.remember([a, b])
  assert.deepEqual(ledger.unsent([a, b]), [])
  const moved = X.newElementWith(a, { x: 30 }), gone = X.newElementWith(b, { isDeleted: true })
  assert.deepEqual(ledger.unsent([moved, gone]).map(element => element.id), ['a', 'b'])
  ledger.remember([{ id: 'a', version: 1 }])
  assert.equal(ledger.unsent([moved]).length, 1, '记住更旧的版本不会把新的当成已存')
})

test('合并服务端元素：用户没存的笔画和更新的改动留着，服务端更高版本进来，kept 照服务端的覆盖', () => {
  const mine = stroke('mine'), edited = X.newElementWith(stroke('both'), { x: 99 })
  const remote = [{ ...stroke('ai1', 200, 'ellipse'), customData: { author: 'ai' } }, stroke('both'), X.newElementWith(X.newElementWith(stroke('old'), { x: 5 }), { x: 6 })] as unknown as CanvasElement[]
  const merged = mergeRemote([mine, edited, stroke('old')] as never, remote, appState())
  assert.deepEqual(ids(merged), ['ai1', 'both', 'mine', 'old'])
  const byId = new Map(merged.map(element => [element.id, element]))
  assert.equal(byId.get('both')!.x, 99, '本地更高版本的改动不被服务端旧版本盖掉')
  assert.equal(byId.get('old')!.x, 6, '服务端更高版本进来')
  assert.equal((byId.get('ai1')!.customData as { author?: string }).author, 'ai')
  const kept = { ...edited, x: 1 } as unknown as CanvasElement
  assert.equal(mergeRemote(merged, [], appState(), [kept]).find(element => element.id === 'both')!.x, 1, '同版本服务端留下的那份照用')
})

test('AI 画：保留存好的 id，箭头连到用户的框靠同批副本绑定，用户的框只多出这条箭头', () => {
  const box = stroke('box'), note = words('note', '用户的字')
  const laid = layOutOp(op('draw', [
    { type: 'ellipse', id: 'ai1', x: 300, y: 0, width: 120, height: 60, label: { text: '原因' } },
    { type: 'arrow', id: 'ai2', x: 0, y: 0, start: { id: 'ai1' }, end: { id: 'box' } },
  ]) as never, [box, note])
  const byId = new Map(laid.map(element => [element.id, element]))
  assert.ok(byId.has('ai1') && byId.has('ai2'))
  const label = laid.find(element => element.type === 'text' && element.containerId === 'ai1')
  assert.ok(label, '形状的标签是绑定的文字元素')
  const arrow = byId.get('ai2') as Element & { startBinding: { elementId: string } | null; endBinding: { elementId: string } | null }
  assert.deepEqual([arrow.startBinding?.elementId, arrow.endBinding?.elementId], ['ai1', 'box'])
  const touched = byId.get('box')!
  assert.deepEqual(touched.boundElements, [{ id: 'ai2', type: 'arrow' }])
  assert.equal(touched.version, box.version + 1)
  assert.deepEqual([touched.x, touched.width], [box.x, box.width], '用户的框只多出绑定')
  assert.equal(laid.filter(element => element.id === 'box').length, 1, '副本不进提交')
  assert.ok(!byId.has('note'), '没牵涉的用户元素不进提交')
})

test('AI 改：只改它点名的元素，文字重新量宽；已经擦掉的不复活', () => {
  const [shape, label] = X.convertToExcalidrawElements([{ type: 'rectangle', id: 'ai1', x: 0, y: 0, width: 200, height: 80, label: { text: '短' } }], { regenerateIds: false })
  const gone = X.newElementWith(stroke('ai2'), { isDeleted: true })
  const laid = layOutOp(op('update', [{ id: label!.id, text: '长了很多的一句话' }, { id: 'ai1', x: 40 }, { id: 'ai2', x: 5 }]) as never, [shape!, label!, gone])
  assert.deepEqual(laid.map(element => element.id).sort(), ['ai1', label!.id].sort())
  const text = laid.find(element => element.id === label!.id) as Element & { text: string; originalText: string }
  assert.deepEqual([text.text, text.originalText], ['长了很多的一句话', '长了很多的一句话'])
  assert.ok(text.width > label!.width, '新字更宽')
  assert.equal(laid.find(element => element.id === 'ai1')!.x, 40)
})

test('视口与场景版本：屏幕上的场景矩形；场景版本是全部版本之和（含墓碑），和服务端同一算法', () => {
  assert.deepEqual(viewportOf({ scrollX: -100, scrollY: 50, zoom: { value: 2 as never }, width: 800, height: 600 }), { x: 100, y: -50, width: 400, height: 300 })
  const a = stroke('a'), b = X.newElementWith(stroke('b'), { isDeleted: true })
  assert.equal(sceneVersion([a, b]), a.version + b.version)
})

test('交错写（经真实路由）：用户保存与 AI 提交交替发生，两边的笔画都在，AI 的记为 AI', async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-canvas-sync-')), token = 'canvas-sync-token-at-least-24-characters'
  const fixture = fixtureProvider(() => textReply('好'))
  const http = await createHttpService({ dataRoot, token, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  const server = serve({ hostname: '127.0.0.1', port: 0, fetch: http.app.fetch })
  try {
    if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve))
    const address = server.address(); assert.ok(address && typeof address !== 'string')
    const api = new LumenApi({ baseUrl: `http://127.0.0.1:${address.port}`, token }), studio = http.application.studio
    ensureTopic(http, 'p', '交错')
    const sheetId = studio.board.sheets('p')[0]!.id
    // ---- The app's state: the scene the user sees and the ledger of what the service has ----
    let scene: Element[] = [], etag: string | null = null
    const ledger = new Ledger()
    const save = async () => {
      const batch = ledger.unsent(scene)
      if (!batch.length) return
      const result = await api.saveCanvas(sheetId, batch)
      ledger.remember(batch)
      if (result.kept.length) scene = mergeRemote(scene as never, [], appState(), result.kept) as never
    }
    // What BoardCanvas does on each read: merge, then lay out and commit each op before it enters the scene
    const read = async () => {
      const { scene: remote, etag: next } = await api.canvas(sheetId, etag)
      etag = next
      if (!remote) return
      scene = mergeRemote(scene as never, remote.elements, appState()) as never
      ledger.remember(remote.elements)
      for (const pending of remote.ops) {
        const laid = layOutOp(pending, scene).map(element => ({ ...element, customData: { ...element.customData, author: 'ai' } }))
        await api.commitOp(sheetId, pending.id, laid)
        scene = mergeRemote(scene as never, laid as never, appState()) as never
        ledger.remember(laid)
      }
    }
    for (let round = 0; round < 5; round++) {
      scene = [...scene, stroke(`you${round}`, round * 10)]
      await save()
      // The AI queues a draw (as board_draw does) while the user keeps drawing, unsaved
      studio.board.canvas.queueDraw(sheetId, `第 ${round} 笔`, [{ type: 'ellipse', id: `ai${round}`, x: round * 10, y: 200, label: { text: `想法 ${round}` } },
        ...(round ? [{ type: 'arrow' as const, id: `link${round}`, x: 0, y: 0, start: { id: `ai${round}` }, end: { id: `you${round - 1}` } }] : [])], { threadId: 'p:a', runId: `run-${round}` })
      scene = scene.map(element => element.id === `you${round}` ? X.newElementWith(element, { x: 500 + round }) : element)
      await read()
      await save()
      if (process.env.DEBUG_SYNC) console.log(round, studio.board.canvas.liveElements(sheetId).filter(row => row.author === 'you').map(row => `${row.element.id}@${row.element.version}x${row.element.x}`).join(' '), '| local', scene.filter(e => e.id.startsWith('you')).map(e => `${e.id}@${e.version}x${e.x}`).join(' '))
    }
    const stored = new Map(studio.board.canvas.liveElements(sheetId).map(row => [row.element.id, row]))
    for (let round = 0; round < 5; round++) {
      assert.equal(stored.get(`you${round}`)!.author, 'you')
      assert.equal(stored.get(`you${round}`)!.element.x, 500 + round, `用户第 ${round} 笔读回之前的改动没有丢`)
      assert.equal(stored.get(`ai${round}`)!.author, 'ai', `AI 第 ${round} 笔记为 AI`)
      assert.ok(scene.some(element => element.id === `ai${round}`), `AI 第 ${round} 笔在用户的画面里`)
    }
    assert.deepEqual(stored.get('you3')!.element.boundElements, [{ id: 'link4', type: 'arrow' }], 'AI 的箭头挂在用户的框上')
    assert.equal(studio.board.canvas.ops(sheetId).length, 0, '每一笔都落了')
    assert.deepEqual(ids(scene), ids([...stored.values()].map(row => row.element)), '画面与服务端一致')
  } finally { server.close(); await http.close(); await rm(dataRoot, { recursive: true, force: true }) }
})

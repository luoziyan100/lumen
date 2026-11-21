/**
 * [INPUT]: the real HTTP service and Controller tool loop, catalog.sqlite, a deterministic model network, a paged PDF fixture, permissions' toolCategory
 * [OUTPUT]: evidence for A1/A2 and rev1 B3: reading_view with blockId returns each of the four block kinds in full and refuses an unknown id towards reading_view without blockId,
 *           while the plain view keeps its summary (a widget still without html) plus the source hint; reading_patch edits widget html (with params), prose and a diagram in place
 *           (same id and position, neighbours untouched), applies edits in order, refuses a missing or repeated old, table edits, every normalizeBlock rule broken by the result,
 *           an unreferenced material, an empty patch, empty edits and an empty old, all without writing; '' deletes title/caption and [] deletes params unless the html still reads them;
 *           both tool descriptions carry the source hint and the keep-the-title warning; reading_patch is an edit tool
 * [POS]: the block read/patch mechanism's end-to-end proof beside reading.test.ts; the controllable model proves mechanism only and never stands in for real-model acceptance
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { toolCategory } from '../../src/permissions.ts'
import { createHttpService } from '../../src/server.ts'
import { fixtureProvider, textReply, toolReply, type ProviderRequest } from '../provider-fixture.ts'
import { ensureTopic } from '../topic-fixture.ts'
import { pagedPdf } from './library-fixtures.ts'

const token = 'reading-patch-token-at-least-24-chars'
const headers = { Authorization: `Bearer ${token}` }
const inference = { kind: 'inference' as const }
const said = (request: ProviderRequest) => {
  const lastUser = request.messages.map(message => message.role).lastIndexOf('user')
  return request.messages.slice(lastUser).some(message => message.role === 'tool')
}

const PARAMS = [{ type: 'range', name: 'dk', label: 'd_k', min: 4, max: 512, step: 4, default: 64 }]
const HTML = '<p id="v">上限 512</p><script>const show = function (p) { document.getElementById("v").textContent = "d_k=" + p.dk }; show(window.lumenParams); addEventListener("lumen:params", function (e) { show(e.detail) })</script>'

test('reading_view(blockId) reads one block in full; reading_patch edits it in place by exact-once edits and the same rules as a write', { timeout: 120000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-reading-patch-'))
  let next: { name: string; args: unknown } | null = null, calls = 0
  const fixture = fixtureProvider(request => {
    if (said(request) || !next) return textReply('好了')
    return toolReply(next.name, next.args, `call-${++calls}`)
  })
  const service = await createHttpService({ dataRoot, token, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  const lastTool = () => String(fixture.requests.at(-1)!.messages.filter(message => message.role === 'tool').at(-1)?.content ?? '')
  const upload = async (topicId: string, name: string) => {
    const form = new FormData()
    form.set('file', new File([new Uint8Array(pagedPdf([[`${name} page with enough words`]]))], `${name}.pdf`))
    form.set('topicId', topicId)
    return (await (await service.app.request('/lumen/library', { method: 'POST', headers, body: form })).json()).item.id as string
  }
  try {
    ensureTopic(service, 'p'); ensureTopic(service, 'q')
    await service.catalog.createSession('p', 'a')
    const session = await service.application.session('p', 'a')
    const itemId = await upload('p', 'cortex'), foreign = await upload('q', 'other')
    const call = async (name: string, args: unknown) => { next = { name, args }; await session.sendMessage({ content: `call ${name} ${++calls}` }); next = null; return lastTool() }
    const read = async () => (await service.app.request(`/lumen/topics/p/readings/${itemId}`, { headers })).json()
    const patch = (args: Record<string, unknown>) => call('reading_patch', { itemId, ...args })

    await call('reading_write', { itemId, title: '机制', paragraphs: [
      { text: '缩放让 softmax 不饱和。第二句留着。', source: inference },
      { kind: 'table', title: '对照', columns: ['a', 'b'], rows: [['1', '2']], caption: '表注', source: inference },
      { kind: 'diagram', title: '流程', mermaid: 'flowchart LR\n  A["Q"] --> B["K"]', source: inference },
      { kind: 'widget', title: '缩放实验', html: HTML, params: PARAMS, caption: '拖一拖', source: inference },
    ] })
    const original = (await read()).sections[0]
    const [text, table, diagram, widget] = original.paragraphs as { id: string }[]

    // ---- A1: the request tells the model where the source lives and that a title change drops the values (B3-4, B3-5) ----
    const described = Object.fromEntries((fixture.requests[0]!.tools as { function: { name: string; description?: string } }[]).map(tool => [tool.function.name, tool.function.description ?? '']))
    assert.match(described.reading_view!, /blockId[\s\S]*不在工作区文件里[\s\S]*不要用 list_files、read_file 或 run_code/)
    assert.match(described.reading_patch!, /没有必要不要改小实验的标题[\s\S]*改了标题这些值就失效/)
    assert.equal(toolCategory('reading_patch'), 'edit')

    // ---- A1: each kind comes back whole; the plain view still omits the html and adds the source hint ----
    const one = async (blockId: string) => JSON.parse(await call('reading_view', { itemId, blockId }))
    assert.deepEqual(await one(text!.id), { itemId, sectionId: original.id, sectionTitle: '机制', block: { ...original.paragraphs[0], kind: 'text' } })
    assert.deepEqual((await one(table!.id)).block, original.paragraphs[1])
    assert.deepEqual((await one(diagram!.id)).block, original.paragraphs[2])
    const full = (await one(widget!.id)).block
    assert.equal(full.html, HTML)
    assert.deepEqual(full.params, PARAMS)
    assert.match(await call('reading_view', { itemId, blockId: 'p0000000000' }), /没有 id 为 p0000000000 的块；先不带 blockId 调一次 reading_view\(\{ itemId \}\)/)
    const plain = JSON.parse(await call('reading_view', { itemId }))
    assert.deepEqual(Object.keys(plain).sort(), ['itemId', 'limits', 'sections', 'source'])
    assert.match(plain.source, /不在工作区文件里/)
    assert.deepEqual(plain.sections[0].paragraphs[3], { id: widget!.id, kind: 'widget', title: '缩放实验', caption: '拖一拖', htmlBytes: Buffer.byteLength(HTML), params: PARAMS, source: inference })
    assert.deepEqual(plain.sections[0].paragraphs[1], { id: table!.id, kind: 'table', title: '对照', columns: ['a', 'b'], rows: 1, caption: '表注', source: inference })

    // ---- Refusals leave the stored reading byte-for-byte unchanged, timestamps included ----
    const snapshot = JSON.stringify(await read())
    const refused = async (args: Record<string, unknown>, pattern: RegExp) => {
      assert.match(await patch(args), pattern)
      assert.equal(JSON.stringify(await read()), snapshot, `refused patch wrote something: ${JSON.stringify(args).slice(0, 80)}`)
    }
    await refused({ blockId: widget!.id, edits: [{ old: '上限 1024', new: '上限 256' }] }, /第 1 条 edits 的 old 在这一块的当前内容里找不到；先用 reading_view\(\{ itemId, blockId: "p[0-9a-f]{10}" \}\)/)
    await refused({ blockId: widget!.id, edits: [{ old: 'v', new: 'w' }] }, /第 1 条 edits 的 old 在这一块里出现了不止一次；带上前后更多的原文/)
    await refused({ blockId: widget!.id, edits: [{ old: '上限 512', new: '上限 256' }, { old: '上限 512', new: 'x' }] }, /第 2 条 edits 的 old/)
    await refused({ blockId: table!.id, edits: [{ old: '1', new: '3' }] }, /表格不支持 edits；要改单元格，用 reading_write/)
    await refused({ blockId: text!.id, title: '文字段的标题' }, /文字段没有 title、caption 和 params/)
    await refused({ blockId: diagram!.id, params: PARAMS }, /只有小实验有 params/)
    await refused({ blockId: text!.id, edits: [{ old: '第二句留着。', new: '长'.repeat(600) }] }, /一段最多 600 字/)
    await refused({ blockId: diagram!.id, edits: [{ old: 'B["K"]', new: `B["${'K'.repeat(8 * 1024)}"]` }] }, /图示超过 8KB/)
    await refused({ blockId: widget!.id, edits: [{ old: '上限 512', new: 'x'.repeat(64 * 1024) }] }, /小部件超过 64KB/)
    await refused({ blockId: widget!.id, edits: [{ old: 'const show', new: 'const show = (' }] }, /第 4 块小实验的第 1 个脚本有语法错误/)
    await refused({ blockId: widget!.id, edits: [{ old: '<p id="v">', new: '<img src="https://example.com/a.png"><p id="v">' }] }, /引用了外网地址「https:\/\/example.com\/a.png」/)
    await refused({ blockId: widget!.id, params: [] }, /页面用了 lumenParams，但块里没有声明 params/)
    await refused({ blockId: widget!.id, edits: [{ old: 'show(window.lumenParams); addEventListener("lumen:params", function (e) { show(e.detail) })', new: 'show({ dk: 64 })' }] }, /声明了 params，页面却没有读/)
    await refused({ blockId: widget!.id }, /至少要给 edits、title、caption、params 中的一项/)
    await refused({ blockId: widget!.id, edits: [] }, /validation failed for reading_patch[\s\S]*- edits: Too small/)
    await refused({ blockId: widget!.id, edits: [{ old: '', new: 'x' }] }, /validation failed for reading_patch[\s\S]*- edits\.0\.old: Too small/)
    await refused({ blockId: 'p0000000000', title: 'x' }, /没有 id 为 p0000000000 的块/)
    assert.match(await call('reading_patch', { itemId: foreign, blockId: widget!.id, title: 'x' }), /不在这个主题的引用清单里/)
    assert.equal(JSON.stringify(await read()), snapshot)

    // ---- Widget: html and params together; id, position and the other blocks stay ----
    const done = JSON.parse(await patch({ blockId: widget!.id, edits: [{ old: '上限 512', new: '上限 256' }], params: [{ ...PARAMS[0], max: 256 }] }))
    assert.deepEqual(done, { sectionId: original.id, blockId: widget!.id, kind: 'widget', htmlBytes: Buffer.byteLength(HTML.replace('上限 512', '上限 256')), params: [{ ...PARAMS[0], max: 256 }] })
    let section = (await read()).sections[0]
    assert.deepEqual(section.paragraphs.map((block: { id: string }) => block.id), original.paragraphs.map((block: { id: string }) => block.id))
    assert.deepEqual(section.paragraphs.slice(0, 3), original.paragraphs.slice(0, 3))
    assert.equal(section.paragraphs[3].html, HTML.replace('上限 512', '上限 256'))
    assert.equal(section.paragraphs[3].title, '缩放实验')
    assert.ok(section.updatedAt > original.updatedAt)

    // ---- Edits apply in order: the second old exists only after the first edit ----
    await patch({ blockId: text!.id, edits: [{ old: '第二句留着。', new: '第二句改过。' }, { old: '改过', new: '改好了' }] })
    // ---- Diagram edit, and '' deletes a caption while [] deletes params from a widget that stops reading them ----
    await patch({ blockId: diagram!.id, edits: [{ old: 'B["K"]', new: 'B["Key"]' }], title: '' })
    await patch({ blockId: widget!.id, edits: [{ old: 'show(window.lumenParams); addEventListener("lumen:params", function (e) { show(e.detail) })', new: 'show({ dk: 64 })' }], params: [], caption: '' })
    section = (await read()).sections[0]
    assert.equal(section.paragraphs[0].text, '缩放让 softmax 不饱和。第二句改好了。')
    assert.equal(section.paragraphs[2].mermaid, 'flowchart LR\n  A["Q"] --> B["Key"]')
    assert.ok(!('title' in section.paragraphs[2]), "title '' 删掉标题")
    assert.ok(!('params' in section.paragraphs[3]) && !('caption' in section.paragraphs[3]), 'params [] 与 caption 空串删掉参数和说明')
    assert.equal(section.paragraphs[3].title, '缩放实验')
    assert.deepEqual(section.paragraphs[1], original.paragraphs[1], '表格一直没动')
  } finally {
    await service.close()
    await rm(dataRoot, { recursive: true, force: true })
  }
})

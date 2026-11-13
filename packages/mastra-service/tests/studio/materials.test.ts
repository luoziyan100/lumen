/**
 * [INPUT]: 真实 HTTP 服务/应用组合根、Mastra Controller 工具循环、catalog.sqlite 与资料库文件、确定性模型与研究网络
 * [OUTPUT]: 资料库工具边界（R15）、to_library 收入、按页读与进度、资料库图片像素、只读专家 schema、主题工作区共享与只销毁一次的行为证据
 * [POS]: S2 访问边界的端到端证明；模型只经 list_materials/read_material/look_at_image(itemId) 触达资料库，主题从受信会话推出
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApplication } from '../../src/application.ts'
import { createHttpService } from '../../src/server.ts'
import { fixtureProvider, textReply, toolReply, type ProviderRequest } from '../provider-fixture.ts'
import { ensureTopic } from '../topic-fixture.ts'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64')

function pdfDocument(pages: string[]): Buffer {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  for (const [i, text] of pages.entries()) {
    const stream = `BT /F1 12 Tf 40 100 Td (${text}) Tj ET`
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`)
  }
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n` })
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(pdf)
}

const said = (request: ProviderRequest) => {
  const lastUser = request.messages.map(message => message.role).lastIndexOf('user')
  return { text: JSON.stringify(request.messages[lastUser]), answered: request.messages.slice(lastUser).some(message => message.role === 'tool') }
}

test('资料库工具只认本主题引用：to_library 收入并引用、按页读推进进度、图片按 itemId 送像素、越界与未引用一律拒绝', { timeout: 60000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-materials-'))
  const ids = { pdf: '', foreign: '', image: '' }
  let calls = 0
  const call = (name: string, args: unknown) => toolReply(name, args, `call-${++calls}`)
  const fixture = fixtureProvider(request => {
    const { text, answered } = said(request)
    if (answered) return textReply('已处理')
    if (text.includes('抓网页')) return call('fetch_url', { url: 'https://paper.example/page', to_library: true })
    if (text.includes('抓PDF')) return call('extract_pdf', { source: 'https://paper.example/files/study.pdf', to_library: true })
    if (text.includes('本地入库')) return call('extract_pdf', { source: 'local.pdf', to_library: true })
    if (text.includes('读第二页')) return call('read_material', { itemId: ids.pdf, page: 2 })
    if (text.includes('读外部')) return call('read_material', { itemId: ids.foreign })
    if (text.includes('读越界')) return call('read_material', { itemId: '../../catalog.sqlite' })
    if (text.includes('看图')) return call('look_at_image', { itemId: ids.image, focus: '颜色' })
    return call('list_materials', {})
  })
  const network: typeof fetch = async url => {
    const target = new URL(String(url))
    if (target.pathname.endsWith('.pdf')) return new Response(new Uint8Array(pdfDocument(['FIRST PAGE EVIDENCE', 'SECOND PAGE EVIDENCE 42'])), { headers: { 'content-type': 'application/pdf' } })
    return new Response('<html><head><title>Evidence Page</title></head><body><p>WEB EVIDENCE 7</p></body></html>', { headers: { 'content-type': 'text/html' } })
  }
  const token = 'materials-token-at-least-24-characters'
  const service = await createHttpService({ dataRoot, token, research: { fetch: network },
    model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  const headers = { Authorization: `Bearer ${token}` }
  const materials = async (topic: string) => (await (await service.app.request(`/lumen/topics/${topic}/materials`, { headers })).json()).items as Array<{ id: string; kind: string; addedBy: string; sourceUrl: string | null; readProgress: number; title: string; titleSource: string | null }>
  const upload = async (name: string, bytes: Uint8Array<ArrayBuffer>, topicId?: string) => {
    const form = new FormData()
    form.set('file', new File([bytes], name))
    if (topicId) form.set('topicId', topicId)
    return (await (await service.app.request('/lumen/library', { method: 'POST', headers, body: form })).json()).item.id as string
  }
  const lastTool = () => JSON.stringify(fixture.requests.at(-1)!.messages.filter(message => message.role === 'tool').at(-1))
  try {
    ensureTopic(service, 'p'); ensureTopic(service, 'q')
    await service.catalog.createSession('p', 'a')
    const session = await service.application.session('p', 'a')

    // ---- 研究工具的 to_library：原件进资料库、记成 AI 带来的、引用到当前主题 ----
    await session.sendMessage({ content: '抓网页' })
    assert.match(lastTool(), /WEB EVIDENCE 7/)
    assert.match(lastTool(), /libraryItemId/)
    await session.sendMessage({ content: '抓PDF' })
    assert.match(lastTool(), /FIRST PAGE EVIDENCE/)
    const listed = await materials('p')
    assert.deepEqual(listed.map(item => [item.kind, item.addedBy]).sort(), [['pdf', 'ai'], ['web', 'ai']])
    assert.equal(listed.find(item => item.kind === 'web')?.title, 'Evidence Page')
    assert.equal(listed.find(item => item.kind === 'pdf')?.sourceUrl, 'https://paper.example/files/study.pdf')
    // L2 ③：夹具 PDF 没有文档信息 Title，标题取首页最大字号的那行
    assert.deepEqual([listed.find(item => item.kind === 'pdf')?.title, listed.find(item => item.kind === 'pdf')?.titleSource], ['FIRST PAGE EVIDENCE', 'heading'])
    assert.deepEqual(await materials('q'), [])
    ids.pdf = listed.find(item => item.kind === 'pdf')!.id
    await session.sendMessage({ content: '本地入库' })
    assert.match(lastTool(), /to_library 只用于远程 PDF/)

    // ---- 按页读：带页码，进度前进到该页 ----
    await session.sendMessage({ content: '读第二页' })
    assert.match(lastTool(), /\[PDF page 2\]/)
    assert.match(lastTool(), /SECOND PAGE EVIDENCE 42/)
    // 只看读到的正文：标题字段本身就是首页大字（L2 ③）
    assert.doesNotMatch(JSON.parse(JSON.parse(lastTool()).content).content, /FIRST PAGE EVIDENCE/)
    assert.equal((await materials('p')).find(item => item.id === ids.pdf)?.readProgress, 1)

    // ---- R15：资料库里有、但本主题没引用的，与不存在的、越界的给同一句话 ----
    ids.foreign = await upload('foreign.txt', new TextEncoder().encode('FOREIGN SECRET 99'), 'q')
    await session.sendMessage({ content: '读外部' })
    assert.doesNotMatch(lastTool(), /FOREIGN SECRET 99/)
    assert.match(lastTool(), /不在这个主题的引用清单里/)
    await session.sendMessage({ content: '读越界' })
    assert.match(lastTool(), /不在这个主题的引用清单里/)

    // ---- 资料库图片：工具结果只有引用，像素由请求处理器从资料库读出送给模型 ----
    ids.image = await upload('figure.png', new Uint8Array(PNG), 'p')
    await session.sendMessage({ content: '看图' })
    const pixels = fixture.requests.at(-1)!.messages.some(message => message.role === 'user' && Array.isArray(message.content)
      && message.content.some((part: { type: string; image_url?: { url: string } }) => part.type === 'image_url' && part.image_url?.url === `data:image/png;base64,${PNG.toString('base64')}`))
    assert.ok(pixels, '资料库图片的像素必须进入下一次模型请求')
    assert.ok(!lastTool().includes(PNG.toString('base64')), '图片不应被串成工具文本')
    // ---- 取消引用后，同一主题也看不到了；历史里的旧引用不再送像素 ----
    assert.equal((await service.app.request(`/lumen/topics/p/materials/${ids.image}`, { method: 'DELETE', headers })).status, 204)
    await session.sendMessage({ content: '看图' })
    assert.match(lastTool(), /不在这个主题的引用清单里/)
    assert.match(JSON.stringify(fixture.requests.at(-1)), /文件已变化或无法读取/)
    assert.equal((await readdir(join(dataRoot, 'library'))).length, 4, '取消引用不删原件')
  } finally { await service.close(); await rm(dataRoot, { recursive: true, force: true }) }
})

test('同主题对话共用一个工作区实例，专家跨对话读到主题文件；只读专家看不到写参数；关闭时工作区只销毁一次', { timeout: 60000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-topic-workspace-'))
  const seen: Record<string, { tools: string[]; schema: string; result?: string }> = {}
  let calls = 0
  const call = (name: string, args: unknown) => toolReply(name, args, `call-${++calls}`)
  const fixture = fixtureProvider(request => {
    const tools = request.tools?.map(tool => tool.function.name) ?? []
    const results = request.messages.filter(message => message.role === 'tool')
    const system = request.messages.filter(message => message.role === 'system').map(message => String(message.content)).join('\n')
    if (!tools.includes('agent-reader')) {
      const role = system.includes('只读材料') ? 'reader' : 'searcher'
      seen[role] ??= { tools, schema: JSON.stringify(request.tools) }
      if (role === 'reader') {
        if (!results.length) return call('read_file', { path: 'notes/a.md' })
        seen.reader!.result = JSON.stringify(results)
        return textReply('READER_DONE')
      }
      if (!results.length) return call('read_task_file', { path: 'notes/a.md' })
      if (results.length === 1) { seen.searcher!.result = JSON.stringify(results); return call('write_file', { path: 'found.md', content: 'SEARCHER_FOUND' }) }
      return textReply('SEARCHER_DONE')
    }
    const { text, answered } = said(request)
    if (answered) return textReply('已处理')
    if (text.includes('写笔记')) return call('write_file', { path: 'notes/a.md', content: 'FROM_SESSION_A' })
    if (text.includes('只读专家')) return call('agent-reader', { prompt: '读 notes/a.md' })
    return call('agent-searcher', { prompt: '读 notes/a.md 并记下发现' })
  })
  const app = await createApplication({ dataRoot: root, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  let destroyed = 0
  try {
    const a = await app.session('p', 'a'), b = await app.session('p', 'b'), other = await app.session('q', 'a')
    const shared = await app.controller.resolveWorkspace({ session: a })
    assert.equal(await app.controller.resolveWorkspace({ session: b }), shared, '同主题两段对话是同一个 Workspace 实例')
    assert.notEqual(await app.controller.resolveWorkspace({ session: other }), shared)
    const destroy = shared!.destroy.bind(shared)
    shared!.destroy = async () => { destroyed++; return destroy() }
    for (const session of [a, b]) session.subscribe(event => {
      if (event.type === 'tool_approval_required') session.respondToToolApproval({ toolCallId: event.toolCallId, decision: 'approve' })
    })
    await a.sendMessage({ content: '写笔记' })
    await b.sendMessage({ content: '委派只读专家' })
    await b.sendMessage({ content: '委派检索专家' })

    // ---- 只读专家：能读材料与主题工作区，看不到任何写参数或写工具 ----
    const reader = seen.reader!
    assert.ok(reader.tools.includes('list_materials') && reader.tools.includes('read_material'), JSON.stringify(reader.tools))
    assert.ok(!reader.tools.some(name => ['write_file', 'edit_file', 'write_memory', 'copy_task_file', 'install_skill'].includes(name)), JSON.stringify(reader.tools))
    assert.doesNotMatch(reader.schema, /to_library|save_as/)
    assert.match(reader.result!, /FROM_SESSION_A/)
    // ---- 可写专家：读另一段对话写的主题文件，产物进主题工作区自己的 workers/ 子目录 ----
    const searcher = seen.searcher!
    assert.match(searcher.schema, /to_library/)
    assert.match(searcher.result!, /FROM_SESSION_A/)
    const workers = await readdir(join(root, 'topics/p/work/workers'))
    assert.equal(workers.length, 1)
    assert.match(workers[0]!, /^searcher-/)
    assert.equal(await readFile(join(root, 'topics/p/work/workers', workers[0]!, 'found.md'), 'utf8'), 'SEARCHER_FOUND')
  } finally {
    await app.close()
    assert.equal(destroyed, 1, '主题工作区被多段对话共用，关闭时只销毁一次')
    await rm(root, { recursive: true, force: true })
  }
})

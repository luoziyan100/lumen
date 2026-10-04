/**
 * [INPUT]: 真 Mastra/LibSQL/Workspace/unpdf；模型与研究 HTTP 边界夹具
 * [OUTPUT]: 论文检索回灌、PDF 解析写笔记、保存失败不伪报成功
 * [POS]: 研究能力迁入后的真实生产执行路径验证
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalFilesystem, Workspace } from '@mastra/core/workspace'
import { RequestContext } from '@mastra/core/request-context'
import { noopObserve } from '@mastra/core/tools'
import { createApplication } from '../src/application.ts'
import { createPdfTool } from '../src/research/pdf.ts'
import { journalRank } from '../src/research/journal-ranks.ts'
import { fixtureProvider, textReply, toolReply } from './provider-fixture.ts'

test('期刊分级按规范化旗舰名称精确匹配，细分和家族规则不被泛名称遮蔽', () => {
  const ranks: Array<[string, number]> = [
    ['  NATURE  ', 100], ['Science', 100], ['Cell', 100],
    ['Nature   Neuroscience', 95], ['Nature Communications', 85], ['Science Advances', 85],
    ['Journal of Neuroscience', 80], ['Psychological Science', 80], ['Frontiers in Neuroscience', 60],
    ['PLOS Biology', 60], ['bioRxiv', 50], ['National Science Review', 30], ['Cell Reports', 30],
  ]
  for (const [venue, rank] of ranks) assert.equal(journalRank(venue), rank, venue)
  assert.equal(journalRank(undefined), 0)
})

function pdfDocument(text: string): Uint8Array {
  const stream = `BT /F1 12 Tf 40 100 Td (${text}) Tj 0 -20 Td (SECOND LINE EVIDENCE) Tj ET`
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n` })
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(pdf)
}

test('PDF 摄取拒绝覆盖原件或已有产物，并在 stat/实际读取边界阻止超限文件', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-pdf-boundary-'))
  const workspace = new Workspace({ id: 'pdf-boundary', filesystem: new LocalFilesystem({ basePath: root, contained: true }) })
  await workspace.init()
  const original = pdfDocument('ORIGINAL PDF')
  const tool = createPdfTool(async () => { throw new Error('remote HTTP should not be called') })
  const context = { workspace, requestContext: new RequestContext(), observe: noopObserve }
  try {
    await workspace.filesystem!.writeFile('input.pdf', original)
    await assert.rejects(tool.execute!({ source: 'input.pdf', save_as: './input.pdf', offset: 0, limit: 20000 }, context), /不得覆盖原始 PDF/)
    assert.deepEqual(await workspace.filesystem!.readFile('input.pdf'), original)

    await workspace.filesystem!.writeFile('notes.md', 'KEEP EXISTING OUTPUT')
    await assert.rejects(tool.execute!({ source: 'input.pdf', save_as: 'notes.md', offset: 0, limit: 20000 }, context))
    assert.equal(await workspace.filesystem!.readFile('notes.md', { encoding: 'utf8' }), 'KEEP EXISTING OUTPUT')

    await workspace.filesystem!.writeFile('oversized.pdf', Buffer.alloc(25 * 1024 * 1024 + 1))
    await assert.rejects(tool.execute!({ source: 'oversized.pdf', offset: 0, limit: 20000 }, context), /25 MB|字节上限/)

    const lyingWorkspace = { filesystem: {
      readOnly: false,
      stat: async () => ({ type: 'file', size: 1 }),
      readFile: async () => Buffer.alloc(25 * 1024 * 1024 + 1),
      writeFile: async () => undefined,
    } } as unknown as Workspace
    await assert.rejects(tool.execute!({ source: 'race.pdf', offset: 0, limit: 20000 }, { ...context, workspace: lyingWorkspace }), /25 MB|字节上限/)
  } finally {
    await workspace.destroy()
    await rm(root, { recursive: true, force: true })
  }
})

test('真实 PDF 经工具抽取后回灌模型并形成文件产物', { timeout: 25000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-pdf-'))
  let evidenceSeen = false
  const fixture = fixtureProvider(request => {
    const results = request.messages.filter(message => message.role === 'tool')
    if (!results.length) return toolReply('extract_pdf', { source: 'papers/input.pdf', save_as: 'cache/input.md' }, 'extract')
    if (results.length === 1) {
      evidenceSeen = JSON.stringify(results).includes('LUMEN PDF EVIDENCE 9')
      return toolReply('write_file', { path: 'notes/result.md', content: '来源 papers/input.pdf：LUMEN PDF EVIDENCE 9' }, 'write')
    }
    return textReply('已核对 PDF 并写入笔记')
  })
  const app = await createApplication({ dataRoot: root, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } })
  try {
    const session = await app.session('p', 'pdf')
    const workspace = await app.controller.resolveWorkspace({ session })
    await workspace!.filesystem!.writeFile('papers/input.pdf', pdfDocument('LUMEN PDF EVIDENCE 9'))
    session.subscribe(event => {
      if (event.type === 'tool_approval_required') session.respondToToolApproval({ toolCallId: event.toolCallId, decision: 'approve' })
    })
    await session.sendMessage({ content: '读 PDF 并写带来源的笔记' })
    assert.ok(evidenceSeen)
    assert.match(await readFile(join(root, 'projects/p/tasks/pdf/cache/input.md'), 'utf8'), /\[PDF page 1\]\nLUMEN PDF EVIDENCE 9\nSECOND LINE EVIDENCE/)
    assert.match(await readFile(join(root, 'projects/p/tasks/pdf/cache/input.md'), 'utf8'), /LUMEN PDF EVIDENCE 9/)
    assert.match(await readFile(join(root, 'projects/p/tasks/pdf/notes/result.md'), 'utf8'), /papers\/input.pdf/)
  } finally { await app.close(); await rm(root, { recursive: true, force: true }) }
})

test('论文检索通过原生工具回灌结构化 DOI 和摘要', { timeout: 25000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-search-'))
  let sourceSeen = false
  const provider = fixtureProvider(request => {
    const results = request.messages.filter(message => message.role === 'tool')
    if (!results.length) return toolReply('search_papers', { query: 'reproducibility' })
    sourceSeen = JSON.stringify(results).includes('10.1234/evidence') && JSON.stringify(results).includes('Reproducible evidence')
    return textReply('论文来源已核对')
  })
  const network: typeof fetch = async (url, init) => {
    assert.equal(new URL(String(url)).hostname, 'api.openalex.org')
    assert.ok(init?.signal)
    return Response.json({ results: [{ title: 'Reproducible evidence', doi: 'https://doi.org/10.1234/evidence', abstract_inverted_index: { Reproducible: [0], evidence: [1] } }] })
  }
  const app = await createApplication({ dataRoot: root, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: provider.fetch }, research: { fetch: network } })
  try {
    const session = await app.session('p', 'search')
    session.subscribe(event => {
      if (event.type === 'tool_approval_required') session.respondToToolApproval({ toolCallId: event.toolCallId, decision: 'approve' })
    })
    await session.sendMessage({ content: '找可复现研究论文' })
    assert.ok(sourceSeen)
  } finally { await app.close(); await rm(root, { recursive: true, force: true }) }
})


test('网页保存被工作区拒绝时，模型收到失败而非成功路径', { timeout: 25000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-save-error-'))
  let failureSeen = false
  const provider = fixtureProvider(request => {
    const results = request.messages.filter(message => message.role === 'tool')
    if (!results.length) return toolReply('fetch_url', { url: 'https://paper.example/article', save_as: '../escape.md' })
    const result = JSON.stringify(results)
    failureSeen = /error|denied|outside|traversal|invalid|not allowed/i.test(result) && !result.includes('savedAs')
    return textReply('文件没有保存成功')
  })
  const app = await createApplication({ dataRoot: root, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: provider.fetch },
    research: { fetch: async () => new Response('<html><p>真实正文</p></html>', { headers: { 'content-type': 'text/html' } }) },
  })
  try {
    const session = await app.session('p', 'save')
    session.subscribe(event => {
      if (event.type === 'tool_approval_required') session.respondToToolApproval({ toolCallId: event.toolCallId, decision: 'approve' })
    })
    await session.sendMessage({ content: '读取网页并保存' })
    assert.ok(failureSeen)
    await assert.rejects(access(join(root, 'projects/p/tasks/escape.md')))
  } finally { await app.close(); await rm(root, { recursive: true, force: true }) }
})

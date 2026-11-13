/**
 * [INPUT]: research/arxiv、studio/titles、LibraryStore、backfill、openStudioDb 的真实实现；真实 SQLite 与 library/ 文件；研究网络在 fetch 边界换成可控桩
 * [OUTPUT]: L1 arXiv 识别全形式；L2 标题回退各层（arXiv API、文档信息 Title 的乱码/软件名/文件名排除、首页大字、文件名）、清洗与 API 超时回退；
 *           旧库加列升级；L4 补取幂等、条目 id/引用/阅读进度保留、原件 0400、API 暂失败不降级、重复原件跳过；L5 原件位置核对（符号链接、越界、非普通文件）
 * [POS]: 资料库标题与 arXiv 的单元证据；HTTP 与模型工具入口的行为测试在 arxiv-http.test.ts
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readdir, rm, stat, symlink, unlink, writeFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { arxivId, authorLine, fetchArxivMeta, parseArxivAtom } from '../../src/research/arxiv.ts'
import { researchHttp } from '../../src/research/http.ts'
import { backfillLibrary } from '../../src/studio/backfill.ts'
import { openStudio } from '../../src/studio/studio.ts'
import { cleanTitle, headingTitle, pdfTitle, usableInfoTitle } from '../../src/studio/titles.ts'
import { atom, titledPdf } from './library-fixtures.ts'

test('L1 arXiv 识别：abs/pdf/html、版本号、旧式编号、www/export 变体；非 arXiv 与非论文页为 null', () => {
  const cases: [string, string | null][] = [
    ['https://arxiv.org/abs/2611.14235', '2611.14235'], ['https://arxiv.org/abs/2611.14235v2', '2611.14235v2'],
    ['https://arxiv.org/pdf/1706.03762', '1706.03762'], ['https://arxiv.org/pdf/1706.03762v7.pdf', '1706.03762v7'], ['http://arxiv.org/pdf/2104.09864.pdf', '2104.09864'],
    ['https://arxiv.org/html/2611.14235v1', '2611.14235v1'], ['https://arxiv.org/html/2611.14235v1/', '2611.14235v1'],
    ['https://www.arxiv.org/abs/1706.03762', '1706.03762'], ['https://export.arxiv.org/abs/1706.03762', '1706.03762'], ['https://ARXIV.org/abs/0704.0001', '0704.0001'],
    ['https://arxiv.org/abs/hep-th/9901001', 'hep-th/9901001'], ['https://arxiv.org/abs/hep-th/9901001v3', 'hep-th/9901001v3'], ['https://arxiv.org/pdf/math.AG/0601001.pdf', 'math.AG/0601001'],
    ['https://arxiv.org/abs/cond-mat/0001001', 'cond-mat/0001001'],
    ['https://arxiv.org/list/cs.CL/recent', null], ['https://arxiv.org/', null], ['https://arxiv.org/abs/', null], ['https://arxiv.org/abs/not-an-id', null],
    ['https://arxiv.org.evil.example/abs/1706.03762', null], ['https://example.com/abs/1706.03762', null], ['https://arxiv.org/abs/17060.3762', null],
    ['ftp://arxiv.org/abs/1706.03762', null], ['不是链接', null], ['', null],
  ]
  for (const [url, want] of cases) assert.equal(arxivId(url), want, url)
  assert.equal(arxivId(null), null)
})

test('arXiv API：解析 Atom（实体、空白、作者前 3 位 + et al.、年份）；Error 条目与空结果为 null；失败与超时不抛、≤ 超时返回', async () => {
  const meta = parseArxivAtom(atom('1706.03762v7', 'Attention Is All\n  You Need &amp; More', ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar', 'Jakob Uszkoreit']), '1706.03762')
  assert.deepEqual(meta, { id: '1706.03762', title: 'Attention Is All You Need & More', authors: 'Ashish Vaswani, Noam Shazeer, Niki Parmar et al.', year: 2017 })
  assert.equal(authorLine(['A', ' B ', 'C']), 'A, B, C')
  assert.equal(parseArxivAtom('<feed><entry><id>http://arxiv.org/api/errors#incorrect_id_format</id><title>Error</title></entry></feed>', 'x'), null)
  assert.equal(parseArxivAtom('<feed><title>arXiv Query</title></feed>', 'x'), null)
  const down = researchHttp(async () => new Response('busy', { status: 404 }))
  assert.equal(await fetchArxivMeta(down, '1706.03762'), null)
  const hang = researchHttp(((_url: URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as typeof fetch)
  const started = Date.now()
  assert.equal(await fetchArxivMeta(hang, '1706.03762', undefined, 120), null)
  assert.ok(Date.now() - started < 2000, '超时按时返回')
})

test('L2 清洗与文档信息 Title：折叠空白、去 [编号] 前缀、≤200 字；乱码/软件名/Word 前缀/文件名一律不用', () => {
  assert.equal(cleanTitle('[2611.14235]  Banding  instabilities\n in media '), 'Banding instabilities in media')
  assert.equal(cleanTitle('[hep-th/9901001v2] Old style'), 'Old style')
  assert.equal(Array.from(cleanTitle('长'.repeat(300))).length, 200)
  assert.equal(usableInfoTitle('Attention Is All You Need', '1706.03762.pdf'), 'Attention Is All You Need')
  for (const bad of ['', '   ', 'untitled', 'Untitled document', 'Microsoft Word - draft paper.docx', 'Word - notes', 'main.tex', 'paper.pdf', '1706.03762', 'arXiv:1706.03762v7',
    'LaTeX', 'pdfTeX', 'Adobe Acrobat', 'þÿ\u0000A\u0000t', '�����', '%%%%1234', 'C:\\docs\\x', '/tmp/report'])
    assert.equal(usableInfoTitle(bad, '1706.03762.pdf'), null, JSON.stringify(bad))
  assert.equal(usableInfoTitle(42, 'x.pdf'), null)
})

test('L2 首页大字：取最大字号的横排行（旋转水印不算），同字号多行按阅读顺序拼接', () => {
  const item = (str: string, size: number, y: number, x = 40, rotated = false) => ({ str, transform: rotated ? [0, size, -size, 0, x, y] : [size, 0, 0, size, x, y] })
  assert.equal(headingTitle([item('arXiv:2104.09864v5 [cs.CL]', 40, 300, 20, true), item('RoFormer: Enhanced Transformer', 17, 700), item('with Rotary Position Embedding', 17, 680),
    item('Jianlin Su', 11, 640), item('Abstract', 12, 600)]), 'RoFormer: Enhanced Transformer with Rotary Position Embedding')
  assert.equal(headingTitle([item('12', 30, 700), item('Body', 10, 600)]), null, '最大字号只有数字：不当标题')
  assert.equal(headingTitle([]), null)
})

test('L2 PDF 回退链：可用 Info → info；Info 是软件名或缺失 → 首页大字；都没有 → null', async () => {
  assert.deepEqual(await pdfTitle(titledPdf({ info: 'Attention Is All You Need', lines: [[20, 'Some Other Heading']] }), '1706.03762.pdf'), { title: 'Attention Is All You Need', source: 'info' })
  assert.deepEqual(await pdfTitle(titledPdf({ info: 'Microsoft Word - final.docx', lines: [[20, 'Real Heading Here'], [10, 'body']], rotated: 'arXiv:1234.56789v1' }), 'x.pdf'), { title: 'Real Heading Here', source: 'heading' })
  assert.deepEqual(await pdfTitle(titledPdf({ lines: [[18, 'Heading Without Info']] }), 'x.pdf'), { title: 'Heading Without Info', source: 'heading' })
  assert.equal(await pdfTitle(titledPdf({}), 'x.pdf'), null)
  assert.equal(await pdfTitle(Buffer.from('%PDF-1.4 broken'), 'x.pdf'), null, '解析失败不抛')
})

test('旧库升级：缺列的 library_items 打开后补齐四列，旧行读出为 null，重复打开不报错', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-migrate-'))
  try {
    const old = new DatabaseSync(join(root, 'catalog.sqlite'))
    old.exec(`CREATE TABLE library_items (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('file','pdf','web')), title TEXT NOT NULL, file TEXT NOT NULL, source_url TEXT,
      sha256 TEXT NOT NULL UNIQUE, media_type TEXT NOT NULL, size INTEGER NOT NULL, added_by TEXT NOT NULL CHECK (added_by IN ('you','ai')), created_at TEXT NOT NULL) STRICT`)
    old.prepare('INSERT INTO library_items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('old-1', 'pdf', '1706.03762', '1706.03762.pdf', 'https://arxiv.org/pdf/1706.03762', 'aa', 'application/pdf', 3, 'you', '2026-11-01T00:00:00.000Z')
    old.close()
    for (let i = 0; i < 2; i++) {
      const studio = openStudio(root)
      try {
        const [item] = studio.library.list()
        assert.deepEqual([item!.title, item!.authors, item!.year, item!.arxivId, item!.titleSource], ['1706.03762', null, null, null, null])
      } finally { studio.close() }
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

/** 可控 arXiv 网络：PDF 与 API 分别计数；apiDown 时 API 返回 503 */
function arxivNetwork(papers: Record<string, { pdf: Buffer; title: string; authors: string[]; published?: string }>) {
  const state = { apiDown: false, pdf: 0, api: 0, other: 0 }
  const fetch: typeof globalThis.fetch = async input => {
    const url = new URL(String(input))
    if (url.hostname === 'export.arxiv.org' && url.pathname === '/api/query') {
      state.api++
      if (state.apiDown) return new Response('down', { status: 404 })
      const id = url.searchParams.get('id_list')!, paper = papers[id.replace(/v\d+$/, '')]
      return new Response(paper ? atom(id, paper.title, paper.authors, paper.published) : '<feed></feed>', { headers: { 'content-type': 'application/atom+xml' } })
    }
    const pdf = url.hostname === 'arxiv.org' && url.pathname.match(/^\/pdf\/(.+)$/)?.[1]
    if (pdf && papers[pdf.replace(/v\d+$/, '')]) { state.pdf++; return new Response(new Uint8Array(papers[pdf.replace(/v\d+$/, '')]!.pdf), { headers: { 'content-type': 'application/pdf' } }) }
    state.other++
    return new Response('<html><head><title>[2611.14235] Banding</title></head><body>abstract page</body></html>', { headers: { 'content-type': 'text/html' } })
  }
  return { state, http: researchHttp(fetch) }
}

test('L4 补取：arXiv 网页条目换成 PDF（同 id、引用与进度不动、0400、旧正文删掉），PDF 标题按 API 重算；跑两次结果相同；API 暂失败不降级；重复原件跳过', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-backfill-'))
  const studio = openStudio(root)
  try {
    const papers = {
      '1706.03762': { pdf: titledPdf({ info: 'untitled', lines: [[17, 'Attention Is All You Need']] }), title: 'Attention Is All You Need', authors: ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar', 'Jakob Uszkoreit'] },
      '2611.14235': { pdf: titledPdf({ lines: [[17, 'Banding instabilities']] }), title: 'Banding instabilities in poroelastic media under flow-driven compaction', authors: ['A. Author'], published: '2026-11-18T00:00:00Z' },
      '2104.09864': { pdf: titledPdf({ lines: [[17, 'RoFormer']] }), title: 'RoFormer: Enhanced Transformer with Rotary Position Embedding', authors: ['Jianlin Su', 'Yu Lu', 'Shengfeng Pan', 'Ahmed Murtadha', 'Bo Wen'], published: '2021-04-20T00:00:00Z' },
    }
    // ---- 旧形态数据：两份 PDF 标题是编号（file），一份 arXiv 论文页存成了网页正文 ----
    const legacyTitle = (id: string, title: string) => studio.db.prepare('UPDATE library_items SET title = ?, title_source = NULL WHERE id = ?').run(title, id)
    const attention = (await studio.library.add({ name: '1706.03762.pdf', bytes: papers['1706.03762'].pdf, addedBy: 'you', sourceUrl: 'https://arxiv.org/pdf/1706.03762', kind: 'pdf' })).item
    legacyTitle(attention.id, '1706.03762')
    const web = (await studio.library.add({ name: '_2611.txt', bytes: Buffer.from('Banding abstract page text'), addedBy: 'you', sourceUrl: 'https://arxiv.org/abs/2611.14235', kind: 'web', mediaType: 'text/plain', title: '[2611.14235] Banding instabilities in poroelastic media under flow-driven compaction' })).item
    legacyTitle(web.id, '[2611.14235] Banding instabilities in poroelastic media under flow-driven compaction')
    const upload = (await studio.library.add({ name: 'notes.md', bytes: Buffer.from('# my notes'), addedBy: 'you' })).item
    const topic = studio.topics.create('t')
    for (const item of [attention, web, upload]) studio.topics.reference(topic.id, item.id)
    studio.topics.setProgress(topic.id, web.id, 0.4)
    const { state, http } = arxivNetwork(papers)
    // 同一毫秒加入的条目排序不定：按 id 取行
    const by = (rows: Awaited<ReturnType<typeof backfillLibrary>>, ids: string[]) => ids.map(id => rows.find(row => row.id === id)!)
    const order = [attention.id, web.id, upload.id]

    // ---- 计划：不写库、不写文件 ----
    const plan = await backfillLibrary(studio, http, { dryRun: true })
    assert.deepEqual(by(plan, order).map(row => row.action), ['retitled', 'converted', 'unchanged'])
    assert.equal(studio.library.get(web.id).kind, 'web', 'dry-run 不改库')
    assert.deepEqual(await readdir(join(root, 'library', web.id)), ['_2611.txt'])

    // ---- 执行 ----
    const first = await backfillLibrary(studio, http)
    assert.deepEqual(by(first, order).map(row => [row.action, row.after.title]), [['retitled', 'Attention Is All You Need'], ['converted', 'Banding instabilities in poroelastic media under flow-driven compaction'], ['unchanged', 'notes']])
    const converted = studio.library.get(web.id)
    assert.deepEqual([converted.id, converted.kind, converted.file, converted.mediaType, converted.sourceUrl, converted.arxivId, converted.year, converted.titleSource],
      [web.id, 'pdf', '2611.14235.pdf', 'application/pdf', 'https://arxiv.org/abs/2611.14235', '2611.14235', 2026, 'arxiv'])
    assert.deepEqual(await readdir(join(root, 'library', web.id)), ['2611.14235.pdf'], '旧正文删掉、只留新原件')
    assert.equal((await stat(studio.library.path(converted))).mode & 0o777, 0o400)
    assert.deepEqual((await studio.library.read(converted)).subarray(0, 5).toString(), '%PDF-')
    const refs = studio.topics.materials(topic.id)
    assert.deepEqual(refs.map(item => item.id).sort(), [attention.id, web.id, upload.id].sort(), '引用不变')
    assert.equal(refs.find(item => item.id === web.id)!.readProgress, 0.4, '阅读进度不变')
    assert.equal(studio.library.get(attention.id).authors, 'Ashish Vaswani, Noam Shazeer, Niki Parmar et al.')

    // ---- 幂等：再跑一次结果相同、什么都不改 ----
    const before = JSON.stringify(studio.library.list())
    const second = await backfillLibrary(studio, http)
    assert.deepEqual(second.map(row => row.action), ['unchanged', 'unchanged', 'unchanged'])
    assert.equal(JSON.stringify(studio.library.list()), before)
    // ---- API 暂时失败：标题按 PDF 规则只会更差，不降级 ----
    state.apiDown = true
    const third = await backfillLibrary(studio, http)
    assert.deepEqual(third.map(row => row.action), ['unchanged', 'unchanged', 'unchanged'])
    assert.equal(JSON.stringify(studio.library.list()), before)
    assert.match(by(third, order)[0]!.reason ?? '', /稍后可重跑/)
    state.apiDown = false

    // ---- 重复原件：arXiv 网页条目要换成的 PDF 已在库里 → 跳过、不动 ----
    const dupWeb = (await studio.library.add({ name: 'rope.txt', bytes: Buffer.from('rope abstract'), addedBy: 'ai', sourceUrl: 'https://arxiv.org/abs/2104.09864', kind: 'web', mediaType: 'text/plain' })).item
    await studio.library.add({ name: '2104.09864.pdf', bytes: papers['2104.09864'].pdf, addedBy: 'ai', sourceUrl: 'https://arxiv.org/pdf/2104.09864', kind: 'pdf' })
    const fourth = await backfillLibrary(studio, http)
    const skipped = fourth.find(row => row.id === dupWeb.id)!
    assert.equal(skipped.action, 'skipped')
    assert.match(skipped.reason!, /相同/)
    assert.equal(studio.library.get(dupWeb.id).kind, 'web')
  } finally { studio.close(); await rm(root, { recursive: true, force: true }) }
})

test('L5 原件位置：返回 library/<id>/ 下的真实普通文件；符号链接、换成目录、被移出都拒绝', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-location-'))
  const studio = openStudio(root)
  try {
    const { item } = await studio.library.add({ name: 'a.pdf', bytes: titledPdf({ lines: [[12, 'Loc Test Title']] }), addedBy: 'you' })
    const location = await studio.library.location(item)
    assert.equal(location.path, join(location.root, item.id, 'a.pdf'))
    assert.match(location.root, /library$/)
    const file = studio.library.path(item), directory = join(root, 'library', item.id)
    // 符号链接：原件换成指向库外的链接
    await chmod(directory, 0o700); await unlink(file)
    await writeFile(join(root, 'secret.txt'), 'outside'); await symlink(join(root, 'secret.txt'), file)
    await assert.rejects(studio.library.location(item), /不是普通文件/)
    // 指向库内另一文件的链接也拒绝
    await unlink(file); await writeFile(join(directory, 'other.pdf'), 'x'); await symlink(join(directory, 'other.pdf'), file)
    await assert.rejects(studio.library.location(item), /不是普通文件/)
    // 换成目录
    await unlink(file); await mkdir(file)
    await assert.rejects(studio.library.location(item), /不是普通文件/)
    // 条目目录被换成指向库外的链接
    await rm(directory, { recursive: true }); await mkdir(join(root, 'elsewhere')); await writeFile(join(root, 'elsewhere', 'a.pdf'), 'x')
    await symlink(join(root, 'elsewhere'), directory)
    await assert.rejects(studio.library.location(item), /不在资料库里/)
    // 不存在
    await unlink(directory)
    await assert.rejects(studio.library.location(item), /不存在/)
  } finally { studio.close(); await rm(root, { recursive: true, force: true }) }
})

/**
 * [INPUT]: createResearchTools + createSearchWebTool + 罐装 HttpClient / WebSearchBackend
 * [OUTPUT]: 研究桥接纯函数与工具行为钉(排序/HTML/未配置错误/成功 REMINDER)
 * [POS]: research/ 工厂的真实路径单测;网络只走注入缝
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSearchUrl,
  parseSearchResponse,
  rankPapers,
  formatPapers,
  htmlToText,
  journalRank,
  createResearchTools,
  type HttpClient,
  type HttpResponse,
} from '../../src/tools/research/index.ts'
import { createSearchWebTool } from '../../src/tools/research/search-web.ts'
import { noopCtx } from '../helpers/scripted-model.ts'

function jsonResponse(body: unknown): HttpResponse {
  return { status: 200, ok: true, text: async () => JSON.stringify(body), json: async () => body, bytes: async () => new Uint8Array() }
}
function textResponse(text: string): HttpResponse {
  return { status: 200, ok: true, text: async () => text, json: async () => ({}), bytes: async () => new Uint8Array() }
}
function stubHttp(handler: (url: string) => HttpResponse): HttpClient {
  return async (url) => handler(url)
}

const S2_SEARCH_BODY = {
  total: 2,
  data: [
    { paperId: 'p1', title: 'Diffusion models', authors: [{ name: 'A. One' }, { name: 'B. Two' }], year: 2026, venue: 'arXiv', externalIds: { ArXiv: '2601.001' }, abstract: 'about diffusion' },
    { paperId: 'p2', title: 'A Nature study', authors: [{ name: 'C. Three' }], year: 2026, venue: 'Nature', externalIds: { DOI: '10.1038/x' }, abstract: 'big result' },
  ],
}

test('buildSearchUrl 带 query/limit/fields', () => {
  const url = buildSearchUrl('diffusion', 5)
  assert.match(url, /paper\/search\?/)
  assert.match(url, /query=diffusion/)
  assert.match(url, /limit=5/)
})

test('parseSearchResponse 解出记录，DOI/arXiv 归位', () => {
  const papers = parseSearchResponse(S2_SEARCH_BODY)
  assert.equal(papers.length, 2)
  assert.equal(papers[0].arxiv, '2601.001')
  assert.equal(papers[1].doi, '10.1038/x')
})

test('rankPapers 按期刊分级把 Nature 排到 arXiv 前面', () => {
  const ranked = rankPapers(parseSearchResponse(S2_SEARCH_BODY))
  assert.equal(ranked[0].venue, 'Nature')
  assert.equal(ranked[1].venue, 'arXiv')
})

test('journalRank：Nature > arXiv > 未知', () => {
  assert.ok(journalRank('Nature') > journalRank('arXiv'))
  assert.ok(journalRank('arXiv') > journalRank('Some Unknown Journal'))
})

test('htmlToText 去标签/脚本，保留正文', () => {
  const text = htmlToText('<html><head><style>x{}</style></head><body><h1>标题</h1><p>正文一</p><script>bad()</script><p>正文二</p></body></html>')
  assert.match(text, /标题/)
  assert.match(text, /正文一/)
  assert.match(text, /正文二/)
  assert.doesNotMatch(text, /bad\(\)/)
  assert.doesNotMatch(text, /x\{\}/)
})

const OA_SEARCH_BODY = {
  results: [
    { title: 'Diffusion models', authorships: [{ author: { display_name: 'A. One' } }], publication_year: 2026, primary_location: { source: { display_name: 'arXiv' } }, ids: { arxiv: '2601.001' }, abstract_inverted_index: { about: [0], diffusion: [1] }, open_access: { is_oa: true, oa_url: 'https://arxiv.org/pdf/2601.001' } },
    { title: 'A Nature study', authorships: [{ author: { display_name: 'C. Three' } }], publication_year: 2026, primary_location: { source: { display_name: 'Nature' } }, doi: 'https://doi.org/10.1038/x', abstract_inverted_index: { big: [0], result: [1] } },
  ],
}

const SOURCES_REMINDER = /答末 Sources 列作品/
const SOURCES_POINTER = /#检索之后/

test('search_papers 工具：经 stub HTTP（OpenAlex 格式）排序 + 展示开放全文链接', async () => {
  const tools = createResearchTools({ http: stubHttp(() => jsonResponse(OA_SEARCH_BODY)) })
  const searchPapers = tools.find((t) => t.spec.name === 'search_papers')!
  const result = await searchPapers.run({ query: 'diffusion' }, noopCtx())
  assert.match(result.llmContent, /A Nature study/)
  assert.ok(result.llmContent.indexOf('A Nature study') < result.llmContent.indexOf('Diffusion models'), 'Nature 应排在前')
  assert.match(result.llmContent, /开放全文: https:\/\/arxiv\.org\/pdf\/2601\.001/, '有 oa_url 的应展示开放全文链接')
  assert.match(result.llmContent, SOURCES_REMINDER)
  assert.match(result.llmContent, SOURCES_POINTER)
  assert.doesNotMatch(result.llmContent, /列出所有搜索 URL/)
})

test('fetch_url 工具：抓 HTML 转正文', async () => {
  const tools = createResearchTools({ http: stubHttp(() => textResponse('<p>Hello 论文</p>')) })
  const fetchUrl = tools.find((t) => t.spec.name === 'fetch_url')!
  const result = await fetchUrl.run({ url: 'https://example.com' }, noopCtx())
  assert.match(result.llmContent, /Hello 论文/)
  assert.match(result.llmContent, SOURCES_REMINDER)
  assert.match(result.llmContent, SOURCES_POINTER)
})

test('search_web 未配置后端：返回清晰错误而非崩溃', async () => {
  const searchWeb = createSearchWebTool()
  const result = await searchWeb.run({ query: 'x' }, noopCtx())
  assert.match(result.llmContent, /后端未配置/)
  assert.doesNotMatch(result.llmContent, SOURCES_REMINDER)
})

test('search_web 成功：结果后附 Sources 回指 reminder,不倒 URL 清单', async () => {
  const searchWeb = createSearchWebTool({
    webSearch: async () => [{ title: 'Example Paper', url: 'https://example.com/hit', snippet: 'a hit' }],
  })
  const result = await searchWeb.run({ query: 'x' }, noopCtx())
  assert.match(result.llmContent, /Example Paper/)
  assert.match(result.llmContent, SOURCES_REMINDER)
  assert.match(result.llmContent, SOURCES_POINTER)
  const reminder = result.llmContent.slice(result.llmContent.indexOf('REMINDER:'))
  assert.doesNotMatch(reminder, /https:\/\//)
})

test('extract_pdf 未接抽取器：返回边界提示', async () => {
  const tools = createResearchTools()
  const extractPdf = tools.find((t) => t.spec.name === 'extract_pdf')!
  const result = await extractPdf.run({ source: 'library/x.pdf' }, noopCtx())
  assert.match(result.llmContent, /未接入|边界/)
})

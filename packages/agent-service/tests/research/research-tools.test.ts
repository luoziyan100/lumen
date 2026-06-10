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
import { noopCtx } from '../helpers/scripted-model.ts'

function jsonResponse(body: unknown): HttpResponse {
  return { status: 200, ok: true, text: async () => JSON.stringify(body), json: async () => body }
}
function textResponse(text: string): HttpResponse {
  return { status: 200, ok: true, text: async () => text, json: async () => ({}) }
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

test('search_papers 工具：经 stub HTTP 返回排序后的列表', async () => {
  const tools = createResearchTools({ http: stubHttp(() => jsonResponse(S2_SEARCH_BODY)) })
  const searchPapers = tools.find((t) => t.spec.name === 'search_papers')!
  const result = await searchPapers.run({ query: 'diffusion' }, noopCtx())
  assert.match(result.llmContent, /A Nature study/)
  // Nature 应排在 Diffusion models 之前
  assert.ok(result.llmContent.indexOf('A Nature study') < result.llmContent.indexOf('Diffusion models'))
})

test('fetch_url 工具：抓 HTML 转正文', async () => {
  const tools = createResearchTools({ http: stubHttp(() => textResponse('<p>Hello 论文</p>')) })
  const fetchUrl = tools.find((t) => t.spec.name === 'fetch_url')!
  const result = await fetchUrl.run({ url: 'https://example.com' }, noopCtx())
  assert.match(result.llmContent, /Hello 论文/)
})

test('search_web 未配置后端：返回清晰错误而非崩溃', async () => {
  const tools = createResearchTools({ http: stubHttp(() => textResponse('')) })
  const searchWeb = tools.find((t) => t.spec.name === 'search_web')!
  const result = await searchWeb.run({ query: 'x' }, noopCtx())
  assert.match(result.llmContent, /后端未配置/)
})

test('extract_pdf 未接抽取器：返回边界提示', async () => {
  const tools = createResearchTools()
  const extractPdf = tools.find((t) => t.spec.name === 'extract_pdf')!
  const result = await extractPdf.run({ source: 'library/x.pdf' }, noopCtx())
  assert.match(result.llmContent, /未接入|边界/)
})

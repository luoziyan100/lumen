import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTavily, createTavilyWebSearch, createResearchTools } from '../../src/tools/research/index.ts'
import type { HttpClient, HttpResponse, HttpInit } from '../../src/tools/research/http.ts'
import { noopCtx } from '../helpers/scripted-model.ts'

const TAVILY_BODY = {
  results: [
    { title: 'Diffusion overview', url: 'https://a.com/1', content: '关于扩散模型的综述', score: 0.9 },
    { title: 'Mamba paper', url: 'https://b.com/2', content: 'state space models', score: 0.8 },
    { title: '', url: 'https://c.com', content: 'no title -> filtered' },
  ],
}

function jsonResponse(body: unknown): HttpResponse {
  return { status: 200, ok: true, text: async () => JSON.stringify(body), json: async () => body, bytes: async () => new Uint8Array() }
}

test('parseTavily 解出 title/url/snippet，过滤无标题项', () => {
  const hits = parseTavily(TAVILY_BODY)
  assert.equal(hits.length, 2)
  assert.equal(hits[0].title, 'Diffusion overview')
  assert.equal(hits[0].snippet, '关于扩散模型的综述')
})

test('createTavilyWebSearch：POST /search，Bearer，正确请求体', async () => {
  const calls: Array<{ url: string; init?: HttpInit }> = []
  const http: HttpClient = async (url, init) => {
    calls.push({ url, init })
    return jsonResponse(TAVILY_BODY)
  }
  const backend = createTavilyWebSearch({ apiKey: 'tk-test', http })
  const hits = await backend('扩散模型')

  assert.equal(hits.length, 2)
  assert.match(calls[0].url, /api\.tavily\.com\/search$/)
  assert.equal(calls[0].init?.method, 'POST')
  assert.equal(calls[0].init?.headers?.authorization, 'Bearer tk-test')
  const body = JSON.parse(calls[0].init?.body ?? '{}')
  assert.equal(body.query, '扩散模型')
  assert.equal(body.search_depth, 'basic')
  assert.equal(body.include_answer, false)
})

test('search_web 工具：接 Tavily 后端后返回格式化结果', async () => {
  const http: HttpClient = async () => jsonResponse(TAVILY_BODY)
  const tools = createResearchTools({ webSearch: createTavilyWebSearch({ apiKey: 'tk', http }) })
  const searchWeb = tools.find((t) => t.spec.name === 'search_web')!
  const result = await searchWeb.run({ query: 'x' }, noopCtx())
  assert.match(result.llmContent, /Diffusion overview/)
  assert.match(result.llmContent, /https:\/\/a\.com\/1/)
})

test('search_web 工具：Tavily 4xx → 干净错误', async () => {
  const http: HttpClient = async () => ({ status: 401, ok: false, text: async () => 'unauthorized', json: async () => ({}), bytes: async () => new Uint8Array() })
  const tools = createResearchTools({ webSearch: createTavilyWebSearch({ apiKey: 'bad', http }) })
  const searchWeb = tools.find((t) => t.spec.name === 'search_web')!
  const result = await searchWeb.run({ query: 'x' }, noopCtx())
  assert.match(result.llmContent, /error:/)
})

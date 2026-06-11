import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reconstructAbstract, parseOpenAlex, buildOpenAlexUrl } from '../../src/tools/research/openalex.ts'
import { fetchHttp } from '../../src/tools/research/http.ts'

test('reconstructAbstract：按倒排位置重建正文', () => {
  assert.equal(reconstructAbstract({ A: [0, 3], study: [1], big: [2] }), 'A study big A')
  assert.equal(reconstructAbstract(undefined), undefined)
  assert.equal(reconstructAbstract({}), undefined)
})

test('parseOpenAlex：title/authors/venue/doi/arxiv/摘要/oaUrl 归位', () => {
  const [p] = parseOpenAlex({
    results: [{
      title: 'X', authorships: [{ author: { display_name: 'A' } }, { author: { display_name: 'B' } }],
      publication_year: 2026, primary_location: { source: { display_name: 'Nature' } },
      doi: 'https://doi.org/10.1/x', ids: { arxiv: 'https://arxiv.org/abs/2601.1' },
      abstract_inverted_index: { hello: [0], world: [1] }, open_access: { is_oa: true, oa_url: 'https://oa/x.pdf' },
    }],
  })
  assert.equal(p.title, 'X')
  assert.deepEqual(p.authors, ['A', 'B'])
  assert.equal(p.venue, 'Nature')
  assert.equal(p.doi, '10.1/x')
  assert.equal(p.arxiv, '2601.1')
  assert.equal(p.abstract, 'hello world')
  assert.equal(p.oaUrl, 'https://oa/x.pdf')
})

test('parseOpenAlex：非开放获取不给 oaUrl', () => {
  const [p] = parseOpenAlex({ results: [{ title: 'Y', open_access: { is_oa: false, oa_url: 'x' } }] })
  assert.equal(p.oaUrl, undefined)
})

test('buildOpenAlexUrl：带 search/per_page/mailto', () => {
  const url = buildOpenAlexUrl('diffusion', 5)
  assert.match(url, /openalex\.org\/works/)
  assert.match(url, /search=diffusion/)
  assert.match(url, /per_page=5/)
  assert.match(url, /mailto=/)
})

test('fetchHttp 重试：429 两次后成功(共 3 次调用)', async () => {
  let calls = 0
  const fake = (async () => {
    calls += 1
    return new Response(JSON.stringify({ ok: true }), { status: calls < 3 ? 429 : 200 })
  }) as unknown as typeof fetch
  const res = await fetchHttp({ fetchImpl: fake, baseDelayMs: 1 })('http://x/')
  assert.equal(res.status, 200)
  assert.equal(calls, 3)
})

test('fetchHttp 默认带 User-Agent', async () => {
  let seenUA = ''
  const fake = (async (_url: string, init: { headers?: Record<string, string> }) => {
    seenUA = init.headers?.['user-agent'] ?? ''
    return new Response('ok', { status: 200 })
  }) as unknown as typeof fetch
  await fetchHttp({ fetchImpl: fake })('http://x/')
  assert.match(seenUA, /Lumen/)
})

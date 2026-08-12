import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  coerceUrl,
  titleFromUrl,
  parseSearchHits,
  parsePaperHits,
  parseMixedSourceBlob,
  extractSourceSection,
  sourcesFromTool,
  mergeSources,
} from '../src/sourceCite.ts'
import { reduceUserFacingItems, type ChatItem } from '../src/useAgent.ts'
import type { TaskEvent } from '../src/agent-client.ts'

describe('coerceUrl / titleFromUrl', () => {
  it('adds https to bare domains', () => {
    assert.equal(coerceUrl('github.com/openai/evals'), 'https://github.com/openai/evals')
  })
  it('maps github path to Name — GitHub', () => {
    assert.equal(titleFromUrl('https://github.com/accomplish-ai/accomplish'), 'accomplish — GitHub')
  })
  it('maps arXiv and doi shorthand', () => {
    assert.equal(coerceUrl('arXiv:2211.09110'), 'https://arxiv.org/abs/2211.09110')
    assert.equal(coerceUrl('doi:10.1234/x'), 'https://doi.org/10.1234/x')
  })
})

describe('parseSearchHits', () => {
  it('reads numbered title + indented url', () => {
    const text = '1. Nvidia lines up $500 billion\n   https://cnbc.com/nvidia-financing\n   snippet\n2. Other story\n   https://example.com/b'
    const hits = parseSearchHits(text)
    assert.equal(hits.length, 2)
    assert.equal(hits[0]?.title, 'Nvidia lines up $500 billion')
    assert.equal(hits[0]?.url, 'https://cnbc.com/nvidia-financing')
  })
})

describe('parsePaperHits', () => {
  it('uses 开放全文 or doi', () => {
    const text = '1. A paper\n   Alice | 2022 · Nature | doi:10.1/xyz\n   开放全文: https://arxiv.org/pdf/2201.00001'
    const hits = parsePaperHits(text)
    assert.equal(hits[0]?.title, 'A paper')
    assert.equal(hits[0]?.url, 'https://arxiv.org/pdf/2201.00001')
  })
})

describe('extractSourceSection', () => {
  it('strips 来源（节选） blob into titled cites', () => {
    const md = [
      '正文结论在这里。',
      '',
      '来源（节选）： github.com/EleutherAI/lm-evaluation-harness; github.com/huggingface/lighteval; inspect.aisi.org.uk; cloud.google.com (Vertex Gen AI evaluation)',
    ].join('\n')
    const { body, sources } = extractSourceSection(md)
    assert.equal(body, '正文结论在这里。')
    assert.ok(sources.length >= 3)
    assert.equal(sources[0]?.title, 'lm-evaluation-harness — GitHub')
    assert.ok(sources.some((s) => s.title.includes('Vertex') || s.url.includes('cloud.google.com')))
  })

  it('does not strip 来源 used mid-sentence without urls', () => {
    const md = '这个问题的来源：我自己编的。'
    const { body, sources } = extractSourceSection(md)
    assert.equal(body, md)
    assert.equal(sources.length, 0)
  })
})

describe('parseMixedSourceBlob', () => {
  it('reads markdown links', () => {
    const hits = parseMixedSourceBlob('- [OpenClaw — GitHub](https://github.com/openclaw/openclaw)')
    assert.equal(hits[0]?.title, 'OpenClaw — GitHub')
  })
})

describe('sourcesFromTool', () => {
  it('ignores error payloads', () => {
    assert.deepEqual(sourcesFromTool('search_web', {}, 'error: 未配置'), [])
  })
  it('fetch_url takes args.url', () => {
    const hits = sourcesFromTool('fetch_url', { url: 'https://joycone.com/waffle' }, 'ok body')
    assert.equal(hits[0]?.url, 'https://joycone.com/waffle')
  })
})

describe('mergeSources', () => {
  it('dedupes trailing slash', () => {
    const a = mergeSources(
      [{ url: 'https://ex.com/a', title: 'A' }],
      [{ url: 'https://ex.com/a/', title: 'A2' }],
    )
    assert.equal(a.length, 1)
    assert.equal(a[0]?.title, 'A')
  })
})

function ev(kind: string, id: string, payload: Record<string, unknown>): { event: TaskEvent; p: Record<string, unknown> } {
  return {
    event: {
      id,
      task_id: 't',
      seq: 1,
      kind,
      payload_json: JSON.stringify(payload),
      created_at: new Date().toISOString(),
    },
    p: payload,
  }
}

function apply(items: ChatItem[], kind: string, id: string, p: Record<string, unknown>): ChatItem[] {
  const { event, p: payload } = ev(kind, id, p)
  return reduceUserFacingItems(items, event, payload)
}

describe('reduceUserFacingItems sources', () => {
  it('AT: search_web 结果在终局挂到助手泡,并剥掉正文来源段', () => {
    let u: ChatItem[] = []
    u = apply(u, 'user', 'u1', { content: '搜一下评测框架' })
    u = apply(u, 'tool_call_start', 's1', { id: 't1', name: 'search_web' })
    u = apply(u, 'tool_result', 'r1', {
      id: 't1',
      name: 'search_web',
      llmContent: '1. LightEval\n   https://github.com/huggingface/lighteval\n   harness',
    })
    const proc = u.find((i) => i.kind === 'process')
    assert.ok(proc && proc.kind === 'process' && (proc.sources?.length ?? 0) >= 1)
    u = apply(u, 'model_step', 'm1', {
      content: '结论写完了。\n\n来源（节选）： github.com/EleutherAI/lm-evaluation-harness; github.com/huggingface/lighteval',
      toolCalls: [],
    })
    const ans = u.find((i) => i.kind === 'msg' && i.role === 'assistant')
    assert.ok(ans && ans.kind === 'msg')
    assert.ok(!ans.content.includes('来源'))
    assert.match(ans.content, /结论写完了/)
    assert.ok((ans.sources?.length ?? 0) >= 2)
    assert.ok(ans.sources?.some((s) => s.url.includes('lighteval')))
    assert.ok(ans.sources?.some((s) => s.url.includes('lm-evaluation-harness')))
  })
})

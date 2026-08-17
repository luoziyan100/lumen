import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  coerceUrl,
  titleFromUrl,
  parseSearchHits,
  parsePaperHits,
  parseMixedSourceBlob,
  extractSourceSection,
  shouldShowHostSourceList,
  sourcesFromTool,
  mergeSources,
  collapseSourcesBySite,
  siteKey,
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

  it('detects Claude-style Sources markdown list', () => {
    const md = '结论写完了。\n\nSources:\n- [Omarchy](https://github.com/basecamp/omarchy)\n'
    const { sources } = extractSourceSection(md)
    assert.equal(sources[0]?.url, 'https://github.com/basecamp/omarchy')
    assert.equal(sources[0]?.title, 'Omarchy')
  })
})

describe('shouldShowHostSourceList', () => {
  const tool = [{ url: 'https://github.com/huggingface/lighteval', title: 'LightEval' }]

  it('hides host list when the reply already has Sources', () => {
    const md = '结论。\n\nSources:\n- [LightEval](https://github.com/huggingface/lighteval)\n'
    assert.equal(shouldShowHostSourceList(md, tool), false)
  })

  it('shows host list when Sources omitted but tool URLs exist', () => {
    assert.equal(shouldShowHostSourceList('结论写完了。', tool), true)
  })

  it('hides host list when nothing linkable exists', () => {
    assert.equal(shouldShowHostSourceList('结论写完了。', []), false)
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

describe('collapseSourcesBySite', () => {
  it('collapses github blob/raw into one owner/repo site', () => {
    const rows = collapseSourcesBySite([
      { url: 'https://github.com/basecamp/omarchy', title: 'omarchy — GitHub' },
      { url: 'https://github.com/basecamp/omarchy/blob/main/README.md', title: 'README.md' },
      { url: 'https://raw.githubusercontent.com/basecamp/omarchy/main/README.md', title: 'README.md' },
    ])
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.url, 'https://github.com/basecamp/omarchy')
    assert.equal(rows[0]?.title, 'basecamp/omarchy')
    assert.equal(siteKey('https://raw.githubusercontent.com/basecamp/omarchy/main/docs/faq.md'), 'github.com/basecamp/omarchy')
  })

  it('keeps two hosts as two sites', () => {
    const rows = collapseSourcesBySite([
      { url: 'https://omarchy.org/docs/welcome', title: '01 welcome to omarchy.md' },
      { url: 'https://learn.omacom.io/manual', title: 'manual' },
    ])
    assert.equal(rows.length, 2)
    assert.equal(rows[0]?.url, 'https://omarchy.org')
    assert.equal(rows[0]?.title, 'omarchy.org')
    assert.equal(rows[1]?.url, 'https://learn.omacom.io')
    assert.equal(rows[1]?.title, 'learn.omacom.io')
  })

  it('does not merge local / non-http files', () => {
    const rows = collapseSourcesBySite([
      { url: 'file:///Users/me/papers/a.pdf', title: 'a.pdf' },
      { url: 'file:///Users/me/papers/b.pdf', title: 'b.pdf' },
    ])
    assert.equal(rows.length, 2)
    assert.equal(rows[0]?.url, 'file:///Users/me/papers/a.pdf')
    assert.equal(rows[1]?.url, 'file:///Users/me/papers/b.pdf')
  })

  it('keeps two github repos distinct', () => {
    const rows = collapseSourcesBySite([
      { url: 'https://github.com/basecamp/omarchy/wiki', title: 'wiki' },
      { url: 'https://github.com/basecamp/kamal', title: 'kamal' },
    ])
    assert.equal(rows.length, 2)
    assert.equal(rows[0]?.title, 'basecamp/omarchy')
    assert.equal(rows[1]?.title, 'basecamp/kamal')
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
  it('AT: search_web 结果在终局挂到助手泡,正文 Sources 不剥', () => {
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
      content: '结论写完了。\n\nSources:\n- [LightEval](https://github.com/huggingface/lighteval)\n',
      toolCalls: [],
    })
    const ans = u.find((i) => i.kind === 'msg' && i.role === 'assistant')
    assert.ok(ans && ans.kind === 'msg')
    assert.match(ans.content, /结论写完了/)
    assert.match(ans.content, /Sources:/)
    assert.match(ans.content, /\[LightEval\]\(https:\/\/github.com\/huggingface\/lighteval\)/)
    assert.ok(ans.sources?.some((s) => s.url.includes('lighteval')))
    assert.equal(shouldShowHostSourceList(ans.content, ans.sources ?? []), false)
  })

  it('AT: 模型漏写 Sources 时仍挂工具 URL,宿主表可兜底', () => {
    let u: ChatItem[] = []
    u = apply(u, 'user', 'u1', { content: '搜一下评测框架' })
    u = apply(u, 'tool_call_start', 's1', { id: 't1', name: 'search_web' })
    u = apply(u, 'tool_result', 'r1', {
      id: 't1',
      name: 'search_web',
      llmContent: '1. LightEval\n   https://github.com/huggingface/lighteval\n   harness',
    })
    u = apply(u, 'model_step', 'm1', {
      content: '结论写完了。',
      toolCalls: [],
    })
    const ans = u.find((i) => i.kind === 'msg' && i.role === 'assistant')
    assert.ok(ans && ans.kind === 'msg')
    assert.equal(ans.content.includes('Sources:'), false)
    assert.ok(ans.sources?.some((s) => s.url.includes('lighteval')))
    assert.equal(shouldShowHostSourceList(ans.content, ans.sources ?? []), true)
  })
})

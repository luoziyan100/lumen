/**
 * [INPUT]: http.ts、journal-ranks、core Tool
 * [OUTPUT]: createPaperTools —— search_papers / get_citations（Semantic Scholar Graph API）
 * [POS]: §5.3 研究桥接。逻辑对应 old_lumen search.rs（arXiv/S2 + 期刊排名），改写为 Node + JSON
 *
 * 纯函数（buildSearchUrl / parseSearchResponse / formatPapers）可单测；网络经注入的 HttpClient。
 */
import type { Tool, ToolResult } from '../../core/tool.ts'
import type { HttpClient } from './http.ts'
import { journalRank } from './journal-ranks.ts'

const S2_BASE = 'https://api.semanticscholar.org/graph/v1'
const SEARCH_FIELDS = 'title,authors,year,venue,externalIds,abstract'
const CITE_FIELDS = 'title,authors,year,venue,externalIds'

export interface PaperRecord {
  paperId?: string
  title: string
  authors: string[]
  year?: number
  venue?: string
  doi?: string
  arxiv?: string
  abstract?: string
}

export function buildSearchUrl(query: string, limit: number): string {
  const params = new URLSearchParams({ query, limit: String(limit), fields: SEARCH_FIELDS })
  return `${S2_BASE}/paper/search?${params.toString()}`
}

interface S2Paper {
  paperId?: string
  title?: string
  authors?: Array<{ name?: string }>
  year?: number
  venue?: string
  externalIds?: { DOI?: string; ArXiv?: string }
  abstract?: string
}

function toRecord(p: S2Paper): PaperRecord {
  return {
    paperId: p.paperId,
    title: p.title ?? '(无题)',
    authors: (p.authors ?? []).map((a) => a.name ?? '').filter(Boolean),
    year: p.year,
    venue: p.venue,
    doi: p.externalIds?.DOI,
    arxiv: p.externalIds?.ArXiv,
    abstract: p.abstract,
  }
}

export function parseSearchResponse(json: unknown): PaperRecord[] {
  const data = (json as { data?: S2Paper[] })?.data ?? []
  return data.map(toRecord)
}

/** 按期刊排名降序稳定排序（排名高的在前；同名次保持原序） */
export function rankPapers(papers: PaperRecord[]): PaperRecord[] {
  return papers
    .map((p, i) => ({ p, i, rank: journalRank(p.venue) }))
    .sort((a, b) => b.rank - a.rank || a.i - b.i)
    .map((x) => x.p)
}

export function formatPapers(papers: PaperRecord[]): string {
  if (papers.length === 0) return '(无结果)'
  return papers
    .map((p, i) => {
      const meta = [p.year, p.venue].filter(Boolean).join(' · ')
      const id = p.doi ? `doi:${p.doi}` : p.arxiv ? `arXiv:${p.arxiv}` : (p.paperId ?? '')
      const authors = p.authors.slice(0, 3).join(', ') + (p.authors.length > 3 ? ' et al.' : '')
      const abs = p.abstract ? `\n   ${p.abstract.slice(0, 240)}` : ''
      return `${i + 1}. ${p.title}\n   ${authors}${meta ? ' | ' + meta : ''}${id ? ' | ' + id : ''}${abs}`
    })
    .join('\n')
}

export function createPaperTools(deps: { http: HttpClient }): Tool[] {
  const searchPapers: Tool = {
    spec: {
      name: 'search_papers',
      description: '按关键词检索学术论文（Semantic Scholar）。返回标题/作者/年份/期刊/DOI/摘要片段，按期刊分级排序。',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' }, limit: { type: 'number', description: '默认 10' } },
        required: ['query'],
      },
    },
    run: async (args, ctx, signal): Promise<ToolResult> => {
      try {
        const limit = typeof args.limit === 'number' ? Math.min(Math.max(1, args.limit), 50) : 10
        const res = await deps.http(buildSearchUrl(String(args.query), limit), { signal })
        if (!res.ok) return { llmContent: `error: search_papers 请求失败 (${res.status})` }
        const papers = rankPapers(parseSearchResponse(await res.json()))
        if (ctx.workspace && papers.length) {
          const file = `notes/search-${Date.now()}.md`
          await ctx.workspace.writeFile(file, `# 检索: ${String(args.query)}\n\n${formatPapers(papers)}\n`).catch(() => {})
        }
        return { llmContent: formatPapers(papers), data: { papers } }
      } catch (error) {
        return { llmContent: `error: ${error instanceof Error ? error.message : String(error)}` }
      }
    },
  }

  const getCitations: Tool = {
    spec: {
      name: 'get_citations',
      description: '取某篇论文的引用或参考文献。id 可用 DOI:xxx / arXiv:xxx / S2 paperId。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          direction: { type: 'string', enum: ['citations', 'references'], description: '默认 references' },
          limit: { type: 'number' },
        },
        required: ['id'],
      },
    },
    run: async (args, _ctx, signal): Promise<ToolResult> => {
      try {
        const direction = args.direction === 'citations' ? 'citations' : 'references'
        const limit = typeof args.limit === 'number' ? Math.min(Math.max(1, args.limit), 50) : 15
        const params = new URLSearchParams({ fields: CITE_FIELDS, limit: String(limit) })
        const url = `${S2_BASE}/paper/${encodeURIComponent(String(args.id))}/${direction}?${params.toString()}`
        const res = await deps.http(url, { signal })
        if (!res.ok) return { llmContent: `error: get_citations 请求失败 (${res.status})` }
        const json = (await res.json()) as { data?: Array<Record<string, S2Paper>> }
        const papers = (json.data ?? [])
          .map((row) => (row.citingPaper ?? row.citedPaper) as S2Paper | undefined)
          .filter((p): p is S2Paper => Boolean(p))
          .map(toRecord)
        return { llmContent: formatPapers(papers), data: { papers, direction } }
      } catch (error) {
        return { llmContent: `error: ${error instanceof Error ? error.message : String(error)}` }
      }
    },
  }

  return [searchPapers, getCitations]
}

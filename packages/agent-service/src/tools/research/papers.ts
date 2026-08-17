/**
 * [INPUT]: http.ts、journal-ranks、core Tool
 * [OUTPUT]: createPaperTools —— search_papers / get_citations（Semantic Scholar Graph API）
 * [POS]: §5.3 研究桥接。逻辑对应 old_lumen search.rs（arXiv/S2 + 期刊排名），改写为 Node + JSON。
 *        description 学 Claude 方法(做什么/何时用与兄弟/结果形态/Sources 回指/用法/参数 description),
 *        Sources 只回指 persona「#检索之后」:用了几篇论文就几条,不另立法。
 *        成功调用的 llmContent 末附一句 REMINDER,回指同一合同。
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 *
 * 纯函数（buildSearchUrl / parseSearchResponse / formatPapers）可单测；网络经注入的 HttpClient。
 */
import type { Tool, ToolResult } from '../../core/tool.ts'
import type { HttpClient } from './http.ts'
import { journalRank } from './journal-ranks.ts'
import { buildOpenAlexUrl, parseOpenAlex } from './openalex.ts'

const S2_BASE = 'https://api.semanticscholar.org/graph/v1'
const SEARCH_FIELDS = 'title,authors,year,venue,externalIds,abstract'
const CITE_FIELDS = 'title,authors,year,venue,externalIds'

/** 成功检索后回灌线程的一句:回指 persona,不立法、不倒 URL */
const SOURCES_LLM_REMINDER =
  'REMINDER: 答末 Sources 列作品，见系统提示 #检索之后；勿列本次抓取的每个文件路径。'

function withSourcesReminder(content: string): string {
  return `${content}\n${SOURCES_LLM_REMINDER}`
}

const SEARCH_PAPERS_PROMPT = `按关键词检索学术论文（OpenAlex，覆盖约 2.5 亿作品）。返回标题 / 作者 / 年份 / 期刊 / DOI / 摘要 / 开放全文链接，按期刊分级排序。

何时用：找论文、综述、DOI、开放全文。
何时改用兄弟工具：普通网页 / 文档 / 新闻 → search_web；已有论文 HTML 页 → fetch_url；已有 PDF → extract_pdf；已知一篇要追引用 → get_citations。

结果：编号列表。有「开放全文」链接的可再 fetch_url / extract_pdf。有工作区时会顺带写入 notes/search-*.md（中间产物，不是 Sources 条目）。

Sources：答末按系统提示「#检索之后」：用了几篇论文就几条（abs 或 pdf 留一条），不要 abs+pdf 双列，不要把 notes/search-*.md 路径当作品。

用法：
- query 用英文关键词或论文题通常更准。
- limit 默认 10，上限 50。`

const GET_CITATIONS_PROMPT = `取某篇论文的引用（谁引了它）或参考文献（它引了谁）。

何时用：已有一篇论文的 DOI / arXiv / S2 paperId，要沿引用网络走。
何时改用兄弟工具：还没有这篇 → 先 search_papers；要读正文 → fetch_url / extract_pdf。

结果：与 search_papers 相同格式的论文列表。

Sources：答末按系统提示「#检索之后」列真正用到的论文，一篇一条。

用法：
- id 可用 DOI:10.xxxx / arXiv:xxxx / S2 paperId。
- direction 默认 references；citations = 谁引用了这篇。
- limit 默认 15，上限 50。`

export interface PaperRecord {
  paperId?: string
  title: string
  authors: string[]
  year?: number
  venue?: string
  doi?: string
  arxiv?: string
  abstract?: string
  oaUrl?: string // 开放获取全文链接(OpenAlex 提供,有则可直接 fetch_url / extract_pdf)
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
      const oa = p.oaUrl ? `\n   开放全文: ${p.oaUrl}` : ''
      return `${i + 1}. ${p.title}\n   ${authors}${meta ? ' | ' + meta : ''}${id ? ' | ' + id : ''}${abs}${oa}`
    })
    .join('\n')
}

export function createPaperTools(deps: { http: HttpClient }): Tool[] {
  const searchPapers: Tool = {
    spec: {
      name: 'search_papers',
      description: SEARCH_PAPERS_PROMPT,
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '关键词或论文题（英文通常更准）' },
          limit: { type: 'number', description: '返回条数，默认 10，上限 50' },
        },
        required: ['query'],
      },
    },
    run: async (args, ctx, signal): Promise<ToolResult> => {
      try {
        const limit = typeof args.limit === 'number' ? Math.min(Math.max(1, args.limit), 50) : 10
        const res = await deps.http(buildOpenAlexUrl(String(args.query), limit), { signal })
        if (!res.ok) return { llmContent: `error: search_papers 请求失败 (${res.status})` }
        const papers = rankPapers(parseOpenAlex(await res.json()))
        if (ctx.workspace && papers.length) {
          const file = `notes/search-${Date.now()}.md`
          await ctx.workspace.writeFile(file, `# 检索: ${String(args.query)}\n\n${formatPapers(papers)}\n`).catch(() => {})
        }
        return { llmContent: withSourcesReminder(formatPapers(papers)), data: { papers } }
      } catch (error) {
        return { llmContent: `error: ${error instanceof Error ? error.message : String(error)}` }
      }
    },
  }

  const getCitations: Tool = {
    spec: {
      name: 'get_citations',
      description: GET_CITATIONS_PROMPT,
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'DOI:10.xxxx / arXiv:xxxx / S2 paperId' },
          direction: { type: 'string', enum: ['citations', 'references'], description: 'citations=谁引了它；references=它引了谁。默认 references' },
          limit: { type: 'number', description: '返回条数，默认 15，上限 50' },
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
        return { llmContent: withSourcesReminder(formatPapers(papers)), data: { papers, direction } }
      } catch (error) {
        return { llmContent: `error: ${error instanceof Error ? error.message : String(error)}` }
      }
    },
  }

  return [searchPapers, getCitations]
}

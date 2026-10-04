/**
 * [INPUT]: Mastra createTool、研究 HTTP、论文领域解析
 * [OUTPUT]: createPaperTools：search_papers/get_citations
 * [POS]: 学术资料接入边界，结构化结果保留真实来源，不吞网络失败
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import type { ResearchHttp } from './http.ts'
import { buildOpenAlexUrl, parseOpenAlex } from './openalex.ts'
import { formatPapers, rankPapers, toRecord } from './records.ts'

export function createPaperTools(http: ResearchHttp, apiKey?: string) {
  return {
    search_papers: createTool({
      id: 'search_papers', description: '按关键词检索学术论文，返回标题、作者、摘要、DOI 与开放全文来源。已有 PDF 用 extract_pdf，追引用用 get_citations。引用论文作品而非检索缓存。',
      inputSchema: z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(50).default(10) }),
      execute: async ({ query, limit }, context) => {
        const url = new URL(buildOpenAlexUrl(query, limit))
        if (apiKey) url.searchParams.set('api_key', apiKey)
        const result = await http(url.toString(), { signal: context?.abortSignal })
        const json = JSON.parse(new TextDecoder().decode(result.bytes))
        if (!Array.isArray(json.results)) throw new Error('Invalid OpenAlex response')
        const papers = rankPapers(parseOpenAlex(json))
        return { papers, content: formatPapers(papers) }
      },
    }),
    get_citations: createTool({
      id: 'get_citations', description: '沿已知论文的引用网络检索，id 支持 DOI:、arXiv: 或 S2 paperId。references 是参考文献，citations 是引用它的论文。',
      inputSchema: z.object({ id: z.string().min(1), direction: z.enum(['references', 'citations']).default('references'), limit: z.number().int().min(1).max(50).default(15) }),
      execute: async ({ id, direction, limit }, context) => {
        const params = new URLSearchParams({ fields: 'title,authors,year,venue,externalIds', limit: String(limit) })
        const response = await http(`https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(id)}/${direction}?${params}`, { signal: context?.abortSignal })
        const json = JSON.parse(new TextDecoder().decode(response.bytes))
        if (!Array.isArray(json.data)) throw new Error('Invalid citation response')
        const papers = json.data.map((row: { citingPaper?: Parameters<typeof toRecord>[0]; citedPaper?: Parameters<typeof toRecord>[0] }) => row.citingPaper ?? row.citedPaper).filter(Boolean).map(toRecord)
        return { papers, direction, content: formatPapers(papers) }
      },
    }),
  }
}

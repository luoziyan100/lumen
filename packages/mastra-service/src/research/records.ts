/**
 * [INPUT]: 论文 API 响应与本地期刊分级表
 * [OUTPUT]: PaperRecord、S2 转换、排序与来源文本
 * [POS]: 沿用已知领域算法，脱离旧 Tool/ToolResult 执行接口
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { journalRank } from './journal-ranks.ts'

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

interface S2Paper {
  paperId?: string
  title?: string
  authors?: Array<{ name?: string }>
  year?: number
  venue?: string
  externalIds?: { DOI?: string; ArXiv?: string }
  abstract?: string
}

export function toRecord(p: S2Paper): PaperRecord {
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


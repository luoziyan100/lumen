/**
 * [INPUT]: OpenAlex 作品响应、PaperRecord 领域类型
 * [OUTPUT]: 查询 URL、论文记录、倒排摘要重建
 * [POS]: 检索源解析；不依赖 Mastra 或旧执行框架
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { PaperRecord } from './records.ts'

const OA_BASE = 'https://api.openalex.org'

export function buildOpenAlexUrl(query: string, limit: number): string {
  const params = new URLSearchParams({
    search: query,
    per_page: String(Math.min(Math.max(1, limit), 50)),
  })
  return `${OA_BASE}/works?${params.toString()}`
}

interface OAWork {
  title?: string
  display_name?: string
  publication_year?: number
  doi?: string
  authorships?: Array<{ author?: { display_name?: string } }>
  primary_location?: { source?: { display_name?: string } }
  host_venue?: { display_name?: string }
  open_access?: { is_oa?: boolean; oa_url?: string }
  ids?: { arxiv?: string }
  abstract_inverted_index?: Record<string, number[]>
}

/** OpenAlex 的摘要是倒排索引 {词: [位置...]},按位置重建成正文 */
export function reconstructAbstract(inv?: Record<string, number[]>): string | undefined {
  if (!inv) return undefined
  const slots: Array<[number, string]> = []
  for (const [word, positions] of Object.entries(inv)) {
    for (const pos of positions) slots.push([pos, word])
  }
  if (!slots.length) return undefined
  slots.sort((a, b) => a[0] - b[0])
  return slots.map((s) => s[1]).join(' ')
}

function oaArxiv(work: OAWork): string | undefined {
  const raw = work.ids?.arxiv
  return raw ? raw.replace(/^https?:\/\/arxiv\.org\/abs\//i, '') : undefined
}

export function parseOpenAlex(json: unknown): PaperRecord[] {
  const works = (json as { results?: OAWork[] })?.results ?? []
  return works.map((w) => ({
    title: w.title ?? w.display_name ?? '(无题)',
    authors: (w.authorships ?? []).map((a) => a.author?.display_name ?? '').filter(Boolean),
    year: w.publication_year,
    venue: w.primary_location?.source?.display_name ?? w.host_venue?.display_name,
    doi: w.doi ? w.doi.replace(/^https?:\/\/doi\.org\//i, '') : undefined,
    arxiv: oaArxiv(w),
    abstract: reconstructAbstract(w.abstract_inverted_index),
    oaUrl: w.open_access?.is_oa ? w.open_access.oa_url : undefined,
  }))
}

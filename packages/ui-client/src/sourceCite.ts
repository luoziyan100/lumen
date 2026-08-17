/**
 * [INPUT]: 工具 llmContent / 正文 Sources: 或「来源（节选）」段
 * [OUTPUT]: SourceCite[] + extractSourceSection(检测模型是否已写 Sources,不用于剥展示);
 *           shouldShowHostSourceList; collapseSourcesBySite 供漏写兜底
 * [POS]: 挑选权在模型正文;宿主表仅漏写兜底。收集仍按 URL;展示按站点折叠
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 *
 * 产品合同(Sources =「AI 看过哪些网站」,不是「看过哪些路径」):
 * - http(s) 站点键: github.com / gitlab.com / raw.githubusercontent.com → host+owner+repo
 *   (raw 归到 github.com/owner/repo);其它 host → origin(scheme+去 www 的 host)
 * - 展示 title = owner/repo 或 host;href = 仓库根或 origin,不用深链
 * - 本地 / 非 http 各文件一行,互不合并。无「是不是核心页」启发式
 * - extractSourceSection 只作「模型已写 Sources」信号,不从可见回复里删行
 * - 漏写时宿主 SourceList 用工具 URL + 按站折叠
 */

export type SourceCite = { url: string; title: string }

export const SOURCE_PREVIEW = 8

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function coerceUrl(raw: string): string | null {
  const t = raw.trim().replace(/^[<（(]+/, '').replace(/[>）),，。.;；]+$/, '')
  if (!t || t.length > 2000) return null
  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
      return u.href
    } catch {
      return null
    }
  }
  const arxiv = t.match(/^arXiv:(\S+)/i)
  if (arxiv) return `https://arxiv.org/abs/${arxiv[1]}`
  const doi = t.match(/^doi:(\S+)/i)
  if (doi) return `https://doi.org/${doi[1]}`
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}([/:?#].*)?$/i.test(t)) {
    try {
      return new URL(`https://${t}`).href
    } catch {
      return null
    }
  }
  return null
}

export function titleFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    const parts = u.pathname.split('/').filter(Boolean)
    if (host === 'github.com' && parts.length >= 2) {
      return `${decodeURIComponent(parts[1]!)} — GitHub`
    }
    if (host === 'arxiv.org' && parts[0] === 'abs' && parts[1]) {
      return `arXiv:${parts[1]}`
    }
    if (host === 'doi.org' && parts.length) {
      return `doi:${parts.join('/')}`
    }
    if (parts.length) {
      const last = decodeURIComponent(parts[parts.length - 1]!).replace(/[-_]+/g, ' ')
      if (last && last !== '/') return last
    }
    return host
  } catch {
    return url
  }
}

/** forge 宿主 → 规范 host。raw.githubusercontent.com 与 github.com 同属一个仓库站 */
const FORGE_CANON: Record<string, string> = {
  'github.com': 'github.com',
  'raw.githubusercontent.com': 'github.com',
  'gitlab.com': 'gitlab.com',
}

function httpUrl(raw: string): URL | null {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u
  } catch {
    return null
  }
}

function hostNorm(hostname: string): string {
  return hostname.replace(/^www\./, '').toLowerCase()
}

/** 展示层站点键。非 http(s) 返回 null,调用方按原 URL 各算一行 */
export function siteKey(url: string): string | null {
  const u = httpUrl(url)
  if (!u) return null
  const host = hostNorm(u.hostname)
  const parts = u.pathname.split('/').filter(Boolean)
  const forge = FORGE_CANON[host]
  if (forge && parts.length >= 2) {
    return `${forge}/${decodeURIComponent(parts[0]!).toLowerCase()}/${decodeURIComponent(parts[1]!).toLowerCase()}`
  }
  return `${u.protocol}//${host}`
}

export function siteRootUrl(url: string): string {
  const u = httpUrl(url)
  if (!u) return url
  const host = hostNorm(u.hostname)
  const parts = u.pathname.split('/').filter(Boolean)
  const forge = FORGE_CANON[host]
  if (forge && parts.length >= 2) {
    return `https://${forge}/${parts[0]}/${parts[1]}`
  }
  return `${u.protocol}//${host}`
}

export function siteDisplayTitle(url: string): string {
  const u = httpUrl(url)
  if (!u) return url
  const host = hostNorm(u.hostname)
  const parts = u.pathname.split('/').filter(Boolean)
  const forge = FORGE_CANON[host]
  if (forge && parts.length >= 2) {
    return `${decodeURIComponent(parts[0]!)}/${decodeURIComponent(parts[1]!)}`
  }
  return host
}

/** 答末展示:同一站点一行。收集层 mergeSources 仍按完整 URL 去重 */
export function collapseSourcesBySite(sources: SourceCite[]): SourceCite[] {
  const out: SourceCite[] = []
  const seen = new Set<string>()
  for (const s of sources) {
    const url = coerceUrl(s.url) ?? s.url.trim()
    if (!url) continue
    const site = siteKey(url)
    const key = site ?? `file:${url}`
    if (seen.has(key)) continue
    seen.add(key)
    if (site) {
      out.push({ url: siteRootUrl(url), title: siteDisplayTitle(url) })
    } else {
      const title = s.title.trim() && s.title !== url ? s.title.trim() : url
      out.push({ url, title })
    }
  }
  return out
}

export function mergeSources(...lists: SourceCite[][]): SourceCite[] {
  const out: SourceCite[] = []
  const seen = new Set<string>()
  for (const list of lists) {
    for (const s of list) {
      const url = coerceUrl(s.url)
      if (!url) continue
      const key = url.replace(/\/$/, '').toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      const title = s.title.trim() && s.title !== url ? s.title.trim() : titleFromUrl(url)
      out.push({ url, title })
    }
  }
  return out
}

/** search_web: `1. Title\n   https://...` */
export function parseSearchHits(text: string): SourceCite[] {
  const out: SourceCite[] = []
  const re = /^\s*\d+\.\s+(.+?)\n\s+(https?:\/\/\S+)/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const url = coerceUrl(m[2] ?? '')
    const title = (m[1] ?? '').trim()
    if (url) out.push({ url, title: title || titleFromUrl(url) })
  }
  return out
}

/** 论文块:标题 + 开放全文 / doi */
export function parsePaperHits(text: string): SourceCite[] {
  const chunks = text.split(/(?=^\s*\d+\.\s+)/m)
  const out: SourceCite[] = []
  for (const chunk of chunks) {
    const titleM = chunk.match(/^\s*\d+\.\s+(.+)$/m)
    const title = titleM?.[1]?.trim() ?? ''
    const oa = chunk.match(/开放全文:\s*(\S+)/)
    const doi = chunk.match(/\bdoi:(\S+)/i)
    const url = coerceUrl(oa?.[1] ?? '') ?? (doi?.[1] ? coerceUrl(`doi:${doi[1]}`) : null)
    if (url) out.push({ url, title: title || titleFromUrl(url) })
  }
  return out
}

export function parseMixedSourceBlob(blob: string): SourceCite[] {
  const out: SourceCite[] = []
  const md = [...blob.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)]
  for (const m of md) {
    const url = coerceUrl(m[2] ?? '')
    if (url) out.push({ url, title: (m[1] ?? '').trim() || titleFromUrl(url) })
  }
  if (out.length) return mergeSources(out)

  const hits = parseSearchHits(blob)
  if (hits.length) return hits

  for (const part of blob.split(/[;\n]+/)) {
    const piece = part.trim()
    if (!piece) continue
    const paren = piece.match(/^(.+?)\s*[（(](.+?)[）)]$/)
    const raw = (paren?.[1] ?? piece).trim()
    const hint = paren?.[2]?.trim()
    const firstTok = raw.split(/\s+/)[0] ?? raw
    const url = coerceUrl(firstTok) ?? coerceUrl(raw)
    if (!url) continue
    out.push({ url, title: hint || titleFromUrl(url) })
  }
  return mergeSources(out)
}

const SOURCE_HEAD = /(?:^|\n)\s*(?:来源(?:\s*[（(]节选[）)])?|Sources)\s*[:：]\s*/i

export function extractSourceSection(markdown: string): { body: string; sources: SourceCite[] } {
  const m = SOURCE_HEAD.exec(markdown)
  if (!m || m.index == null) return { body: markdown, sources: [] }
  const after = markdown.slice(m.index + m[0].length)
  const sources = parseMixedSourceBlob(after)
  if (sources.length === 0) return { body: markdown, sources: [] }
  const body = markdown.slice(0, m.index).replace(/\s+$/, '')
  return { body, sources }
}

/** 模型已在正文写了可链 Sources 时藏宿主表;漏写才用工具 URL 兜底 */
export function shouldShowHostSourceList(content: string, toolSources: SourceCite[]): boolean {
  if (extractSourceSection(content).sources.length > 0) return false
  return collapseSourcesBySite(toolSources).length > 0
}

export function urlFromToolArgs(args: unknown): string | null {
  let raw = args
  if (typeof raw === 'string') {
    const text = raw
    try { raw = JSON.parse(text) as unknown } catch { return coerceUrl(text) }
  }
  if (!raw || typeof raw !== 'object') return null
  const url = (raw as { url?: unknown }).url
  return typeof url === 'string' ? coerceUrl(url) : null
}

const SEARCH_TOOLS = new Set(['search_web', 'web_search'])
const PAPER_TOOLS = new Set(['search_papers', 'openalex_search', 'get_citations'])
const FETCH_TOOLS = new Set(['fetch_url', 'read_url'])

export function sourcesFromTool(
  name: string,
  args: unknown,
  llmContent: string,
): SourceCite[] {
  if (llmContent.startsWith('error:')) return []
  if (SEARCH_TOOLS.has(name)) return parseSearchHits(llmContent)
  if (PAPER_TOOLS.has(name)) return parsePaperHits(llmContent)
  if (FETCH_TOOLS.has(name)) {
    const url = urlFromToolArgs(args)
    return url ? [{ url, title: titleFromUrl(url) }] : []
  }
  return []
}

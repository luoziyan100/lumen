/**
 * [INPUT]: 链接字符串；研究网络 researchHttp（export.arxiv.org 已在白名单）与调用方取消信号
 * [OUTPUT]: arxivId（纯函数：abs/pdf/html 三种页面、版本号、旧式 hep-th/9901001、www/export 变体 → 编号，非 arXiv 为 null）、
 *           arxivPdfUrl / arxivAbsUrl；fetchArxivMeta：arXiv API 取标题、作者（前 3 位 + et al.）、年份，≤5s，失败或超时返回 null 不抛
 * [POS]: 资料库收入 arXiv 论文的识别与元数据；只读公开 API，不碰数据库与文件，失败由调用方按后续规则回退
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { ResearchHttp } from './http.ts'

const HOSTS = new Set(['arxiv.org', 'www.arxiv.org', 'export.arxiv.org'])
// 新式 2611.14235（4 或 5 位序号）与旧式 hep-th/9901001、math.AG/0601001，都可带 v<版本>
const NEW_ID = /^\d{4}\.\d{4,5}(?:v\d+)?$/
const OLD_ID = /^[a-z][a-z-]*(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?$/
export const ARXIV_TIMEOUT_MS = 5000

/** arXiv 论文链接 → 编号（保留版本号）；不是 arXiv 论文页、PDF 或 HTML 全文时返回 null */
export function arxivId(link: string | null | undefined): string | null {
  if (!link) return null
  let url: URL
  try { url = new URL(link.trim()) } catch { return null }
  if (!['http:', 'https:'].includes(url.protocol) || !HOSTS.has(url.hostname.toLowerCase())) return null
  const match = url.pathname.match(/^\/(abs|pdf|html)\/(.+?)\/?$/)
  if (!match) return null
  const id = decodeURIComponent(match[2]!).replace(/\.pdf$/i, '')
  return NEW_ID.test(id) || OLD_ID.test(id) ? id : null
}

export const arxivPdfUrl = (id: string) => `https://arxiv.org/pdf/${id}`
export const arxivAbsUrl = (id: string) => `https://arxiv.org/abs/${id}`

export interface ArxivMeta { id: string; title: string; authors: string; year: number | null }

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
function decodeXml(text: string): string {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => name[0] === '#'
      ? String.fromCodePoint(name[1]?.toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10))
      : ENTITIES[name.toLowerCase()] ?? whole)
}
const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`))?.[1]

/** 作者：前 3 位，多于 3 位加 et al. */
export function authorLine(names: readonly string[]): string {
  const clean = names.map(name => name.replace(/\s+/g, ' ').trim()).filter(Boolean)
  return clean.length > 3 ? `${clean.slice(0, 3).join(', ')} et al.` : clean.join(', ')
}

/** 解析 arXiv API 的 Atom：第一条 entry 的标题、作者与发表年份；查无此号（API 返回 Error 条目或没有 entry）为 null */
export function parseArxivAtom(xml: string, id: string): ArxivMeta | null {
  const entry = tag(xml, 'entry')
  if (!entry) return null
  const title = decodeXml(tag(entry, 'title') ?? '').replace(/\s+/g, ' ').trim()
  const entryId = decodeXml(tag(entry, 'id') ?? '')
  if (!title || title === 'Error' || /api\/errors/.test(entryId)) return null
  const authors = [...entry.matchAll(/<author(?:\s[^>]*)?>([\s\S]*?)<\/author>/g)].map(match => decodeXml(tag(match[1]!, 'name') ?? ''))
  const year = Number(tag(entry, 'published')?.trim().slice(0, 4))
  return { id, title, authors: authorLine(authors), year: Number.isInteger(year) && year > 1990 ? year : null }
}

/** arXiv API 取元数据：整体 ≤5s；网络失败、超时、非 200、查无此号都返回 null，不阻塞入库 */
export async function fetchArxivMeta(http: ResearchHttp, id: string, signal?: AbortSignal, timeoutMs = ARXIV_TIMEOUT_MS): Promise<ArxivMeta | null> {
  const bounded = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])])
  try {
    const response = await http(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}&max_results=1`, { signal: bounded })
    return parseArxivAtom(new TextDecoder().decode(response.bytes), id)
  } catch { return null }
}

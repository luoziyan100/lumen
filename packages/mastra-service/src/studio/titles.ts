/**
 * [INPUT]: PDF 字节与文件名（unpdf：文档信息与首页文字位置，已有依赖）、arXiv 元数据
 * [OUTPUT]: cleanTitle（折叠空白、去 arXiv「[编号] 」前缀、≤200 字）、usableInfoTitle（排除空、乱码、文件名、软件名）、headingTitle（首页最大字号的横排文字行）、
 *           pdfTitle（② 文档信息 Title → ③ 首页大字标题，取不到为 null）、TITLE_RANK（补取只升不降）
 * [POS]: 资料库标题的回退链（L2）中与 PDF 有关的两层；纯函数 + 一次只读解析，失败一律返回 null，由调用方回到文件名规则
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

/** 标题从哪来：arxiv（API）> info（PDF 文档信息）> heading（首页大字）> file（文件名）；page 是网页 <title>，given 是调用方显式给的 */
export type TitleSource = 'arxiv' | 'info' | 'heading' | 'file' | 'page' | 'given'
export const TITLE_RANK: Record<TitleSource, number> = { arxiv: 4, info: 3, heading: 2, given: 2, page: 2, file: 1 }
const MAX_TITLE = 200

/** 折叠空白，去掉 arXiv 页面标题里的「[2611.14235] 」前缀，最多 200 个字符（按字符而不是 UTF-16 单元截） */
export function cleanTitle(raw: string): string {
  const text = raw.replace(/\s+/g, ' ').trim().replace(/^\[(?:\d{4}\.\d{4,5}|[a-z][a-z-]*(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?\]\s*/, '').trim()
  return Array.from(text).slice(0, MAX_TITLE).join('').trim()
}

const SOFTWARE = /^(?:untitled(?:\s+document)?|document\d*|title|paper|main|article|report|slides?|abstract|draft|manuscript|latex|pdflatex|pdftex|tex|xetex|lualatex|acrobat|adobe\b.*|arxiv(?:\s*:.*)?|microsoft\b.*|word|powerpoint|untitled-\d+)$/i
const OFFICE = /^(?:microsoft\s+)?(?:word|powerpoint|excel)\s+-\s+/i
const FILE_LIKE = /\.(?:pdf|docx?|tex|dvi|ps|pptx?|rtf|txt|md|odt|pages)$/i

/** 乱码：替换符、控制字符、UTF-16 BOM 残留（þÿ），或字母占比过低、少于 3 个字母 */
function garbled(text: string): boolean {
  if (/[�\u0000-\u0008\u000B\u000C\u000E-\u001F]|þÿ|ÿþ/.test(text)) return true
  const visible = text.replace(/\s/g, '')
  const letters = visible.match(/\p{L}/gu)?.length ?? 0
  return letters < 3 || letters / visible.length < 0.5
}

/** PDF 文档信息里的 Title 能不能当标题：排除空、乱码、明显是文件名或软件名的值 */
export function usableInfoTitle(raw: unknown, fileName: string): string | null {
  if (typeof raw !== 'string') return null
  const title = cleanTitle(raw)
  if (!title || garbled(title) || SOFTWARE.test(title) || OFFICE.test(title) || FILE_LIKE.test(title)) return null
  const stem = fileName.replace(/\.[^.]+$/, '').toLowerCase()
  if (title.toLowerCase() === stem || title.toLowerCase() === fileName.toLowerCase()) return null
  if (/^[^\s]*[/\\][^\s]*$/.test(title)) return null   // 无空格的路径
  return title
}

export interface TextItem { str: string; transform: number[] }

/** 首页最大字号的横排文字（旋转的侧边水印不算），同字号的相邻行按阅读顺序拼起来 */
export function headingTitle(items: readonly TextItem[]): string | null {
  const horizontal = items.filter(item => item.str.trim() && Math.abs(item.transform[1] ?? 0) < 1e-6 && Math.abs(item.transform[2] ?? 0) < 1e-6)
    .map(item => ({ text: item.str, size: Math.hypot(item.transform[2] ?? 0, item.transform[3] ?? 0), x: item.transform[4] ?? 0, y: item.transform[5] ?? 0 }))
  if (!horizontal.length) return null
  const largest = Math.max(...horizontal.map(item => item.size))
  const lines = horizontal.filter(item => item.size >= largest - 0.5).sort((a, b) => b.y - a.y || a.x - b.x)
  const title = cleanTitle(lines.map(item => item.text).join(' '))
  return title && !garbled(title) && !/^arxiv\s*:/i.test(title) ? title : null
}

/** ② 文档信息 Title → ③ 首页大字；解析失败或都取不到返回 null（调用方回到文件名） */
export async function pdfTitle(bytes: Uint8Array, fileName: string): Promise<{ title: string; source: 'info' | 'heading' } | null> {
  try {
    const { getDocumentProxy, getMeta } = await import('unpdf')
    const document = await getDocumentProxy(new Uint8Array(bytes))
    try {
      const info = usableInfoTitle((await getMeta(document)).info?.Title, fileName)
      if (info) return { title: info, source: 'info' }
      if (document.numPages < 1) return null
      const content = await (await document.getPage(1)).getTextContent()
      const items = (content.items as unknown[]).filter((item): item is TextItem => !!item && typeof item === 'object' && 'str' in item && 'transform' in item && Array.isArray(item.transform))
      const heading = headingTitle(items)
      return heading ? { title: heading, source: 'heading' } : null
    } finally { await document.destroy() }
  } catch { return null }
}

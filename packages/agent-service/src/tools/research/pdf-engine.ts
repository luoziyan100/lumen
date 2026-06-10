/**
 * [INPUT]: unpdf（Node 版 pdf.js 封装，零原生依赖）
 * [OUTPUT]: createUnpdfEngine —— PdfTextEngine（bytes → 正文文本）
 * [POS]: §5.3 extract_pdf 的真实引擎。沿用 old_lumen 的 pdf.js 路线，搬到无头 Node
 *
 * 单列一个文件，让 unpdf 这个重依赖只在真正用到时加载；测试可直接对它喂 fixture PDF。
 */
import type { PdfTextEngine } from './pdf.ts'

export function createUnpdfEngine(): PdfTextEngine {
  return async (bytes: Uint8Array): Promise<string> => {
    const { getDocumentProxy, extractText } = await import('unpdf')
    const pdf = await getDocumentProxy(bytes)
    const { text } = await extractText(pdf, { mergePages: true })
    return Array.isArray(text) ? text.join('\n') : text
  }
}

/**
 * [OUTPUT]: createResearchTools —— 测试/脚本用的研究工具拼装(不含 search_web)
 * [POS]: §5.3 入口。papers / fetch_url / extract_pdf。search_web 只由 registry 接入,
 *        以便删除该单元时受影响文件 = 本体 + registry.ts。
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { Tool } from '../../core/tool.ts'
import { fetchHttp, type HttpClient } from './http.ts'
import { createPaperTools } from './papers.ts'
import { createFetchUrlTool } from './fetch-url.ts'
import { createPdfTools, type PdfTextEngine } from './pdf.ts'

export interface ResearchToolDeps {
  http?: HttpClient
  pdfEngine?: PdfTextEngine
}

export function createResearchTools(deps: ResearchToolDeps = {}): Tool[] {
  const http = deps.http ?? fetchHttp()
  return [
    ...createPaperTools({ http }),
    createFetchUrlTool({ http }),
    ...createPdfTools({ engine: deps.pdfEngine, http }),
  ]
}

export { htmlToText } from './fetch-url.ts'
export { buildSearchUrl, parseSearchResponse, rankPapers, formatPapers, type PaperRecord } from './papers.ts'
export { journalRank } from './journal-ranks.ts'
export { createUnpdfEngine } from './pdf-engine.ts'
export { type PdfTextEngine } from './pdf.ts'
export type { HttpClient, HttpResponse } from './http.ts'

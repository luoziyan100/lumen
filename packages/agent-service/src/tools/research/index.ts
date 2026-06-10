/**
 * [OUTPUT]: createResearchTools —— 组装 L2 研究桥接工具集
 * [POS]: §5.3 入口。注入 http / Tavily web 后端 / pdf 引擎，产出 search_papers/get_citations/fetch_url/search_web/extract_pdf
 */
import type { Tool } from '../../core/tool.ts'
import { fetchHttp, type HttpClient } from './http.ts'
import { createPaperTools } from './papers.ts'
import { createWebTools, type WebSearchBackend } from './web.ts'
import { createPdfTools, type PdfTextEngine } from './pdf.ts'

export interface ResearchToolDeps {
  http?: HttpClient
  webSearch?: WebSearchBackend
  pdfEngine?: PdfTextEngine
}

export function createResearchTools(deps: ResearchToolDeps = {}): Tool[] {
  const http = deps.http ?? fetchHttp()
  return [
    ...createPaperTools({ http }),
    ...createWebTools({ http, webSearch: deps.webSearch }),
    ...createPdfTools({ engine: deps.pdfEngine, http }),
  ]
}

export { htmlToText, createTavilyWebSearch, parseTavily, type WebSearchBackend, type WebSearchHit } from './web.ts'
export { buildSearchUrl, parseSearchResponse, rankPapers, formatPapers, type PaperRecord } from './papers.ts'
export { journalRank } from './journal-ranks.ts'
export { createUnpdfEngine } from './pdf-engine.ts'
export { type PdfTextEngine } from './pdf.ts'
export type { HttpClient, HttpResponse } from './http.ts'

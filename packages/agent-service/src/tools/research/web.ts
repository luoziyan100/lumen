/**
 * [INPUT]: http.ts、core Tool
 * [OUTPUT]: htmlToText（纯）、createWebTools —— fetch_url / search_web
 * [POS]: §5.3 研究桥接。fetch_url 抓网页转正文写入工作区；search_web 走可注入后端（需 API key）
 */
import type { Tool, ToolResult } from '../../core/tool.ts'
import { fetchHttp, type HttpClient } from './http.ts'

const FETCH_MAX_CHARS = 20_000

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|h[1-6]|li|br|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export interface WebSearchHit {
  title: string
  url: string
  snippet?: string
}

/** 可注入的 web 搜索后端（生产接 Tavily；缺省返回未配置） */
export type WebSearchBackend = (query: string, signal?: AbortSignal) => Promise<WebSearchHit[]>

interface TavilyResult {
  title?: string
  url?: string
  content?: string
}

export function parseTavily(json: unknown): WebSearchHit[] {
  const results = (json as { results?: TavilyResult[] })?.results ?? []
  return results
    .filter((r) => r?.title && r?.url)
    .map((r) => ({ title: String(r.title), url: String(r.url), snippet: r.content ? String(r.content) : undefined }))
}

/** Tavily Search 后端（搬自 old_lumen web.rs：POST /search, Bearer, search_depth basic） */
export function createTavilyWebSearch(options: { apiKey: string; http?: HttpClient; baseUrl?: string; maxResults?: number }): WebSearchBackend {
  const http = options.http ?? fetchHttp()
  const url = `${(options.baseUrl ?? 'https://api.tavily.com').replace(/\/$/, '')}/search`
  return async (query, signal) => {
    const res = await http(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${options.apiKey}` },
      body: JSON.stringify({
        query,
        max_results: Math.min(Math.max(1, options.maxResults ?? 10), 20),
        include_answer: false,
        search_depth: 'basic',
      }),
      signal,
    })
    if (!res.ok) throw new Error(`Tavily 搜索失败 (${res.status})`)
    return parseTavily(await res.json())
  }
}

export function createWebTools(deps: { http: HttpClient; webSearch?: WebSearchBackend }): Tool[] {
  const fetchUrl: Tool = {
    spec: {
      name: 'fetch_url',
      description: '抓取一个网页/开放论文链接的正文文本（HTML 转纯文本）。可写入工作区。',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string' }, save_as: { type: 'string', description: '可选：写入工作区的路径' } },
        required: ['url'],
      },
    },
    run: async (args, ctx, signal): Promise<ToolResult> => {
      try {
        const res = await deps.http(String(args.url), { signal })
        if (!res.ok) return { llmContent: `error: fetch_url 失败 (${res.status})` }
        const text = htmlToText(await res.text())
        if (args.save_as && ctx.workspace) {
          await ctx.workspace.writeFile(String(args.save_as), text).catch(() => {})
        }
        const shown = text.length > FETCH_MAX_CHARS ? `${text.slice(0, FETCH_MAX_CHARS)}\n…[截断，共 ${text.length} 字符]` : text
        return { llmContent: shown, data: { chars: text.length } }
      } catch (error) {
        return { llmContent: `error: ${error instanceof Error ? error.message : String(error)}` }
      }
    },
  }

  const searchWeb: Tool = {
    spec: {
      name: 'search_web',
      description: '网页搜索，返回标题/链接/摘要。需配置搜索后端。',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    },
    run: async (args, _ctx, signal): Promise<ToolResult> => {
      if (!deps.webSearch) return { llmContent: 'error: search_web 后端未配置（需 API key）。可改用 search_papers 或 fetch_url。' }
      try {
        const hits = await deps.webSearch(String(args.query), signal)
        if (hits.length === 0) return { llmContent: '(无结果)' }
        const text = hits.map((h, i) => `${i + 1}. ${h.title}\n   ${h.url}${h.snippet ? `\n   ${h.snippet}` : ''}`).join('\n')
        return { llmContent: text, data: { hits } }
      } catch (error) {
        return { llmContent: `error: ${error instanceof Error ? error.message : String(error)}` }
      }
    },
  }

  return [fetchUrl, searchWeb]
}

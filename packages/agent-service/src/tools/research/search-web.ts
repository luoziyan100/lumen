/**
 * [INPUT]: http.ts、core Tool、sources-reminder
 * [OUTPUT]: createSearchWebTool / createTavilyWebSearch / parseTavily / WebSearchBackend
 * [POS]: research/ 可独立删除的搜索单元。依赖可注入后端(生产 Tavily key);与 fetch_url 分家。
 *        description 学 Claude 方法;Sources 只回指 persona「#检索之后」。
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { Tool, ToolResult } from '../../core/tool.ts'
import { fetchHttp, type HttpClient } from './http.ts'
import { withSourcesReminder } from './sources-reminder.ts'

function searchWebDescription(year: number): string {
  return `网页搜索：按关键词查公开网页，返回标题 / URL / 摘要。

何时用：需要知识截止日期之后的网页、文档、新闻、项目主页、博客。
何时改用兄弟工具：学术论文、DOI、引用网络 → search_papers / get_citations；已有确定 URL → fetch_url；源是 PDF → extract_pdf。

结果：编号列表（标题、链接、摘要）。无结果返回「(无结果)」。后端未配置时返回错误，可改用 search_papers 或 fetch_url。

Sources：答末按系统提示「#检索之后」列答复站在的作品（论文 / 仓库根 / 论及的页面），不要列出本次搜索的每个 URL，也不要把随后 fetch_url 的文件路径倒进去。

用法：
- 必须已配置搜索后端（Tavily API key）；未配置会失败。
- 查近况、文档、时事时，查询里写 ${year}，不要用过期年份。系统提示里有今天的日期。`
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

export function createSearchWebTool(deps: { webSearch?: WebSearchBackend } = {}): Tool {
  return {
    spec: {
      name: 'search_web',
      description: searchWebDescription(new Date().getFullYear()),
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索词。查近况、文档、时事时带上当前年份。' },
        },
        required: ['query'],
      },
    },
    run: async (args, _ctx, signal): Promise<ToolResult> => {
      if (!deps.webSearch) return { llmContent: 'error: search_web 后端未配置（需 API key）。可改用 search_papers 或 fetch_url。' }
      try {
        const hits = await deps.webSearch(String(args.query), signal)
        if (hits.length === 0) return { llmContent: withSourcesReminder('(无结果)') }
        const text = hits.map((h, i) => `${i + 1}. ${h.title}\n   ${h.url}${h.snippet ? `\n   ${h.snippet}` : ''}`).join('\n')
        return { llmContent: withSourcesReminder(text), data: { hits } }
      } catch (error) {
        return { llmContent: `error: ${error instanceof Error ? error.message : String(error)}` }
      }
    },
  }
}

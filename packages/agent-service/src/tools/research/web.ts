/**
 * [INPUT]: http.ts、core Tool
 * [OUTPUT]: htmlToText（纯）、createWebTools —— fetch_url / search_web
 * [POS]: §5.3 研究桥接。fetch_url 抓网页转正文写入工作区；search_web 走可注入后端（需 API key）。
 *        description 学 Claude 方法(做什么/何时用与兄弟/结果形态/Sources 回指/用法/参数 description),
 *        Sources 只回指 persona「#检索之后」作品合同,不另立法、不写「列出所有搜索 URL」。
 *        成功调用的 llmContent 末附一句 REMINDER,回指同一合同。
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { Tool, ToolResult } from '../../core/tool.ts'
import { fetchHttp, type HttpClient } from './http.ts'

const FETCH_MAX_CHARS = 20_000

/** 成功检索后回灌线程的一句:回指 persona,不立法、不倒 URL */
const SOURCES_LLM_REMINDER =
  'REMINDER: 答末 Sources 列作品，见系统提示 #检索之后；勿列本次抓取的每个文件路径。'

function withSourcesReminder(content: string): string {
  return `${content}\n${SOURCES_LLM_REMINDER}`
}

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

const FETCH_URL_PROMPT = `抓取一个已确定的网页或开放 HTML 论文链接，转成纯文本正文。可选写入工作区。

何时用：已有 URL，需要读正文。
何时改用兄弟工具：还不知道 URL → search_web；学术检索 → search_papers；源是 PDF（.pdf 或明确 PDF 字节）→ extract_pdf，不要用本工具硬拆 PDF。

结果：HTML 去标签后的正文；超长截断并注明总字符数。save_as 成功时文件已在工作区，回灌的是正文，不是路径清单。

Sources：答末按系统提示「#检索之后」列答复站在的作品，不列本次抓到的每个路径。

用法：
- url 必须是完整 http(s) URL。
- save_as 为工作区相对路径；省略则只回灌正文、不落盘。`

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
      description: FETCH_URL_PROMPT,
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '完整 http(s) URL' },
          save_as: { type: 'string', description: '可选：写入工作区的相对路径；省略则只回灌正文' },
        },
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
        return { llmContent: withSourcesReminder(shown), data: { chars: text.length } }
      } catch (error) {
        return { llmContent: `error: ${error instanceof Error ? error.message : String(error)}` }
      }
    },
  }

  const searchWeb: Tool = {
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

  return [fetchUrl, searchWeb]
}

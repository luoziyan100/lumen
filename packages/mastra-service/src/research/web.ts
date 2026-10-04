/**
 * [INPUT]: Mastra createTool、研究网络、当前任务 Workspace
 * [OUTPUT]: createWebTools：fetch_url/search_web 与网页正文提取
 * [POS]: 公开网页资料接入；保存结果必须真实成功，Tavily 凭证只用于该服务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import type { ResearchHttp } from './http.ts'

export function htmlToText(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ').replace(/<\/(p|div|h[1-6]|li|tr)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

export function createWebTools(http: ResearchHttp, tavilyKey?: string) {
  return {
    fetch_url: createTool({
      id: 'fetch_url', description: '读取已知公开网页的正文；PDF 用 extract_pdf。save_as 可保存全文到工作区，offset/limit 分段读取；引用原网页，不能只凭开头概括全文。',
      inputSchema: z.object({ url: z.string().url(), save_as: z.string().min(1).optional(), offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(20000).default(20000) }),
      execute: async ({ url, save_as, offset, limit }, context) => {
        const result = await http(url, { signal: context?.abortSignal })
        const raw = new TextDecoder().decode(result.bytes)
        if (result.contentType.includes('application/pdf') || raw.startsWith('%PDF-')) throw new Error('PDF source: use extract_pdf')
        const text = result.contentType.includes('html') || /<html/i.test(raw) ? htmlToText(raw) : raw
        if (save_as) {
          if (!context?.workspace?.filesystem) throw new Error('Workspace is required to save the document')
          await context.workspace.filesystem.writeFile(save_as, text)
        }
        return { source: result.url, content: text.slice(offset, offset + limit), totalChars: text.length, offset, truncated: offset + limit < text.length, savedAs: save_as }
      },
    }),
    search_web: createTool({
      id: 'search_web', description: '检索公开网页、文档、新闻，返回标题、来源 URL 与摘要。需要已配置 Tavily；学术论文优先 search_papers。',
      inputSchema: z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(20).default(10) }),
      execute: async ({ query, limit }, context) => {
        if (!tavilyKey) throw new Error('Web search is not configured; use search_papers or fetch_url')
        const result = await http('https://api.tavily.com/search', { method: 'POST', signal: context?.abortSignal,
          headers: { 'content-type': 'application/json', authorization: `Bearer ${tavilyKey}` },
          body: JSON.stringify({ query, max_results: limit, include_answer: false, search_depth: 'basic' }),
        })
        const body = z.object({ results: z.array(z.object({ title: z.string(), url: z.string().url(), content: z.string().optional() })) })
          .safeParse(JSON.parse(new TextDecoder().decode(result.bytes)))
        if (!body.success) throw new Error('Invalid web search response')
        return { hits: body.data.results }
      },
    }),
  }
}

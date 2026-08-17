/**
 * [INPUT]: http.ts、core Tool、sources-reminder
 * [OUTPUT]: htmlToText、createFetchUrlTool —— fetch_url
 * [POS]: research/ 可独立删除的抓取单元。不依赖 Tavily;已有 URL 读正文。
 *        description 学 Claude 方法;Sources 只回指 persona「#检索之后」。
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { Tool, ToolResult } from '../../core/tool.ts'
import type { HttpClient } from './http.ts'
import { withSourcesReminder } from './sources-reminder.ts'

const FETCH_MAX_CHARS = 20_000

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

export function createFetchUrlTool(deps: { http: HttpClient }): Tool {
  return {
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
}

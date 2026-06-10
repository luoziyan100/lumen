/**
 * [INPUT]: core Tool、http.ts
 * [OUTPUT]: PdfTextEngine 类型、createPdfTools —— extract_pdf
 * [POS]: §5.3 研究桥接。来源解析在工具层（URL→http / 本地→工作区沙箱二进制读），抽取交给可注入引擎
 *
 * 引擎未注入时返回清晰提示而非崩溃。本地 PDF 必经 ctx.workspace 沙箱读取，不碰任意路径。
 */
import type { Tool, ToolResult } from '../../core/tool.ts'
import type { HttpClient } from './http.ts'

/** bytes → 正文文本。生产用 createUnpdfEngine()，测试可喂 fixture */
export type PdfTextEngine = (bytes: Uint8Array) => Promise<string>

const MAX_CHARS = 20_000

export function createPdfTools(deps: { engine?: PdfTextEngine; http?: HttpClient } = {}): Tool[] {
  const extractPdf: Tool = {
    spec: {
      name: 'extract_pdf',
      description: '抽取 PDF 正文文本。source 可为 library/ 或工作区下的路径，或开放 PDF 的 http(s) URL。可写入工作区。',
      parameters: {
        type: 'object',
        properties: { source: { type: 'string' }, save_as: { type: 'string' } },
        required: ['source'],
      },
    },
    run: async (args, ctx, signal): Promise<ToolResult> => {
      if (!deps.engine) {
        return { llmContent: 'error: extract_pdf 引擎未接入。可先用 fetch_url 取 HTML 版。' }
      }
      const source = String(args.source)
      try {
        let bytes: Uint8Array
        if (/^https?:\/\//i.test(source)) {
          if (!deps.http) return { llmContent: 'error: 无 http 客户端，无法取 URL PDF' }
          const res = await deps.http(source, { signal })
          if (!res.ok) return { llmContent: `error: 取 PDF 失败 (${res.status})` }
          bytes = await res.bytes()
        } else {
          if (!ctx.workspace) return { llmContent: 'error: 无 workspace，无法读本地 PDF' }
          bytes = await ctx.workspace.readBytes(source)
        }
        const text = await deps.engine(bytes)
        if (args.save_as && ctx.workspace) await ctx.workspace.writeFile(String(args.save_as), text).catch(() => {})
        if (!text.trim()) return { llmContent: '(抽取到空文本，可能是扫描版/图片型 PDF)' }
        const shown = text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n…[截断，共 ${text.length} 字符]` : text
        return { llmContent: shown, data: { chars: text.length } }
      } catch (error) {
        return { llmContent: `error: ${error instanceof Error ? error.message : String(error)}` }
      }
    },
  }
  return [extractPdf]
}

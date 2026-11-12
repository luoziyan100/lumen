/**
 * [INPUT]: ingestion/files 的有界 Workspace 字节读取与只创建新文件保存、研究 HTTP、unpdf、可选资料库收入回调
 * [OUTPUT]: extractPdfPages/pdfText（纯函数，资料库读取共用）与 createPdfTool：保留换行、PDF 页码的全文与分段结果
 * [POS]: 文档摄取能力；本地原件只通过工作区读取，远程原件只在 to_library 时进资料库，解析资源始终释放
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { readWorkspaceBytes, relativeFile, saveWorkspaceText } from '../ingestion/files.ts'
import type { ResearchHttp } from './http.ts'
import type { LibraryIntake } from './intake.ts'

export const MAX_PDF_BYTES = 25 * 1024 * 1024

/** 逐页抽取正文；扫描版的空页保留为空字符串，页码与数组下标 +1 对应。 */
export async function extractPdfPages(bytes: Uint8Array, signal?: AbortSignal): Promise<string[]> {
  if (bytes.length > MAX_PDF_BYTES) throw new Error('PDF exceeds 25 MB')
  signal?.throwIfAborted()
  const { getDocumentProxy, extractText } = await import('unpdf')
  const document = await getDocumentProxy(new Uint8Array(bytes))
  try {
    const result = await extractText(document, { mergePages: false })
    signal?.throwIfAborted()
    return result.text
  } finally { await document.destroy() }
}

/** 带页码标记的全文；整份都没有文字时返回空串，调用方如实说明，不编造。 */
export function pdfText(pages: readonly string[], first = 1): string {
  return pages.some(page => page.trim()) ? pages.map((page, index) => `[PDF page ${first + index}]\n${page}`).join('\n\n') : ''
}

export function createPdfTool(http: ResearchHttp, intake?: LibraryIntake) {
  return createTool({
    id: 'extract_pdf', description: '从工作区相对路径或公开 PDF URL 提取正文。offset/limit 支持分段读取，save_as 把全文存进工作区；to_library=true 把远程 PDF 收进资料库并引用到当前主题（要作为白板出处时用）；扫描版可能无文本，不得编造内容。引用 PDF 原来源。已在资料库的材料用 read_material。',
    inputSchema: z.object({ source: z.string().min(1), save_as: z.string().min(1).optional(), to_library: z.boolean().default(false), offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(20000).default(20000) }),
    execute: async ({ source, save_as, to_library, offset, limit }, context) => {
      const workspace = context?.workspace
      const filesystem = workspace?.filesystem
      const remote = /^https?:\/\//i.test(source)
      if (!remote && !filesystem) throw new Error('Workspace is required to read a local PDF')
      if (!remote && save_as && relativeFile(save_as) === relativeFile(source)) throw new Error('抽取输出不得覆盖原始 PDF')
      if (to_library && !remote) throw new Error('to_library 只用于远程 PDF；工作区里的文件已经在主题里')
      const response = remote ? await http(source, { signal: context?.abortSignal }) : undefined
      const bytes = response ? response.bytes : await readWorkspaceBytes(workspace!, source, MAX_PDF_BYTES, context?.abortSignal)
      if (!bytes || typeof bytes === 'string') throw new Error('A binary PDF in the workspace is required')
      const pages = await extractPdfPages(bytes, context?.abortSignal)
      const text = pdfText(pages)
      if (save_as) {
        if (!filesystem) throw new Error('Workspace is required to save PDF text')
        await saveWorkspaceText(workspace!, save_as, text, context?.abortSignal)
      }
      let library: Awaited<ReturnType<LibraryIntake>> | undefined
      if (to_library) {
        if (!intake) throw new Error('当前环境没有资料库')
        const name = decodeURIComponent(new URL(response!.url).pathname.split('/').filter(Boolean).pop() ?? '') || 'document.pdf'
        library = await intake(context, { name: name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`, bytes, sourceUrl: response!.url, kind: 'pdf' })
      }
      return { source, totalPages: pages.length, content: text.slice(offset, offset + limit), totalChars: text.length, offset, truncated: offset + limit < text.length, savedAs: save_as, empty: !text.trim(),
        ...(library ? { libraryItemId: library.itemId, libraryTitle: library.title } : {}) }
    },
  })
}

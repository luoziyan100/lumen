/**
 * [INPUT]: ingestion/files 的有界 Workspace 字节读取与只创建新文件保存、研究 HTTP、unpdf
 * [OUTPUT]: createPdfTool：保留换行、PDF 页码的全文与分段结果
 * [POS]: 文档摄取能力；本地原件只通过工作区读取，解析资源始终释放
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from 'node:crypto'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { readWorkspaceBytes, relativeFile, saveWorkspaceText } from '../ingestion/files.ts'
import type { ResearchHttp } from './http.ts'

const MAX_PDF_BYTES = 25 * 1024 * 1024

export function createPdfTool(http: ResearchHttp) {
  return createTool({
    id: 'extract_pdf', description: '从工作区相对路径或公开 PDF URL 提取正文。offset/limit 支持分段读取，save_as 可保存全文；扫描版可能无文本，不得编造内容。引用 PDF 原来源。',
    inputSchema: z.object({ source: z.string().min(1), save_as: z.string().min(1).optional(), offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(20000).default(20000) }),
    execute: async ({ source, save_as, offset, limit }, context) => {
      const workspace = context?.workspace
      const filesystem = workspace?.filesystem
      const remote = /^https?:\/\//i.test(source)
      if (!remote && !filesystem) throw new Error('Workspace is required to read a local PDF')
      if (!remote && save_as && relativeFile(save_as) === relativeFile(source)) throw new Error('抽取输出不得覆盖原始 PDF')
      const bytes = remote
        ? (await http(source, { signal: context?.abortSignal })).bytes
        : await readWorkspaceBytes(workspace!, source, MAX_PDF_BYTES, context?.abortSignal)
      if (!bytes || typeof bytes === 'string') throw new Error('A binary PDF in the workspace is required')
      if (bytes.length > MAX_PDF_BYTES) throw new Error('PDF exceeds 25 MB')
      context?.abortSignal?.throwIfAborted()
      const { getDocumentProxy, extractText } = await import('unpdf')
      const document = await getDocumentProxy(new Uint8Array(bytes))
      try {
        const result = await extractText(document, { mergePages: false })
        context?.abortSignal?.throwIfAborted()
        let pdfAsset = remote ? undefined : source
        if (remote && filesystem && !filesystem.readOnly) {
          pdfAsset = `papers/${createHash('sha256').update(bytes).digest('hex').slice(0, 24)}.pdf`
          await filesystem.writeFile(pdfAsset, bytes)
        }
        const pages = result.text
        const text = pages.some(page => page.trim())
          ? pages.map((page, index) => `[PDF page ${index + 1}]\n${page}`).join('\n\n') : ''
        if (save_as) {
          if (!filesystem) throw new Error('Workspace is required to save PDF text')
          await saveWorkspaceText(workspace!, save_as, text, context?.abortSignal)
        }
        return { source, pdfAsset, totalPages: result.totalPages, content: text.slice(offset, offset + limit), totalChars: text.length, offset, truncated: offset + limit < text.length, savedAs: save_as, empty: !text.trim() }
      } finally { await document.destroy() }
    },
  })
}

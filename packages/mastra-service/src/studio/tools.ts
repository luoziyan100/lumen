/**
 * [INPUT]: the studio stores, the trusted topic resolver, research/pdf's per-page extraction, research/arxiv's link detection, the research network (arXiv intake), ingestion's DOCX text extraction
 * [OUTPUT]: createMaterialAccess (opens only originals this topic references; pages = the PDF page cache; text = a non-PDF material's plain text; intake into the library, arXiv sources always as PDF with metadata),
 *           createMaterialTools: list_materials/read_material
 * [POS]: the model's only way into the library; the topic always derives from the session identity and never from parameters. The reference list is the boundary (R15),
 *        and reading advances this topic's progress. reading-tools checks quotes against the same page cache and text, so a quote is checked against exactly what the model read
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { createTool, type ToolExecutionContext } from '@mastra/core/tools'
import { z } from 'zod'
import { extractDocxText } from '../ingestion/docx.ts'
import { arxivId } from '../research/arxiv.ts'
import type { ResearchHttp } from '../research/http.ts'
import type { LibraryIntake } from '../research/intake.ts'
import { extractPdfPages, pdfText } from '../research/pdf.ts'
import { notReferenced, StudioError } from './errors.ts'
import type { Studio } from './studio.ts'
import type { LibraryItem } from './types.ts'

export type TopicResolver = (context: { requestContext?: ToolExecutionContext['requestContext'] } | undefined) => string

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const TEXT = /^(text\/|application\/(json|xml|x-yaml|yaml|csv))/
const IMAGE = /^image\/(png|jpeg|gif|webp)$/

export function createMaterialAccess(studio: Studio, topicOf: TopicResolver, http: ResearchHttp) {
  // ---- The same PDF is read page by page again and again: cache the extraction by content hash, keep at most 8 ----
  const pdfCache = new Map<string, Promise<string[]>>()
  function pages(item: LibraryItem, bytes: Uint8Array, signal?: AbortSignal) {
    let cached = pdfCache.get(item.sha256)
    if (!cached) {
      cached = extractPdfPages(bytes, signal)
      pdfCache.set(item.sha256, cached)
      void cached.catch(() => pdfCache.delete(item.sha256))
      while (pdfCache.size > 8) pdfCache.delete(pdfCache.keys().next().value!)
    }
    return cached
  }

  /** Only materials this topic references (R15); unreferenced and missing get the same sentence, so nothing leaks about other topics. */
  async function open(context: Parameters<TopicResolver>[0], itemId: string) {
    const topicId = topicOf(context)
    if (!studio.topics.isReferenced(topicId, itemId)) throw notReferenced(itemId)
    const item = studio.library.get(itemId)
    return { topicId, item, bytes: await studio.library.read(item) }
  }

  /** Plain text of a non-PDF material (DOCX, text, web text); images and other binaries are refused with the next step to take. */
  async function text(item: LibraryItem, bytes: Uint8Array, signal?: AbortSignal) {
    if (IMAGE.test(item.mediaType)) throw new StudioError(`「${item.title}」是图片，用 look_at_image({ itemId: "${item.id}" }) 看`, 400, 'material.is_image', { title: item.title })
    if (item.mediaType === DOCX) return extractDocxText(bytes, signal)
    if (TEXT.test(item.mediaType) || item.kind === 'web') return new TextDecoder().decode(bytes)
    throw new StudioError(`「${item.title}」（${item.mediaType}）不是能直接读的文本格式`, 400, 'material.not_text', { title: item.title, mediaType: item.mediaType })
  }

  /** Research intake: an arXiv paper (abs/html page or PDF link) is always stored as PDF — PDF bytes already fetched are reused, a web page's text is dropped for the PDF (L1). */
  const intake: LibraryIntake = async (context, input) => {
    const topicId = topicOf(context)
    const paper = arxivId(input.sourceUrl)
    const pdfBytes = input.kind === 'pdf' && Buffer.from(input.bytes.subarray(0, 5)).toString('latin1') === '%PDF-' ? input.bytes : undefined
    const { item, created } = paper
      ? await studio.library.addArxiv(paper, http, 'ai', context?.abortSignal, pdfBytes)
      : await studio.library.add({ ...input, addedBy: 'ai' })
    studio.topics.reference(topicId, item.id)
    return { itemId: item.id, title: item.title, created }
  }

  return { open, pages, text, intake }
}

export function createMaterialTools(access: ReturnType<typeof createMaterialAccess>, studio: Studio, topicOf: TopicResolver) {
  return {
    list_materials: createTool({ id: 'list_materials', description: '列出当前主题引用的材料：id、标题、类型、谁带来的（you/ai）、读到哪、被白板引用几处。这就是你在这个主题里能读、能作为出处的全部材料。',
      inputSchema: z.object({}),
      execute: async (_input, context) => ({ items: studio.topics.materials(topicOf(context)).map(item => ({
        id: item.id, title: item.title, kind: item.kind, mediaType: item.mediaType, addedBy: item.addedBy, sourceUrl: item.sourceUrl,
        readProgress: Math.round(item.readProgress * 100) / 100, citedBy: item.citedBy })) }),
    }),
    read_material: createTool({ id: 'read_material', description: '读当前主题引用的一份材料。PDF 可按 page 读单页（带页码，适合作出处），或用 offset/limit 分段读全文；DOCX、Markdown、网页正文用 offset/limit。图片用 look_at_image({ itemId })。作为白板出处时写 { itemId, page }。',
      inputSchema: z.object({ itemId: z.string().min(1).max(128), page: z.number().int().min(1).optional(), offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(20000).default(20000) }),
      execute: async ({ itemId, page, offset, limit }, context) => {
        const { topicId, item, bytes } = await access.open(context, itemId)
        const base = { itemId: item.id, title: item.title, kind: item.kind }
        if (item.mediaType === 'application/pdf') {
          const all = await access.pages(item, bytes, context?.abortSignal)
          if (page !== undefined) {
            if (page > all.length) throw new StudioError(`这份 PDF 只有 ${all.length} 页`, 400, 'material.pdf_pages', { pages: all.length })
            studio.topics.setProgress(topicId, item.id, page / all.length)
            const text = pdfText([all[page - 1]!], page)
            return { ...base, page, totalPages: all.length, content: text.slice(offset, offset + limit), totalChars: text.length, offset, truncated: offset + limit < text.length, empty: !text.trim() }
          }
          const text = pdfText(all)
          studio.topics.setProgress(topicId, item.id, text.length ? Math.min(text.length, offset + limit) / text.length : 1)
          return { ...base, totalPages: all.length, content: text.slice(offset, offset + limit), totalChars: text.length, offset, truncated: offset + limit < text.length, empty: !text.trim() }
        }
        const text = await access.text(item, bytes, context?.abortSignal)
        studio.topics.setProgress(topicId, item.id, text.length ? Math.min(text.length, offset + limit) / text.length : 1)
        return { ...base, content: text.slice(offset, offset + limit), totalChars: text.length, offset, truncated: offset + limit < text.length }
      },
    }),
  }
}

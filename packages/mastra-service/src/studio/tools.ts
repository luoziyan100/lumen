/**
 * [INPUT]: studio 存储、受信主题解析、research/pdf 的逐页抽取、research/arxiv 的链接识别、研究网络（arXiv 收入用）、ingestion 的 DOCX 正文抽取
 * [OUTPUT]: createMaterialAccess（只认本主题引用的原件读取与资料库收入；arXiv 来源一律收 PDF 并带元数据）、createMaterialTools：list_materials/read_material
 * [POS]: 模型触达资料库的唯一通道；主题一律从会话身份推出，参数里没有主题。引用清单就是边界（R15），读完推进本主题的阅读进度
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createTool, type ToolExecutionContext } from '@mastra/core/tools'
import { z } from 'zod'
import { extractDocxText } from '../ingestion/docx.ts'
import { arxivId } from '../research/arxiv.ts'
import type { ResearchHttp } from '../research/http.ts'
import type { LibraryIntake } from '../research/intake.ts'
import { extractPdfPages, pdfText } from '../research/pdf.ts'
import { StudioError } from './errors.ts'
import type { Studio } from './studio.ts'
import type { LibraryItem } from './types.ts'

export type TopicResolver = (context: { requestContext?: ToolExecutionContext['requestContext'] } | undefined) => string

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const TEXT = /^(text\/|application\/(json|xml|x-yaml|yaml|csv))/
const IMAGE = /^image\/(png|jpeg|gif|webp)$/

export function createMaterialAccess(studio: Studio, topicOf: TopicResolver, http: ResearchHttp) {
  // ---- 同一份 PDF 反复分页读：按内容指纹缓存抽取结果，最多留 8 份 ----
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

  /** 只认本主题引用的材料（R15）；不在清单里与不存在给同一句话，不泄露别的主题有什么。 */
  async function open(context: Parameters<TopicResolver>[0], itemId: string) {
    const topicId = topicOf(context)
    if (!studio.topics.isReferenced(topicId, itemId)) throw new StudioError(`材料 ${itemId} 不在这个主题的引用清单里；用 list_materials 看能读哪些`, 404)
    const item = studio.library.get(itemId)
    return { topicId, item, bytes: await studio.library.read(item) }
  }

  /** 研究工具收入：arXiv 论文（模型传 abs/html 页或 PDF 链接）一律收 PDF——已取到的 PDF 字节直接用，网页正文丢弃改取 PDF（L1） */
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

  return { open, pages, intake }
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
            if (page > all.length) throw new StudioError(`这份 PDF 只有 ${all.length} 页`, 400)
            studio.topics.setProgress(topicId, item.id, page / all.length)
            const text = pdfText([all[page - 1]!], page)
            return { ...base, page, totalPages: all.length, content: text.slice(offset, offset + limit), totalChars: text.length, offset, truncated: offset + limit < text.length, empty: !text.trim() }
          }
          const text = pdfText(all)
          studio.topics.setProgress(topicId, item.id, text.length ? Math.min(text.length, offset + limit) / text.length : 1)
          return { ...base, totalPages: all.length, content: text.slice(offset, offset + limit), totalChars: text.length, offset, truncated: offset + limit < text.length, empty: !text.trim() }
        }
        if (IMAGE.test(item.mediaType)) throw new StudioError(`「${item.title}」是图片，用 look_at_image({ itemId: "${item.id}" }) 看`, 400)
        let text: string
        if (item.mediaType === DOCX) text = await extractDocxText(bytes, context?.abortSignal)
        else if (TEXT.test(item.mediaType) || item.kind === 'web') text = new TextDecoder().decode(bytes)
        else throw new StudioError(`「${item.title}」（${item.mediaType}）不是能直接读的文本格式`, 400)
        studio.topics.setProgress(topicId, item.id, text.length ? Math.min(text.length, offset + limit) / text.length : 1)
        return { ...base, content: text.slice(offset, offset + limit), totalChars: text.length, offset, truncated: offset + limit < text.length }
      },
    }),
  }
}

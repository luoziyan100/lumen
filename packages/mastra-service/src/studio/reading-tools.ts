/**
 * [INPUT]: the reading store and its shared input shape and quote rule, material access (R15 open, the PDF page cache, plain text), the board's trusted writer (topic, conversation, run)
 * [OUTPUT]: createReadingTools: reading_view (the reading of one referenced material: section ids, titles, paragraphs) and reading_write (append, or replace a section by id)
 * [POS]: the AI's only way to write a reading. The program checks only what would break a promise — the material is this topic's (R15), every paper quote occurs on the cited page
 *        of exactly the text read_material returns, and the caps; what to write and how deep is the model's call. Main agent only; refusals name the paragraph to fix
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import type { BoardWriter } from './board-tools.ts'
import { notReferenced, StudioError } from './errors.ts'
import { normalizeQuote, quoteFound, READING_LIMITS, readingInput, type ReadingInput } from './reading.ts'
import type { Studio } from './studio.ts'
import type { createMaterialAccess, TopicResolver } from './tools.ts'

type Access = ReturnType<typeof createMaterialAccess>

const PDF = 'application/pdf'

/** Every paper source must quote the material verbatim (whitespace aside): on its page for a PDF, anywhere in the text otherwise. Pages and text load once per call. */
async function checkQuotes(access: Access, opened: Awaited<ReturnType<Access['open']>>, input: ReadingInput, signal?: AbortSignal) {
  const { item, bytes } = opened
  let pages: string[] | undefined, text: string | undefined
  for (const [index, paragraph] of input.paragraphs.entries()) {
    if (paragraph.source.kind !== 'paper') continue
    const n = index + 1, { page } = paragraph.source, quote = normalizeQuote(paragraph.source.quote)
    if (quote.length < READING_LIMITS.quoteMin)
      throw new StudioError(`第 ${n} 段的引文只有 ${quote.length} 字，至少 ${READING_LIMITS.quoteMin} 字才核对得了；摘长一点，或把这段标成 inference`, 400, 'reading.quote_too_short', { paragraph: n, min: READING_LIMITS.quoteMin })
    if (item.mediaType === PDF) {
      if (page === undefined) throw new StudioError(`第 ${n} 段引的是 PDF，要写 page（引文所在的页码）`, 400, 'reading.page_required', { paragraph: n })
      pages ??= await access.pages(item, bytes, signal)
      if (page > pages.length) throw new StudioError(`第 ${n} 段写的是第 ${page} 页，这份 PDF 只有 ${pages.length} 页`, 400, 'reading.page_out_of_range', { paragraph: n, page, pages: pages.length })
      if (!quoteFound(pages[page - 1]!, quote))
        throw new StudioError(`第 ${n} 段的引文不在第 ${page} 页上。用 read_material({ itemId: "${item.id}", page: ${page} }) 读那一页，照原文一字不差地摘一句（空白可以不同）；找不到原句就把这段标成 inference`, 400, 'reading.quote_not_on_page', { paragraph: n, page })
    } else {
      if (page !== undefined) throw new StudioError(`第 ${n} 段写了 page，但「${item.title}」没有页码；省掉 page`, 400, 'reading.page_not_applicable', { paragraph: n })
      text ??= await access.text(item, bytes, signal)
      if (!quoteFound(text, quote))
        throw new StudioError(`第 ${n} 段的引文在「${item.title}」里找不到。用 read_material 读到原句，照原文一字不差地摘（空白可以不同）；找不到原句就把这段标成 inference`, 400, 'reading.quote_not_in_text', { paragraph: n })
    }
  }
}

export function createReadingTools(studio: Studio, access: Access, topicOf: TopicResolver, writer: BoardWriter) {
  return {
    reading_view: createTool({ id: 'reading_view', description: '看这个主题里一份材料已有的解读：每节的 id、标题和段落（含出处）。续写或改写之前先看；还没有解读时 sections 是空的。',
      inputSchema: z.object({ itemId: z.string().min(1).max(128) }),
      execute: async ({ itemId }, context) => {
        const topicId = topicOf(context)
        if (!studio.topics.isReferenced(topicId, itemId)) throw notReferenced(itemId)
        const reading = studio.readings.view(topicId, itemId)
        return { itemId, sections: reading?.sections.map(section => ({ id: section.id, title: section.title, paragraphs: section.paragraphs.map(({ text, source }) => ({ text, source })) })) ?? [],
          limits: { sections: READING_LIMITS.sections, paragraphs: READING_LIMITS.paragraphs, paragraphChars: READING_LIMITS.paragraphChars } }
      },
    }),
    reading_write: createTool({ id: 'reading_write',
      description: `为本主题引用的一份材料写一节解读。不给 sectionId 就接在最后，给了就把那一节整节换掉。每段 { text, source }：source 是 { kind: "paper", page, quote }（quote 是那一页上的原文短引，至少 ${READING_LIMITS.quoteMin} 字；材料没有页码时省掉 page）或 { kind: "inference" }（你自己的理解、串联或评价）。服务逐条核对引文，对不上会拒绝并说明是哪一段。最多 ${READING_LIMITS.sections} 节，每节最多 ${READING_LIMITS.paragraphs} 段，每段最多 ${READING_LIMITS.paragraphChars} 字。写好一节就调一次，用户会先读起来。`,
      inputSchema: readingInput.extend({ itemId: z.string().min(1).max(128) }),
      execute: async ({ itemId, ...input }, context) => {
        // Open first: an unreferenced item is refused with read_material's sentence before any quote is looked at (R15)
        const opened = await access.open(context, itemId)
        await checkQuotes(access, opened, input, context?.abortSignal)
        const { topicId, threadId, runId } = await writer(context)
        const result = studio.readings.write(topicId, itemId, input, { threadId, runId })
        return { sectionId: result.sectionId, replaced: result.replaced, sections: result.reading.sections.length, title: input.title }
      },
    }),
  }
}

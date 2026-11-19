/**
 * [INPUT]: the reading store and its shared block/section/insert schemas and quote rule, material access (R15 open, the PDF page cache, plain text), the board's trusted writer (topic, conversation, run)
 * [OUTPUT]: createReadingTools: reading_view (the reading of one referenced material: section ids, titles and blocks with ids), reading_write (append, or replace a section by id;
 *           supports mixed prose/table/diagram/widget blocks), and reading_insert (add one block into an existing section after a given block or at the end, for inline visual follow-ups)
 * [POS]: the AI's only way to write a reading. The program checks only what would break a promise — the material is this topic's (R15), every paper quote occurs on the cited page
 *        of exactly the text read_material returns, and the caps; what medium (text vs table/diagram/widget) and how deep is the model's call. Main agent only; refusals name the item to fix
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import type { BoardWriter } from './board-tools.ts'
import { notReferenced, StudioError } from './errors.ts'
import { normalizeQuote, quoteFound, READING_LIMITS, readingInput, readingInsertInput, type ReadingBlockInput } from './reading.ts'
import type { Studio } from './studio.ts'
import type { createMaterialAccess, TopicResolver } from './tools.ts'
import type { ReadingParagraph } from './types.ts'

type Access = ReturnType<typeof createMaterialAccess>

const PDF = 'application/pdf'

/** Every paper source must quote the material verbatim (whitespace aside): on its page for a PDF, anywhere in the text otherwise. Pages and text load once per call. */
async function checkQuotes(access: Access, opened: Awaited<ReturnType<Access['open']>>, blocks: ReadingBlockInput[], signal?: AbortSignal) {
  const { item, bytes } = opened
  let pages: string[] | undefined, text: string | undefined
  for (const [index, block] of blocks.entries()) {
    if (block.source.kind !== 'paper') continue
    const n = index + 1, { page } = block.source, quote = normalizeQuote(block.source.quote)
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

/** Compact view of one reading block for reading_view: preserves ids and prose/table/diagram details without flooding context with full widget HTML. */
function summarizeBlock(block: ReadingParagraph) {
  if ('text' in block) return { id: block.id, kind: 'text', text: block.text, source: block.source }
  if (block.kind === 'table') return { id: block.id, kind: 'table', ...(block.title ? { title: block.title } : {}), columns: block.columns, rows: block.rows.length, ...(block.caption ? { caption: block.caption } : {}), source: block.source }
  if (block.kind === 'diagram') return { id: block.id, kind: 'diagram', ...(block.title ? { title: block.title } : {}), mermaid: block.mermaid, ...(block.caption ? { caption: block.caption } : {}), source: block.source }
  return { id: block.id, kind: 'widget', ...(block.title ? { title: block.title } : {}), ...(block.caption ? { caption: block.caption } : {}), htmlBytes: Buffer.byteLength(block.html), source: block.source }
}

const BLOCK_HINT = [
  'text（默认，可省 kind）：{ text, source }（≤600 字）',
  'table：{ kind: "table", title?, columns: [...], rows: [[...]], caption?, source }',
  'diagram：{ kind: "diagram", title?, mermaid, caption?, source }（Mermaid 流程图/关系图，≤8KB）',
  'widget：{ kind: "widget", title?, html, caption?, source }（自包含原生 HTML+Canvas/SVG+JS 交互小实验，≤64KB；浅底清晰配色，无需外网；可调 window.__widgetSendMessage("一句话") 把用户猜测或参数发回对话）',
].join('；')

export function createReadingTools(studio: Studio, access: Access, topicOf: TopicResolver, writer: BoardWriter) {
  return {
    reading_view: createTool({ id: 'reading_view', description: '看这个主题里一份材料已有的解读：每节的 id、标题，以及每段/每块的 id、类型、内容摘要和出处。续写、改写或用 reading_insert 原地补图之前先看；还没有解读时 sections 是空的。',
      inputSchema: z.object({ itemId: z.string().min(1).max(128) }),
      execute: async ({ itemId }, context) => {
        const topicId = topicOf(context)
        if (!studio.topics.isReferenced(topicId, itemId)) throw notReferenced(itemId)
        const reading = studio.readings.view(topicId, itemId)
        return { itemId, sections: reading?.sections.map(section => ({ id: section.id, ord: section.ord, title: section.title, paragraphs: section.paragraphs.map(summarizeBlock) })) ?? [],
          limits: { sections: READING_LIMITS.sections, paragraphs: READING_LIMITS.paragraphs, sectionMax: READING_LIMITS.sectionMax, paragraphChars: READING_LIMITS.paragraphChars } }
      },
    }),
    reading_write: createTool({ id: 'reading_write',
      description: `为本主题引用的一份材料写一节解读。title 不带序号（不写「三、」「3.」），视图会给每节编号。不给 sectionId 就接在最后，给了就把那一节整节换掉。paragraphs 可自由混排四种块：${BLOCK_HINT}。每块的 source 是 { kind: "paper", page, quote }（quote 是那一页上的原文短引，至少 ${READING_LIMITS.quoteMin} 字；材料没有页码时省掉 page）或 { kind: "inference" }（你自己的理解、串联或小实验）。服务逐条核对引文，对不上会拒绝并说明是哪一段。quote 会显示在对应段/块下面，正文可以直接引向它，但不要在正文里再抄一遍。最多 ${READING_LIMITS.sections} 节，每节最多 ${READING_LIMITS.paragraphs} 块。写好一节就调一次，用户会先读起来。`,
      inputSchema: readingInput.extend({ itemId: z.string().min(1).max(128) }),
      execute: async ({ itemId, ...input }, context) => {
        // Open first: an unreferenced item is refused with read_material's sentence before any quote is looked at (R15)
        const opened = await access.open(context, itemId)
        await checkQuotes(access, opened, input.paragraphs, context?.abortSignal)
        const { topicId, threadId, runId } = await writer(context)
        const result = studio.readings.write(topicId, itemId, input, { threadId, runId })
        return { sectionId: result.sectionId, replaced: result.replaced, sections: result.reading.sections.length, title: input.title }
      },
    }),
    reading_insert: createTool({ id: 'reading_insert',
      description: `在已有解读的某一节里原地补插一块（不重写整节）。适合用户划句追问或讨论到卡点时，你判断光靠文字说不清，主动在对应段落下方补一张 diagram、table 或交互 widget。afterId 填 reading_view 里那一段的 id 就会插在它正下方，不填则接在该节末尾。block 形状：${BLOCK_HINT}。每节最多容纳 ${READING_LIMITS.sectionMax} 块。`,
      inputSchema: readingInsertInput.extend({ itemId: z.string().min(1).max(128) }),
      execute: async ({ itemId, ...input }, context) => {
        const opened = await access.open(context, itemId)
        await checkQuotes(access, opened, [input.block], context?.abortSignal)
        const { topicId, threadId, runId } = await writer(context)
        const result = studio.readings.insert(topicId, itemId, input, { threadId, runId })
        return { sectionId: result.sectionId, blockId: result.blockId, count: result.count }
      },
    }),
  }
}

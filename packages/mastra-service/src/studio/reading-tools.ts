/**
 * [INPUT]: the reading store and its shared block/section/insert schemas and quote rule, widget-guide's handbook, material access (R15 open, the PDF page cache, plain text), the board's trusted writer (topic, conversation, run)
 * [OUTPUT]: createReadingTools: reading_view (the reading of one referenced material: section ids, titles and blocks with ids; a widget shows its params, never its html;
 *           with blockId, that one block in full, html included; both say the source lives in the reading store, not the workspace),
 *           reading_widget_guide (read-only: the widget handbook from widget-guide.ts, fetched before writing a widget), reading_write (append, or replace a section by id;
 *           mixed prose/table/diagram/widget blocks; the widget line is its shape plus 「先调 reading_widget_guide」), reading_insert (add one block into an existing section after a given block or at the end, for inline visual follow-ups),
 *           and reading_patch (edit one block in place by exact-once old→new edits plus title/caption/params; source untouched, so no quote is checked again)
 * [POS]: the AI's only way to write a reading. The program checks only what would break a promise — the material is this topic's (R15), every paper quote occurs on the cited page
 *        of exactly the text read_material returns, and the caps; what medium (text vs table/diagram/widget) and how deep is the model's call. Main agent only; refusals name the item to fix
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import type { BoardWriter } from './board-tools.ts'
import { notReferenced, StudioError } from './errors.ts'
import { blockNotFound, normalizeQuote, quoteFound, READING_LIMITS, readingInput, readingInsertInput, readingPatchInput, type ReadingBlockInput } from './reading.ts'
import type { Studio } from './studio.ts'
import type { createMaterialAccess, TopicResolver } from './tools.ts'
import type { ReadingParagraph } from './types.ts'
import { WIDGET_GUIDE } from './widget-guide.ts'

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

/** Compact view of one reading block for reading_view: preserves ids and prose/table/diagram details and a widget's declared params (so a rewrite keeps their names), without flooding context with full widget HTML. */
function summarizeBlock(block: ReadingParagraph) {
  if ('text' in block) return { id: block.id, kind: 'text', text: block.text, source: block.source }
  if (block.kind === 'table') return { id: block.id, kind: 'table', ...(block.title ? { title: block.title } : {}), columns: block.columns, rows: block.rows.length, ...(block.caption ? { caption: block.caption } : {}), source: block.source }
  if (block.kind === 'diagram') return { id: block.id, kind: 'diagram', ...(block.title ? { title: block.title } : {}), mermaid: block.mermaid, ...(block.caption ? { caption: block.caption } : {}), source: block.source }
  return { id: block.id, kind: 'widget', ...(block.title ? { title: block.title } : {}), ...(block.caption ? { caption: block.caption } : {}), htmlBytes: Buffer.byteLength(block.html), ...(block.params ? { params: block.params } : {}), source: block.source }
}

const SOURCE_HINT = '解读和小实验的源码存在解读库里，不在工作区文件里；要看某一块的原文，用 reading_view({ itemId, blockId })，不要用 list_files、read_file 或 run_code 去找'

const BLOCK_HINT = [
  'text（默认，可省 kind）：{ text, source }（≤600 字）',
  'table：{ kind: "table", title?, columns: [...], rows: [[...]], caption?, source }',
  'diagram：{ kind: "diagram", title?, mermaid, caption?, source }（Mermaid 流程图/关系图，≤8KB）',
  'widget：{ kind: "widget", title?, html, params?, caption?, source }（交互小实验；写之前先调 reading_widget_guide）',
].join('；')

export function createReadingTools(studio: Studio, access: Access, topicOf: TopicResolver, writer: BoardWriter) {
  return {
    reading_view: createTool({ id: 'reading_view', description: `看这个主题里一份材料已有的解读：每节的 id、标题，以及每段/每块的 id、类型、内容摘要和出处。续写、改写或用 reading_insert 原地补图之前先看；还没有解读时 sections 是空的。给 blockId 就只返回那一块的完整原文（小实验带 html 和 params），用 reading_patch 局部修改之前先这样读。${SOURCE_HINT}。`,
      inputSchema: z.object({ itemId: z.string().min(1).max(128), blockId: z.string().min(1).max(64).optional() }),
      execute: async ({ itemId, blockId }, context) => {
        const topicId = topicOf(context)
        if (!studio.topics.isReferenced(topicId, itemId)) throw notReferenced(itemId)
        const reading = studio.readings.view(topicId, itemId)
        if (blockId) {
          for (const section of reading?.sections ?? []) {
            const block = section.paragraphs.find(item => item.id === blockId)
            if (block) return { itemId, sectionId: section.id, sectionTitle: section.title, block: 'text' in block ? { ...block, kind: 'text' } : block }
          }
          throw blockNotFound(blockId)
        }
        return { itemId, sections: reading?.sections.map(section => ({ id: section.id, ord: section.ord, title: section.title, paragraphs: section.paragraphs.map(summarizeBlock) })) ?? [],
          limits: { sections: READING_LIMITS.sections, paragraphs: READING_LIMITS.paragraphs, sectionMax: READING_LIMITS.sectionMax, paragraphChars: READING_LIMITS.paragraphChars },
          ...(reading ? { source: SOURCE_HINT } : {}) }
      },
    }),
    reading_widget_guide: createTool({ id: 'reading_widget_guide', description: '写小实验（widget 块）之前先调：返回小实验的完整写法手册——视觉语法、params 的声明与读取、回发对话的时机、硬限制和一个完整范例。',
      inputSchema: z.object({}),
      execute: async () => ({ guide: WIDGET_GUIDE }),
    }),
    reading_write: createTool({ id: 'reading_write',
      description: `为本主题引用的一份材料写一节解读。title 不带序号（不写「三、」「3.」），视图会给每节编号。不给 sectionId 就接在最后，给了就把那一节整节换掉。paragraphs 可自由混排四种块：${BLOCK_HINT}。每块的 source 是 { kind: "paper", page, quote }（quote 是那一页上的原文短引，至少 ${READING_LIMITS.quoteMin} 字；材料没有页码时省掉 page）或 { kind: "inference" }（你自己的理解、串联或小实验）。服务逐条核对引文，对不上会拒绝并说明是哪一段。quote 会显示在对应段/块下面，正文可以直接引向它，但不要在正文里再抄一遍。最多 ${READING_LIMITS.sections} 节，每节最多 ${READING_LIMITS.paragraphs} 块。写好一节就调一次，用户会先读起来。只改一块里的几处，用 reading_patch。`,
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
    reading_patch: createTool({ id: 'reading_patch',
      description: `局部修改已有解读里的一块，块 id、所在节和位置都不变。先用 reading_view({ itemId, blockId }) 读这一块的原文。edits 是 1–20 条 { old, new }，按顺序替换：文字段改 text，图示改 mermaid，小实验改 html；表格不支持 edits。每条 old 必须照原文一字不差，并且在当前内容里恰好出现一次（找不到或出现多次都会被拒，带上更多上下文）。title、caption 给了就整项替换，传空串是删除；params（只限小实验）给了就整组替换声明，传 [] 是删除全部参数，不传就不变。改完照 reading_write 的规则重新校验，不通过就整次拒绝、什么都不写。出处不能改，要改出处用 reading_write。没有必要不要改小实验的标题：用户调过的参数值按标题存，改了标题这些值就失效。`,
      inputSchema: readingPatchInput.extend({ itemId: z.string().min(1).max(128) }),
      execute: async ({ itemId, ...input }, context) => {
        const topicId = topicOf(context)
        if (!studio.topics.isReferenced(topicId, itemId)) throw notReferenced(itemId)
        const origin = await writer(context)
        const { sectionId, block } = studio.readings.patch(origin.topicId, itemId, input, origin)
        return { sectionId, blockId: block.id, kind: 'kind' in block ? block.kind : 'text', ...('html' in block ? { htmlBytes: Buffer.byteLength(block.html) } : {}), ...('params' in block && block.params ? { params: block.params } : {}) }
      },
    }),
  }
}

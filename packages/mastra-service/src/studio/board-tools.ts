/**
 * [INPUT]: the studio stores (board/sediment/topic references/run targets), content's block contract and one-line summary, the trusted session identity, the current main run id and the run-target resolution
 * [OUTPUT]: createBoardTools: board_view/board_draw/board_update/board_supersede, all against the run's target (R16); topicState: the per-request topic state (the run's target, the user's takeaways, capped)
 * [POS]: the AI's only path onto the board (R4). Topic and sheet always derive from the session identity — the parameters carry neither; every write records its conversation and run, versions are written by the application when the run ends
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createTool, type ToolExecutionContext } from '@mastra/core/tools'
import { z } from 'zod'
import { blockKinds, LIMITS, summarize } from './content.ts'
import { StudioError } from './errors.ts'
import type { Studio } from './studio.ts'
import type { Block, BlockSource, Sheet, WriteOrigin } from './types.ts'

type Context = { requestContext?: ToolExecutionContext['requestContext'] } | undefined
/** The trusted writer: topic, conversation (= resourceId), the current main run and this run's target (R16; null = no sheet to write); only an opened main session resolves. */
export type BoardWriter = (context: Context) => Promise<{ topicId: string; sheetId: string | null } & WriteOrigin>
/** Read side (main run and specialists): the topic and the run's target sheet. */
export type BoardReader = (context: Context) => { topicId: string; sheetId: string | null }

// ---------------------------------------------------------------------------
// What the model sees: per-kind shape hints; the real validation lives in the store (the same zod contract) and errors go back to the model verbatim
// ---------------------------------------------------------------------------
const kind = z.enum(blockKinds as [string, ...string[]])
const content = z.object({}).passthrough().describe([
  'text: { markdown }（一件事的说明，≤8KB）',
  'ladder: { rungs: [{ level, text }], here, breakAt?, foggedAbove? }（理解的梯子：level 从低到高，here 是用户现在站的那级，breakAt 是断掉的那级）',
  'table: { columns: [..], rows: [[..]], guessCells?: [[row, col]] }（每行格数等于列数；guessCells 标出还是猜测的格子）',
  'widget: { html }（可交互的小部件，≤64KB，自带样式与脚本）',
].join('；'))
const sources = z.array(z.object({
  itemId: z.string().optional().describe('本主题引用的材料 id（list_materials 里的）'),
  page: z.number().int().min(1).optional(),
  quote: z.string().optional().describe(`原文短引，≤${LIMITS.quote} 字`),
  threadId: z.string().optional().describe('出自本主题的哪段对话'),
})).max(LIMITS.sources).describe('出处：材料写 { itemId, page?, quote? }，对话写 { threadId }')

/** Strip empty fields off model-given sources; the store decides under R15. */
function cleanSources(value: z.infer<typeof sources> | undefined): unknown {
  return value?.map(source => Object.fromEntries(Object.entries(source).filter(([, field]) => field !== undefined)))
}

function line(block: Pick<Block, 'id' | 'kind' | 'title' | 'content' | 'state' | 'rev' | 'sources'>) {
  return { id: block.id, kind: block.kind, title: block.title, summary: summarize(block.kind, block.content), state: block.state, rev: block.rev, sources: block.sources }
}

export function createBoardTools(studio: Studio, writer: BoardWriter, reader: BoardReader) {
  const view = createTool({ id: 'board_view', description: '看这个主题进行中的白板：标题、用了几格、每块的 id/类型/标题/一句摘要/状态/版本号/出处。给 blockId 时返回那一块的完整内容（改之前先看）。',
    inputSchema: z.object({ blockId: z.string().max(64).optional() }),
    execute: async ({ blockId }, context) => {
      const { sheetId } = reader(context)
      if (sheetId === null) throw new StudioError('这个主题现在没有进行中的白板；请用户点 ＋ 新开一张', 409, 'board.no_live_sheet')
      const current = studio.board.view(sheetId)
      const sheet = { id: current.sheet.id, title: current.sheet.title, used: current.sheet.used, capacity: current.sheet.capacity }
      if (blockId) {
        const target = current.blocks.find(block => block.id === blockId)
        if (!target) return { sheet, error: `进行中的白板上没有区块 ${blockId}` }
        return { sheet, block: { ...line(target), content: target.content } }
      }
      return { sheet, blocks: current.blocks.map(line) }
    },
  })
  return {
    board_view: view,
    board_draw: createTool({ id: 'board_draw', description: '在这个主题进行中的白板上画一块。一块只讲一件事；版面由系统排，near 填一个已有区块 id 时落在它那一列。白板满了会被拒绝——那时先和用户沉淀，不要硬挤。',
      inputSchema: z.object({ kind, title: z.string().max(LIMITS.title), content, sources: sources.optional(), near: z.string().max(64).optional() }),
      execute: async (input, context) => {
        const { topicId, sheetId, ...origin } = await writer(context)
        const result = studio.board.draw(topicId, { kind: input.kind as Block['kind'], title: input.title, content: input.content, sources: cleanSources(input.sources) as BlockSource[] | undefined, near: input.near }, origin, sheetId)
        return { blockId: result.blockId, rev: result.rev, title: input.title, used: result.used, capacity: result.capacity }
      },
    }),
    board_update: createTool({ id: 'board_update', description: '改白板上一块的标题、内容或出处。baseRev 填你看到的版本号（board_view 里的 rev）；别人改过会被拒绝，先重新看再改。内容要按这块原来的类型给完整内容，不是补丁。',
      inputSchema: z.object({ blockId: z.string().max(64), baseRev: z.number().int().min(1), title: z.string().max(LIMITS.title).optional(), content: content.optional(), sources: sources.optional() }),
      execute: async (input, context) => {
        const { topicId, sheetId, ...origin } = await writer(context)
        const result = studio.board.update(topicId, { blockId: input.blockId, baseRev: input.baseRev, title: input.title, content: input.content, sources: cleanSources(input.sources) as BlockSource[] | undefined }, origin, sheetId)
        return { blockId: result.blockId, rev: result.rev }
      },
    }),
    board_supersede: createTool({ id: 'board_supersede', description: '把一块标成「已被取代」：它留在白板上变灰，不删，也不再占容量。by 填取代它的新区块 id（可选）。理解变了就这样留下来路，而不是抹掉。已被用户留作沉淀证据（settled）的块不能动。',
      inputSchema: z.object({ blockId: z.string().max(64), by: z.string().max(64).optional() }),
      execute: async (input, context) => {
        const { topicId, sheetId, ...origin } = await writer(context)
        return studio.board.supersede(topicId, input, origin, sheetId)
      },
    }),
  }
}

// ---------------------------------------------------------------------------
// Topic state: the run's target sheet, one line per block, referenced materials; a hard estimated-token cap truncates, newest first
// ---------------------------------------------------------------------------
export const TOPIC_STATE_TOKENS = 1500

/** A rough token estimate: one per CJK character, one per four others; only for the cap — over-estimating is fine. */
export function estimateTokens(text: string): number {
  let cjk = 0
  for (const char of text) if (/[　-鿿가-힯＀-￯]/.test(char)) cjk++
  return cjk + Math.ceil((text.length - cjk) / 4)
}

/** target: the run's target sheet (R16); undefined keeps the newest live sheet (callers without a run). */
export function topicState(studio: Studio, topicId: string, limit = TOPIC_STATE_TOKENS, target?: Sheet | null): string {
  let topic
  try { topic = studio.topics.get(topicId) } catch { return '' }
  let sheet
  try { sheet = target === undefined ? studio.board.view(studio.board.writableSheet(topicId).id) : target && studio.board.view(target.id) } catch { sheet = null }
  const materials = studio.topics.materials(topicId)
  const head = [`主题「${topic.title}」的现状（每次请求自动附上，只是概览；要看全用 board_view，要读材料用 read_material）：`,
    !sheet ? '这个主题现在没有进行中的白板。'
      : sheet.sheet.state === 'live' ? `进行中的白板「${sheet.sheet.title}」：${sheet.sheet.used}/${sheet.sheet.capacity} 格`
      : `用户这一轮选中的白板「${sheet.sheet.title}」已经收起，只读：这一轮不写白板，在对话里说明。`]
  // ---- Blocks newest first; non-current ones stay listed with their replacer and whether the user keeps them as evidence ----
  const blocks = (sheet?.blocks ?? []).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(block => {
    const cited = block.sources.map(source => 'itemId' in source ? `${source.itemId}${source.page ? `#p${source.page}` : ''}` : '对话').join(',')
    const state = block.state === 'current' ? '当前' : block.state === 'settled' ? '已沉淀（用户留作证据，不改它）' : `已取代${block.supersededBy ? `→${block.supersededBy}` : ''}`
    return `- ${block.id} · ${block.kind} · ${block.title} · ${summarize(block.kind, block.content)} · ${state}${cited ? ` · 出处 ${cited}` : ''}`
  })
  // ---- The user's takeaways (S6): newest first, text verbatim, evidence as block titles; challenge them after writing, never edit the user's words ----
  const sediment = studio.sediment.list(topicId).items.map(item =>
    `- 「${item.text}」（${item.origin === 'quoted' ? '原话引用' : '自写'}${item.links.length ? ` · 证据 ${item.links.map(link => link.deleted ? `「${link.title}」白板已删` : `「${link.title}」`).join('、')}` : ''}）`)
  const items = materials.map(item => `- ${item.id} · ${item.kind} · ${item.title} · ${item.addedBy === 'you' ? '用户放的' : 'AI 带来的'} · 读到 ${Math.round(item.readProgress * 100)}%`)
  const lines = [...head]
  let used = estimateTokens(lines.join('\n')), omitted = 0
  const fit = (section: string, rows: string[]) => {
    if (!rows.length) return
    const header = `${section}：`
    if (used + estimateTokens(header) > limit) { omitted += rows.length; return }
    lines.push(header); used += estimateTokens(header)
    for (const row of rows) {
      const cost = estimateTokens(row) + 1
      if (used + cost > limit - 40) { omitted++; continue }
      lines.push(row); used += cost
    }
  }
  fit('用户的沉淀（新的在前；只能用户自己写，你挑刺，不代写）', sediment)
  fit('白板上的区块（新的在前）', blocks)
  fit('本主题引用的材料', items)
  // ---- S14 speech habits: one compact global section (~120 tokens) inside the same cap ----
  const habits = studio.sediment.habitsText(120)
  if (habits && used + estimateTokens(habits) <= limit) { lines.push(habits); used += estimateTokens(habits) }
  if (omitted) lines.push(`（还有 ${omitted} 条没列出，用 board_view / list_materials 看全。）`)
  return lines.join('\n')
}

/**
 * [INPUT]: studio 存储（白板/主题引用）、content 的区块合同与一句话摘要、受信会话身份与当前主运行 ID 的解析
 * [OUTPUT]: createBoardTools：board_view/board_draw/board_update/board_supersede；topicState：每次请求注入的主题现状（有上限）
 * [POS]: AI 写白板的唯一通道（R4）。主题一律从会话身份推出，参数里没有主题和白板；每次写入记下对话与运行，版本由应用在运行结束时写
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createTool, type ToolExecutionContext } from '@mastra/core/tools'
import { z } from 'zod'
import { blockKinds, LIMITS, summarize } from './content.ts'
import type { Studio } from './studio.ts'
import type { Block, BlockSource, WriteOrigin } from './types.ts'

type Context = { requestContext?: ToolExecutionContext['requestContext'] } | undefined
/** 受信写入方：主题、对话（= resourceId）与当前主运行；只有已打开的主会话能解析出来。 */
export type BoardWriter = (context: Context) => Promise<{ topicId: string } & WriteOrigin>

// ---------------------------------------------------------------------------
// 模型看到的入参：内容按种类给形状说明，真正的校验在存储里（同一份 zod 合同），错误原样回给模型
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

/** 模型给的出处去掉空字段，交给存储按 R15 裁决。 */
function cleanSources(value: z.infer<typeof sources> | undefined): unknown {
  return value?.map(source => Object.fromEntries(Object.entries(source).filter(([, field]) => field !== undefined)))
}

function line(block: Pick<Block, 'id' | 'kind' | 'title' | 'content' | 'state' | 'rev' | 'sources'>) {
  return { id: block.id, kind: block.kind, title: block.title, summary: summarize(block.kind, block.content), state: block.state, rev: block.rev, sources: block.sources }
}

export function createBoardTools(studio: Studio, writer: BoardWriter, topicOf: (context: Context) => string) {
  const view = createTool({ id: 'board_view', description: '看这个主题进行中的白板：标题、用了几格、每块的 id/类型/标题/一句摘要/状态/版本号/出处。给 blockId 时返回那一块的完整内容（改之前先看）。',
    inputSchema: z.object({ blockId: z.string().max(64).optional() }),
    execute: async ({ blockId }, context) => {
      const topicId = topicOf(context)
      const current = studio.board.view(studio.board.writableSheet(topicId).id)
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
        const { topicId, ...origin } = await writer(context)
        const result = studio.board.draw(topicId, { kind: input.kind as Block['kind'], title: input.title, content: input.content, sources: cleanSources(input.sources) as BlockSource[] | undefined, near: input.near }, origin)
        return { blockId: result.blockId, rev: result.rev, title: input.title, used: result.used, capacity: result.capacity }
      },
    }),
    board_update: createTool({ id: 'board_update', description: '改白板上一块的标题、内容或出处。baseRev 填你看到的版本号（board_view 里的 rev）；别人改过会被拒绝，先重新看再改。内容要按这块原来的类型给完整内容，不是补丁。',
      inputSchema: z.object({ blockId: z.string().max(64), baseRev: z.number().int().min(1), title: z.string().max(LIMITS.title).optional(), content: content.optional(), sources: sources.optional() }),
      execute: async (input, context) => {
        const { topicId, ...origin } = await writer(context)
        const result = studio.board.update(topicId, { blockId: input.blockId, baseRev: input.baseRev, title: input.title, content: input.content, sources: cleanSources(input.sources) as BlockSource[] | undefined }, origin)
        return { blockId: result.blockId, rev: result.rev }
      },
    }),
    board_supersede: createTool({ id: 'board_supersede', description: '把一块标成「已被取代」：它留在白板上变灰，不删，也不再占容量。by 填取代它的新区块 id（可选）。理解变了就这样留下来路，而不是抹掉。',
      inputSchema: z.object({ blockId: z.string().max(64), by: z.string().max(64).optional() }),
      execute: async (input, context) => {
        const { topicId, ...origin } = await writer(context)
        return studio.board.supersede(topicId, input, origin)
      },
    }),
  }
}

// ---------------------------------------------------------------------------
// 主题现状：进行中白板 + 每块一行 + 引用材料；硬上限按估算 token 截断，新的优先
// ---------------------------------------------------------------------------
export const TOPIC_STATE_TOKENS = 1500

/** 粗估 token：CJK 一字一个，其余四字符一个；只用于守上限，宁多勿少。 */
export function estimateTokens(text: string): number {
  let cjk = 0
  for (const char of text) if (/[　-鿿가-힯＀-￯]/.test(char)) cjk++
  return cjk + Math.ceil((text.length - cjk) / 4)
}

export function topicState(studio: Studio, topicId: string, limit = TOPIC_STATE_TOKENS): string {
  let topic
  try { topic = studio.topics.get(topicId) } catch { return '' }
  let sheet
  try { sheet = studio.board.view(studio.board.writableSheet(topicId).id) } catch { sheet = null }
  const materials = studio.topics.materials(topicId)
  const head = [`主题「${topic.title}」的现状（每次请求自动附上，只是概览；要看全用 board_view，要读材料用 read_material）：`,
    sheet ? `进行中的白板「${sheet.sheet.title}」：${sheet.sheet.used}/${sheet.sheet.capacity} 格` : '这个主题现在没有进行中的白板。']
  // ---- 区块新的在前；状态非 current 的也列出，标出被谁取代 ----
  const blocks = (sheet?.blocks ?? []).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(block => {
    const cited = block.sources.map(source => 'itemId' in source ? `${source.itemId}${source.page ? `#p${source.page}` : ''}` : '对话').join(',')
    return `- ${block.id} · ${block.kind} · ${block.title} · ${summarize(block.kind, block.content)} · ${block.state === 'current' ? '当前' : `已取代${block.supersededBy ? `→${block.supersededBy}` : ''}`}${cited ? ` · 出处 ${cited}` : ''}`
  })
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
  fit('白板上的区块（新的在前）', blocks)
  fit('本主题引用的材料', items)
  if (omitted) lines.push(`（还有 ${omitted} 条没列出，用 board_view / list_materials 看全。）`)
  return lines.join('\n')
}

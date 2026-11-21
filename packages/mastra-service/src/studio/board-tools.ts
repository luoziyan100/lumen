/**
 * [INPUT]: the studio stores (board with its canvas, sediment, topic references, run targets), the canvas contract of content.ts, the trusted session identity,
 *          the current main run id and the run-target resolution
 * [OUTPUT]: createBoardTools: board_view (the target sheet's structure: element type, text, arrow ends, author, the user's viewport; never an image) /
 *           board_draw (ElementSkeleton fragments, queued for the app to lay out) / board_update (the AI's own elements) / board_erase (R5), all against the run's
 *           target (R16); canvasView; topicState: the per-request topic state (the run's target canvas, the user's takeaways, existing readings with where to read a block / patch it / insert one, materials, speech habits, capped)
 * [POS]: the AI's only path onto the board (R4). Topic and sheet always derive from the session identity — the parameters carry neither; every write records its
 *        conversation and run, snapshots are written by the application when the run ends. A draw returns before the app lays it out: the card and board_view say so
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { createTool, type ToolExecutionContext } from '@mastra/core/tools'
import { z } from 'zod'
import { CANVAS_LIMITS, elementId, eraseReason, parseCanvas, patchSchema, skeletonSchema } from './content.ts'
import { StudioError } from './errors.ts'
import type { Studio } from './studio.ts'
import type { Author, CanvasElement, Sheet, WriteOrigin } from './types.ts'

type Context = { requestContext?: ToolExecutionContext['requestContext'] } | undefined
/** The trusted writer: topic, conversation (= resourceId), the current main run and this run's target (R16; null = no sheet to write); only an opened main session resolves. */
export type BoardWriter = (context: Context) => Promise<{ topicId: string; sheetId: string | null } & WriteOrigin>
/** Read side (main run and specialists): the topic and the run's target sheet. */
export type BoardReader = (context: Context) => { topicId: string; sheetId: string | null }

const VIEW_ELEMENTS = 300
const round = (value: unknown) => Math.round(Number(value) || 0)

/** One element as the model reads it: what it is, who drew it, where, its words and its arrow ends; a shape's label is folded into the shape. */
function line(element: CanvasElement, author: Author, labels: Map<string, CanvasElement>) {
  const label = (element.boundElements ?? []).map(bound => labels.get(bound.id)).find(Boolean)
  const binding = (value: unknown) => (value as { elementId?: string } | null)?.elementId
  return Object.fromEntries(Object.entries({
    id: element.id, type: element.type, by: author === 'ai' ? 'ai' : 'user', x: round(element.x), y: round(element.y), w: round(element.width), h: round(element.height),
    text: element.type === 'text' ? element.text : undefined, label: label?.text, labelId: label?.id,
    from: binding(element.startBinding), to: binding(element.endBinding), frame: element.frameId ?? undefined, name: element.type === 'frame' ? element.name : undefined,
  }).filter(([, value]) => value !== undefined && value !== null))
}

/** The target sheet as structure: live elements (those in the user's viewport first, capped), pending draws and open erasures. */
export function canvasView(studio: Studio, sheet: Sheet) {
  const canvas = studio.board.canvas, viewport = canvas.viewport(sheet.id)
  const live = canvas.liveElements(sheet.id)
  const labels = new Map(live.filter(row => row.element.containerId).map(row => [row.element.id, row.element]))
  const inside = (element: CanvasElement) => !viewport || (Number(element.x) < viewport.x + viewport.width && Number(element.x) + Number(element.width) > viewport.x
    && Number(element.y) < viewport.y + viewport.height && Number(element.y) + Number(element.height) > viewport.y)
  const shown = live.filter(row => !labels.has(row.element.id))
  const ordered = [...shown.filter(row => inside(row.element)), ...shown.filter(row => !inside(row.element))]
  return {
    sheet: { id: sheet.id, title: sheet.title, state: sheet.state },
    viewport: viewport && { x: round(viewport.x), y: round(viewport.y), w: round(viewport.width), h: round(viewport.height) },
    elements: ordered.slice(0, VIEW_ELEMENTS).map(row => line(row.element, row.author, labels)),
    ...(ordered.length > VIEW_ELEMENTS ? { omitted: ordered.length - VIEW_ELEMENTS } : {}),
    pending: canvas.ops(sheet.id).map(op => ({ title: op.title, kind: op.kind, ids: op.ids })),
    erased: canvas.erasures(sheet.id).map(erasure => ({ ids: erasure.elementIds, reason: erasure.reason })),
  }
}

// ---------------------------------------------------------------------------
// What the model sees: the shapes are checked again inside the store; refusals go back verbatim
// ---------------------------------------------------------------------------
const title = z.string().trim().min(1).max(CANVAS_LIMITS.title).describe('这一笔画的是什么，几个字；对话里的卡片显示它')
const skeletons = z.array(z.object({}).passthrough()).min(1).max(CANVAS_LIMITS.draw).describe([
  'Excalidraw ElementSkeleton：每个元素 { type, x, y, ... }，坐标是画布坐标。',
  'type：rectangle / ellipse / diamond（可带 label: { text }，宽高随字自动定）、text（{ text, fontSize? }）、arrow / line（width/height 或 points；arrow 可用 start: { id }、end: { id } 连到元素上）、',
  'freedraw（points）、image（fileId，白板上已有的图片）、frame（children: 元素 id 数组，name?）。',
  '可选 id（字母数字 _-，用来在同一批里连箭头；不给就由系统分配）与样式 strokeColor/backgroundColor/fillStyle/strokeWidth/strokeStyle/roughness/opacity/angle。',
].join(''))

async function target(studio: Studio, writer: BoardWriter, context: Context) {
  const { topicId, sheetId, ...origin } = await writer(context)
  return { sheet: studio.board.writeTarget(topicId, sheetId), origin }
}

export function createBoardTools(studio: Studio, writer: BoardWriter, reader: BoardReader) {
  const view = createTool({ id: 'board_view',
    description: '看这一轮的白板（用户选中的那张）：每个元素的 id、类型、作者（ai/user）、位置大小、文字或标签、箭头连着谁，以及用户当前看的区域 viewport。只给结构，不给图。',
    inputSchema: z.object({}),
    execute: async (_input, context) => {
      const { topicId, sheetId } = reader(context)
      if (sheetId === null) throw new StudioError('这个主题现在没有进行中的白板；请用户点 ＋ 新开一张', 409, 'board.no_live_sheet')
      const sheet = studio.board.sheet(sheetId)
      if (sheet.topicId !== topicId) throw new StudioError('没有这张白板', 404, 'board.sheet_not_found')
      return canvasView(studio, sheet)
    },
  })
  return {
    board_view: view,
    board_draw: createTool({ id: 'board_draw',
      description: '在这一轮的白板上画。默认画在用户当前看的区域（board_view 的 viewport）里、相关内容旁边，别压住已有的元素。桌面会用真实字体排好再落到白板上。',
      inputSchema: z.object({ title, elements: skeletons }),
      execute: async (input, context) => {
        const { sheet, origin } = await target(studio, writer, context)
        const parsed = input.elements.map((element, index) => parseCanvas(skeletonSchema, element, `第 ${index + 1} 个元素`))
        const op = studio.board.canvas.queueDraw(sheet.id, input.title, parsed, origin)
        // `blockId` is the conversation card's jump target (the first element); the card contract predates the canvas
        return { title: input.title, ids: op.ids, blockId: op.ids[0], note: '已交给桌面落笔；用户打开这张白板就能看到' }
      },
    }),
    board_update: createTool({ id: 'board_update',
      description: '改你自己画的元素：位置、大小、文字、样式、points。只能改 by 为 ai 的元素；用户画的不改。改形状里的字，就改 board_view 里它的 labelId。',
      inputSchema: z.object({ title, elements: z.array(z.object({}).passthrough()).min(1).max(CANVAS_LIMITS.draw).describe('每项 { id, 要改的字段… }') }),
      execute: async (input, context) => {
        const { sheet, origin } = await target(studio, writer, context)
        const patches = input.elements.map((element, index) => parseCanvas(patchSchema, element, `第 ${index + 1} 项修改`))
        const op = studio.board.canvas.queueUpdate(sheet.id, input.title, patches, origin)
        return { title: input.title, ids: op.ids, blockId: op.ids[0] }
      },
    }),
    board_erase: createTool({ id: 'board_erase',
      description: '擦掉白板上的元素。你自己画的直接删；用户画的线条和形状，只在你判断是误触或画废时才擦，会进回收记录，用户一键就能恢复；用户写的字一律擦不了。擦了用户的笔画，就在回复里说清擦了什么、为什么。',
      inputSchema: z.object({ ids: z.array(elementId).min(1).max(CANVAS_LIMITS.save), reason: eraseReason.describe('为什么擦，一句话；用户在恢复按钮旁看得到') }),
      execute: async ({ ids, reason }, context) => {
        const { sheet, origin } = await target(studio, writer, context)
        const result = studio.board.canvas.erase(sheet.id, ids, reason, origin)
        return { removed: result.removed, recycled: result.recycled,
          ...(result.recycled.length ? { note: `擦了用户的 ${result.recycled.length} 笔，已进回收记录，用户可一键恢复；在回复里说清擦了什么、为什么` } : {}) }
      },
    }),
  }
}

// ---------------------------------------------------------------------------
// Topic state: the run's target canvas (counts, viewport, one line per element with words), referenced materials; a hard estimated-token cap truncates, newest first
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
  let sheet: Sheet | null
  try { sheet = target === undefined ? studio.board.writableSheet(topicId) : target } catch { sheet = null }
  const materials = studio.topics.materials(topicId)
  const view = sheet && canvasView(studio, sheet)
  const authors = view ? view.elements.filter(element => element.by === 'ai').length : 0
  const head = [`主题「${topic.title}」的现状（每次请求自动附上，只是概览；要看全用 board_view，要读材料用 read_material）：`,
    !sheet || !view ? '这个主题现在没有进行中的白板。'
      : sheet.state === 'live' ? `这一轮的白板「${sheet.title}」：${view.elements.length + (view.omitted ?? 0)} 个元素（你画的 ${authors}，用户画的 ${view.elements.length - authors}${view.omitted ? '，另有未列出的' : ''}）${view.viewport ? `；用户正看着 x ${view.viewport.x}, y ${view.viewport.y}, ${view.viewport.w}×${view.viewport.h} 这块` : ''}${view.pending.length ? `；${view.pending.length} 笔还在等桌面落笔` : ''}${view.erased.length ? `；你擦掉的用户笔画还有 ${view.erased.reduce((n, erasure) => n + erasure.ids.length, 0)} 笔没被恢复` : ''}`
      : `用户这一轮选中的白板「${sheet.title}」已经收起，只读：这一轮不写白板，在对话里说明。`]
  // ---- Elements that carry words, those in the user's viewport first: one line each, the rest is board_view's ----
  const worded = (view?.elements ?? []).filter(element => element.text || element.label).map(element =>
    `- ${element.id} · ${element.type} · ${element.by === 'ai' ? '你画的' : '用户画的'} · 「${String(element.text ?? element.label).replace(/\s+/g, ' ').slice(0, 60)}」`)
  // ---- The user's takeaways (S6): newest first, text verbatim, evidence as block titles; challenge them after writing, never edit the user's words ----
  const sediment = studio.sediment.list(topicId).items.map(item =>
    `- 「${item.text}」（${item.origin === 'quoted' ? '原话引用' : '自写'}${item.links.length ? ` · 证据 ${item.links.map(link => link.deleted ? `「${link.title}」白板已删` : `「${link.title}」`).join('、')}` : ''}）`)
  const readings = studio.readings.list(topicId).map(item => `- ${item.itemId} · 《${item.title}》· ${item.sections} 节`)
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
  fit('已有解读（用 reading_view 看各节与段落 id，带 blockId 看块原文；局部修改用 reading_patch，原地补图或小实验仍用 reading_insert）', readings)
  fit('白板上带字的元素（用户正看着的在前）', worded)
  fit('本主题引用的材料', items)
  // ---- S14 speech habits: one compact global section (~120 tokens) inside the same cap ----
  const habits = studio.sediment.habitsText(120)
  if (habits && used + estimateTokens(habits) <= limit) { lines.push(habits); used += estimateTokens(habits) }
  if (omitted) lines.push(`（还有 ${omitted} 条没列出，用 board_view / list_materials 看全。）`)
  return lines.join('\n')
}

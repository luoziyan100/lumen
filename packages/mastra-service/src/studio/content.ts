/**
 * [INPUT]: zod；studio/types 的区块种类与出处形状
 * [OUTPUT]: blockContent/parseContent、sourcesSchema、blockTitle、summarize、内容大小上限；画布合同：CANVAS_LIMITS、skeletonTypes、elementId、
 *           skeletonSchema（AI 画的 ElementSkeleton 片段）、patchSchema（AI 改自己的元素）、eraseReason、parseCanvas
 * [POS]: 白板内容合同的唯一真源；存储写入前与 AI 工具入参共用。区块合同只剩旧数据在用；画布合同只验形状，转换成元素由桌面用真实字体完成
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { z } from 'zod'
import { StudioError } from './errors.ts'
import type { BlockKind, BlockSource } from './types.ts'

// ---------------------------------------------------------------------------
// 上限：一块只讲一件事；小部件允许较大的 HTML，文字保持短
// ---------------------------------------------------------------------------
export const LIMITS = { markdown: 8 * 1024, widgetHtml: 64 * 1024, title: 80, rungs: 12, rungText: 300, columns: 8, rows: 30, cell: 300, sources: 10, quote: 300 }

const bytes = (max: number, label: string) => z.string().refine(value => Buffer.byteLength(value) <= max, `${label}超过 ${Math.round(max / 1024)}KB`)

const text = z.object({ markdown: bytes(LIMITS.markdown, '文字区块').pipe(z.string().trim().min(1)) }).strict()

const ladder = z.object({
  rungs: z.array(z.object({ level: z.number().int().min(0).max(99), text: z.string().trim().min(1).max(LIMITS.rungText) }).strict()).min(1).max(LIMITS.rungs),
  here: z.number().int(),
  foggedAbove: z.number().int().optional(),
  breakAt: z.number().int().optional(),
}).strict().superRefine((value, context) => {
  const levels = new Set(value.rungs.map(rung => rung.level))
  if (levels.size !== value.rungs.length) context.addIssue({ code: 'custom', message: '梯子的级别不能重复' })
  for (const key of ['here', 'breakAt'] as const) {
    const level = value[key]
    if (level !== undefined && !levels.has(level)) context.addIssue({ code: 'custom', message: `${key} 必须指向已有的一级` })
  }
})

const table = z.object({
  columns: z.array(z.string().max(LIMITS.cell)).min(1).max(LIMITS.columns),
  rows: z.array(z.array(z.string().max(LIMITS.cell))).max(LIMITS.rows),
  guessCells: z.array(z.tuple([z.number().int().min(0), z.number().int().min(0)])).optional(),
}).strict().superRefine((value, context) => {
  if (value.rows.some(row => row.length !== value.columns.length)) context.addIssue({ code: 'custom', message: '每一行的格数要和列数一致' })
  if (value.guessCells?.some(([r, c]) => r >= value.rows.length || c >= value.columns.length)) context.addIssue({ code: 'custom', message: 'guessCells 指向了不存在的格子' })
})

const widget = z.object({ html: bytes(LIMITS.widgetHtml, '小部件').pipe(z.string().trim().min(1)) }).strict()

export const blockContent = { text, ladder, table, widget } satisfies Record<BlockKind, z.ZodType>
export const blockKinds = Object.keys(blockContent) as BlockKind[]
export const blockTitle = z.string().trim().min(1).max(LIMITS.title)

export const sourcesSchema = z.array(z.union([
  z.object({ itemId: z.string().min(1).max(128), page: z.number().int().min(1).optional(), quote: z.string().trim().min(1).max(LIMITS.quote).optional() }).strict(),
  z.object({ threadId: z.string().min(1).max(260) }).strict(),
])).max(LIMITS.sources)

function issues(error: z.ZodError) {
  return error.issues.map(issue => (issue.path.length ? `${issue.path.map(String).join('.')}: ` : '') + issue.message).join('；')
}

export function parseContent(kind: BlockKind, content: unknown): unknown {
  const result = blockContent[kind].safeParse(content)
  if (!result.success) throw new StudioError(`「${kind}」区块的内容不合格式：${issues(result.error)}`, 400, 'board.invalid_content', { kind, issues: issues(result.error) })
  return result.data
}

export function parseSources(sources: unknown): BlockSource[] {
  const result = sourcesSchema.safeParse(sources ?? [])
  if (!result.success) throw new StudioError(`出处格式不对：${issues(result.error)}。材料写 { itemId, page?, quote? }，对话写 { threadId }`, 400, 'board.invalid_sources', { issues: issues(result.error) })
  return result.data
}

// ---------------------------------------------------------------------------
// 一句话摘要：白板现状注入与 board_view 共用，不复述全文
// ---------------------------------------------------------------------------
const clip = (value: string, max = 80) => {
  const flat = value.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

export function summarize(kind: BlockKind, content: unknown): string {
  if (kind === 'text') return clip((content as z.infer<typeof text>).markdown.replace(/[#>*_`|-]+/g, ' '))
  if (kind === 'ladder') {
    const value = content as z.infer<typeof ladder>
    const here = value.rungs.find(rung => rung.level === value.here)
    const broken = value.breakAt === undefined ? '' : `，断在第 ${value.breakAt} 级`
    return clip(`${value.rungs.length} 级梯子，人在第 ${value.here} 级（${here?.text ?? ''}）${broken}`)
  }
  if (kind === 'table') {
    const value = content as z.infer<typeof table>
    return clip(`表格 ${value.rows.length}×${value.columns.length}：${value.columns.join(' / ')}`)
  }
  return '实时小部件'
}

// ---------------------------------------------------------------------------
// Canvas contract (2026-11-19): what the AI may draw, as Excalidraw ElementSkeleton fragments. The service checks shape and the
// ownership rules; the app turns skeletons into elements with real fonts (the service has no text measurement, see canvas.ts)
// ---------------------------------------------------------------------------
export const CANVAS_LIMITS = { draw: 60, text: 2000, points: 2000, children: 200, coordinate: 1_000_000, elementBytes: 256 * 1024, save: 2000, fileBytes: 4 * 1024 * 1024, files: 8, reason: 200, title: 80 }
/** stickynote stays out: the toolbar hides it (no Chinese label upstream), and magicframe/embeddable/iframe reach outside the app */
export const skeletonTypes = ['rectangle', 'ellipse', 'diamond', 'arrow', 'line', 'text', 'image', 'frame', 'freedraw'] as const
export const elementId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, '元素 id 只用字母、数字、_ 和 -，最长 64')

const coordinate = z.number().finite().min(-CANVAS_LIMITS.coordinate).max(CANVAS_LIMITS.coordinate)
const size = z.number().finite().min(1).max(CANVAS_LIMITS.coordinate)
const style = {
  strokeColor: z.string().max(32).optional(), backgroundColor: z.string().max(32).optional(),
  fillStyle: z.enum(['hachure', 'cross-hatch', 'solid', 'zigzag']).optional(), strokeWidth: z.number().min(0.5).max(16).optional(),
  strokeStyle: z.enum(['solid', 'dashed', 'dotted']).optional(), roughness: z.number().int().min(0).max(2).optional(),
  opacity: z.number().min(0).max(100).optional(), angle: z.number().finite().optional(),
}
const typography = {
  fontSize: z.number().min(8).max(160).optional(), textAlign: z.enum(['left', 'center', 'right']).optional(),
  verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
}
const points = z.array(z.tuple([coordinate, coordinate])).min(2).max(CANVAS_LIMITS.points)
const words = z.string().min(1).max(CANVAS_LIMITS.text)

export const skeletonSchema = z.object({
  type: z.enum(skeletonTypes), id: elementId.optional(), x: coordinate, y: coordinate, width: size.optional(), height: size.optional(),
  text: words.optional(), label: z.object({ text: words, ...typography }).strict().optional(),
  start: z.object({ id: elementId }).strict().optional(), end: z.object({ id: elementId }).strict().optional(),
  points: points.optional(), fileId: z.string().min(1).max(128).optional(),
  children: z.array(elementId).max(CANVAS_LIMITS.children).optional(), name: z.string().max(CANVAS_LIMITS.title).optional(),
  ...style, ...typography,
}).strict().superRefine((value, context) => {
  const need = (ok: boolean, message: string) => { if (!ok) context.addIssue({ code: 'custom', message }) }
  need(value.type !== 'text' || !!value.text, 'text 元素要给 text')
  need(value.type === 'text' || value.text === undefined, `${value.type} 不收 text；形状里的字用 label`)
  need(value.type !== 'image' || !!value.fileId, 'image 要给这张白板上已有图片的 fileId')
  need(value.type !== 'frame' || !!value.children, 'frame 要给 children（框住的元素 id，可以是空数组）')
  need(value.type !== 'freedraw' || !!value.points, 'freedraw 要给 points')
  need(!value.label || ['rectangle', 'ellipse', 'diamond', 'arrow'].includes(value.type), 'label 只用在 rectangle/ellipse/diamond/arrow 上')
  need((!value.start && !value.end) || value.type === 'arrow', 'start/end 只用在 arrow 上')
  need(!value.points || ['arrow', 'line', 'freedraw'].includes(value.type), 'points 只用在 arrow/line/freedraw 上')
})
export type Skeleton = z.infer<typeof skeletonSchema>

/** board_update: a patch to one of the AI's own elements; text changes are re-measured by the app like a draw */
export const patchSchema = z.object({
  id: elementId, x: coordinate.optional(), y: coordinate.optional(), width: size.optional(), height: size.optional(),
  text: words.optional(), points: points.optional(), ...style, ...typography,
}).strict()
export type ElementPatch = z.infer<typeof patchSchema>

/** One reason the AI gives for an erase; it is shown beside the restore button and read back in board_view */
export const eraseReason = z.string().trim().min(1).max(CANVAS_LIMITS.reason)

export function parseCanvas<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new StudioError(`${what}不合格式：${issues(result.error)}`, 400, 'board.element_invalid', { issues: issues(result.error) })
  return result.data
}

/**
 * [INPUT]: 服务端区块的列（x）与顺序（y）、渲染后实测高度、白板视口宽度
 * [OUTPUT]: BOARD 尺寸常量；columnPlan：100% 下放得下几列（1–3）与列宽；flowLayout：按服务端顺序依次排进最矮的那列
 * [POS]: 白板的显示层排版（S5 返工 B1）——能读优先、默认 100%，服务端坐标不动；P1 做「拖位置」时再议
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export const BOARD = {
  /** 白板边框离视口左缘，与面板内边距同为 14 */
  INSET: 14,
  /** 边框顶离视口顶：留出左上角张标签浮层（W2：浮层顶 12 + 单行高 30 + 12 = 54 ≤ 64，首屏不压区块标题）；
   *  边框标签在边框上方 20px，落在 44–61，窄白板段里也不与浮层（12–42）重叠 */
  TOP: 64,
  /** 边框贴着内容的内距（B4：40 → 24） */
  PAD: 24,
  GAP: 24,
  MIN_COL: 300,
  MAX_COL: 440,
  MAX_COLS: 3,
} as const

export interface Placed { x: number; y: number; w: number }
interface Flowing { id: string; x: number; y: number; h: number }

/** 视口宽度 → 列数与列宽。放不下一列最小宽时仍排一列，宽度跟着视口收。 */
export function columnPlan(viewportWidth: number) {
  const { INSET, PAD, GAP, MIN_COL, MAX_COL, MAX_COLS } = BOARD
  const room = viewportWidth - 2 * (INSET + PAD)
  if (room <= 0) return { columns: 1, width: 400 }
  const columns = Math.max(1, Math.min(MAX_COLS, Math.floor((room + GAP) / (MIN_COL + GAP))))
  return { columns, width: Math.floor(Math.min(MAX_COL, (room - (columns - 1) * GAP) / columns)) }
}

/** 服务端顺序（先列 x、再 y）依次放进当前最矮的列；高度先用实测，没量到用服务端估高。 */
export function flowLayout(blocks: Flowing[], heights: Record<string, number>, viewportWidth: number) {
  const { columns, width } = columnPlan(viewportWidth)
  const bottoms = Array.from({ length: columns }, () => 0)
  const placed = new Map<string, Placed>()
  for (const block of [...blocks].sort((a, b) => a.x - b.x || a.y - b.y)) {
    const column = bottoms.indexOf(Math.min(...bottoms))
    placed.set(block.id, { x: column * (width + BOARD.GAP), y: bottoms[column]!, w: width })
    bottoms[column] = bottoms[column]! + (heights[block.id] ?? block.h) + BOARD.GAP
  }
  const used = Math.max(1, Math.min(columns, blocks.length))
  return { placed, columns, width, height: Math.max(0, ...bottoms.map(bottom => bottom - BOARD.GAP)), span: used * width + (used - 1) * BOARD.GAP }
}

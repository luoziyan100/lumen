/**
 * [INPUT]: studio/layout.ts 的按宽排列（纯函数）
 * [OUTPUT]: B1 证据：列数随视口宽度 1–3、列宽有上下限、按服务端顺序排进最矮的列、区块不出视口左缘、边框贴内容
 * [POS]: 白板显示层排版的单元验证；真实像素与截图由 tmp 下的浏览器布局断言负责
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { BOARD, columnPlan, flowLayout } from '../src/mastra/studio/layout.ts'

test('列数随宽度：1440 整屏两列、分屏一列、很宽时三列，列宽不超过上限', () => {
  assert.deepEqual(columnPlan(878), { columns: 2, width: 389 })
  assert.equal(columnPlan(1500).columns, 3)
  assert.equal(columnPlan(3000).width, BOARD.MAX_COL)
  assert.deepEqual(columnPlan(362), { columns: 1, width: 286 })
  assert.equal(columnPlan(0).columns, 1)
})

test('按服务端顺序（列 x，再 y）依次排进最矮的列；坐标都从 0 起，不出左缘', () => {
  const blocks = [
    { id: 'c', x: 864, y: 0, h: 100 },
    { id: 'a', x: 0, y: 0, h: 500 },
    { id: 'b', x: 432, y: 0, h: 300 },
    { id: 'd', x: 432, y: 334, h: 200 },
  ]
  const { placed, columns, width, height, span } = flowLayout(blocks, { a: 500, b: 300, c: 100, d: 200 }, 878)
  assert.equal(columns, 2)
  assert.deepEqual(placed.get('a'), { x: 0, y: 0, w: width })
  assert.deepEqual(placed.get('b'), { x: width + BOARD.GAP, y: 0, w: width })
  // b 那列更矮：d 跟在 b 下面，c 再落到更矮的那列
  assert.deepEqual(placed.get('d'), { x: width + BOARD.GAP, y: 300 + BOARD.GAP, w: width })
  assert.equal(placed.get('c')!.y, Math.min(500, 300 + BOARD.GAP + 200) + BOARD.GAP)
  assert.ok([...placed.values()].every(item => item.x >= 0 && item.x + item.w <= span))
  assert.equal(span, 2 * width + BOARD.GAP)
  assert.equal(height, Math.max(...[...placed.entries()].map(([id, item]) => item.y + ({ a: 500, b: 300, c: 100, d: 200 } as Record<string, number>)[id]!)))
})

test('一块时边框只包一列', () => {
  const { span, width } = flowLayout([{ id: 'a', x: 0, y: 0, h: 120 }], {}, 1500)
  assert.equal(span, width)
})

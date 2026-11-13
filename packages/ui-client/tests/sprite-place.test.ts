/**
 * [INPUT]: sprite-place 的纯函数（锚点、夹取、象限、浮窗、迁移、动画参数）
 * [OUTPUT]: M2–M5、M11、M12 的纯函数证据——最近边选择、缩小夹取/放大恢复、旧 Shape 迁移与非法回退、4px 阈值、象限决定浮窗方向并夹取、拖浮窗带着锚点走、Alt+方向键 16px 夹取、减弱动效参数
 * [POS]: 精灵位置模型的单元验收；交互（拖、点、动画倒放）在 sprite-move.test.ts，像素在浏览器断言脚本
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_ANCHOR, DEFAULT_SHAPE, EDGE, ORB, anchorAt, anchorOfWindow, isDrag, nudge, orbPoint, originOf, parseShape, spriteMotion, windowAt } from '../src/mastra/studio/sprite-place.ts'

const W = 1440, H = 900

test('锚点：横纵各取松手时更近的一边，存到那条边的距离', () => {
  assert.deepEqual(anchorAt({ x: 100, y: 120 }, W, H), { h: 'left', dx: 100, v: 'top', dy: 120 })
  assert.deepEqual(anchorAt({ x: 1200, y: 700 }, W, H), { h: 'right', dx: W - 1200 - ORB, v: 'bottom', dy: H - 700 - ORB })
  // 正中偏左一点仍算左；恰好居中取左/上
  assert.equal(anchorAt({ x: (W - ORB) / 2, y: (H - ORB) / 2 }, W, H).h, 'left')
  assert.equal(anchorAt({ x: (W - ORB) / 2 + 1, y: 0 }, W, H).h, 'right')
  // 来回换算不漂
  for (const point of [{ x: 8, y: 8 }, { x: 700, y: 30 }, { x: 1380, y: 840 }, { x: 300, y: 600 }]) assert.deepEqual(orbPoint(anchorAt(point, W, H), W, H), point)
})

test('锚点：松手位置先夹进视口（四边 8px）', () => {
  assert.deepEqual(orbPoint(anchorAt({ x: -40, y: -40 }, W, H), W, H), { x: EDGE, y: EDGE })
  assert.deepEqual(orbPoint(anchorAt({ x: 5000, y: 5000 }, W, H), W, H), { x: W - EDGE - ORB, y: H - EDGE - ORB })
})

test('视口缩放：缩小时只在显示时夹取，锚点不变，放大后回到原来的相对位置', () => {
  const anchor = anchorAt({ x: 1300, y: 300 }, W, H)   // 离右 88、离上 300
  assert.deepEqual([anchor.h, anchor.dx, anchor.v, anchor.dy], ['right', 88, 'top', 300])
  const small = orbPoint(anchor, 1024, 320)
  assert.deepEqual(small, { x: 1024 - 88 - ORB, y: 320 - EDGE - ORB }, '变窄仍离右 88；变矮夹回底边 8px')
  assert.deepEqual(orbPoint(anchor, 120, 200), { x: EDGE, y: 200 - EDGE - ORB }, '窄到放不下离右 88 时夹到左边 8px')
  assert.deepEqual(orbPoint(anchor, W, H), { x: 1300, y: 300 }, '回到 1440×900 原位')
  // 离左存的在变窄时不动，离右存的跟着右边走
  assert.equal(orbPoint(anchorAt({ x: 100, y: 100 }, W, H), 1024, 768).x, 100)
})

test('迁移：旧 Shape 只有 x/y/w/h 时位置回默认、大小与开合保留；缺字段与非法字段逐项回退', () => {
  assert.deepEqual(parseShape(JSON.stringify({ open: true, docked: false, x: 900, y: 200, w: 480, h: 600 })), { open: true, docked: false, anchor: DEFAULT_ANCHOR, w: 480, h: 600 })
  assert.deepEqual(parseShape(null), DEFAULT_SHAPE)
  assert.deepEqual(parseShape('不是 JSON'), DEFAULT_SHAPE)
  assert.deepEqual(parseShape('[1,2]'), DEFAULT_SHAPE)
  assert.deepEqual(parseShape(JSON.stringify({ open: 'yes', docked: 1, w: 100, h: -1, anchor: { h: 'middle', dx: 10, v: 'top', dy: 10 } })), DEFAULT_SHAPE)
  assert.deepEqual(parseShape(JSON.stringify({ anchor: { h: 'left', dx: Number.NaN, v: 'top', dy: 10 } })).anchor, DEFAULT_ANCHOR, 'NaN 序列化成 null 也回默认')
  assert.deepEqual(parseShape(JSON.stringify({ anchor: { h: 'left', dx: -5, v: 'top', dy: 10 } })).anchor, DEFAULT_ANCHOR)
  const kept = { h: 'right' as const, dx: 40, v: 'bottom' as const, dy: 30 }
  assert.deepEqual(parseShape(JSON.stringify({ anchor: kept })).anchor, kept)
})

test('默认位置与上一版一致：1440×900 下离右 311（右栏与内边距之外）、离底 69（缩放条之上）', () => {
  assert.deepEqual(orbPoint(DEFAULT_ANCHOR, W, H), { x: W - 311 - ORB, y: H - 69 - ORB })
})

test('拖与点：按下后移动超过 4px 才算拖', () => {
  assert.equal(isDrag(0, 0), false)
  assert.equal(isDrag(4, 0), false)
  assert.equal(isDrag(3, 2.6), false)
  assert.equal(isDrag(3, 3), true)
  assert.equal(isDrag(0, -5), true)
})

test('浮窗：头像所在象限决定往哪长，头像那个角与浮窗的角重合；放不下夹回视口', () => {
  const size = { w: 420, h: 560 }
  const topLeft = windowAt({ x: 100, y: 100 }, size, W, H)
  assert.deepEqual([topLeft.x, topLeft.y, topLeft.corner.h, topLeft.corner.v], [100, 100, 'left', 'top'])
  const bottomRight = windowAt({ x: 1200, y: 760 }, size, W, H)
  assert.deepEqual([bottomRight.x + bottomRight.w, bottomRight.y + bottomRight.h, bottomRight.corner.h, bottomRight.corner.v], [1200 + ORB, 760 + ORB, 'right', 'bottom'])
  const topRight = windowAt({ x: 1300, y: 60 }, size, W, H)
  assert.deepEqual([topRight.x + topRight.w, topRight.y, topRight.corner.h, topRight.corner.v], [1300 + ORB, 60, 'right', 'top'])
  // 下半边、窗比剩余高度高：往上长，顶夹在 8px
  const tall = windowAt({ x: 100, y: 470 }, { w: 420, h: 900 }, W, H)
  assert.deepEqual([tall.y, tall.h, tall.corner.v], [EDGE, H - 2 * EDGE, 'bottom'])
  // 窗口很小时整窗夹进 8px 边距
  const tiny = windowAt({ x: 600, y: 400 }, size, 380, 420)
  assert.ok(tiny.x >= EDGE && tiny.y >= EDGE && tiny.x + tiny.w <= 380 - EDGE && tiny.y + tiny.h <= 420 - EDGE, JSON.stringify(tiny))
  // 左半边往右长，但右边放不下（窄视口）：横向夹取
  const clamped = windowAt({ x: 250, y: 100 }, size, 640, H)
  assert.equal(clamped.corner.h, 'left')
  assert.equal(clamped.x + clamped.w, 640 - EDGE)
})

test('拖浮窗带着锚点走：头像落在浮窗靠视口那一侧的角上，再从它展开得到同一个浮窗', () => {
  const size = { w: 420, h: 560 }
  for (const rect of [{ x: 40, y: 30 }, { x: 960, y: 300 }, { x: 60, y: 320 }, { x: 1000, y: 20 }]) {
    const anchor = anchorOfWindow({ ...rect, ...size }, W, H)
    const again = windowAt(orbPoint(anchor, W, H), size, W, H)
    assert.deepEqual([again.x, again.y], [rect.x, rect.y], `${JSON.stringify(rect)} → ${JSON.stringify(anchor)}`)
  }
  // 右下的窗：头像在它的右下角
  const anchor = anchorOfWindow({ x: 960, y: 300, ...size }, W, H)
  assert.deepEqual(orbPoint(anchor, W, H), { x: 960 + 420 - ORB, y: 300 + 560 - ORB })
})

test('Alt+方向键：每次 16px，同样夹取；其他键不处理', () => {
  const start = anchorAt({ x: 100, y: 100 }, W, H)
  assert.deepEqual(orbPoint(nudge(start, 'ArrowRight', W, H)!, W, H), { x: 116, y: 100 })
  assert.deepEqual(orbPoint(nudge(start, 'ArrowUp', W, H)!, W, H), { x: 100, y: 84 })
  const corner = anchorAt({ x: EDGE + 4, y: EDGE }, W, H)
  assert.deepEqual(orbPoint(nudge(corner, 'ArrowLeft', W, H)!, W, H), { x: EDGE, y: EDGE })
  assert.deepEqual(orbPoint(nudge(corner, 'ArrowUp', W, H)!, W, H), { x: EDGE + 4, y: EDGE })
  assert.equal(nudge(start, 'Enter', W, H), null)
})

test('动画参数：展开 260ms 缓出、收起 200ms 缓入，只有 transform 与 opacity；减弱动效时两向都只淡 120ms', () => {
  const open = spriteMotion('open', false), close = spriteMotion('close', false)
  assert.deepEqual([open.duration, open.easing], [260, 'cubic-bezier(0.2, 0.8, 0.2, 1)'])
  assert.deepEqual(open.window, [{ transform: 'scale(0.2)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }])
  assert.deepEqual(open.orb[1], { transform: 'scale(0.6)', opacity: 0 })
  assert.equal(close.duration, 200)
  assert.deepEqual(close.window, [...open.window].reverse())
  for (const motion of [open, close]) for (const frame of [...motion.window, ...motion.orb]) assert.deepEqual(Object.keys(frame).sort().filter(key => !['opacity', 'transform'].includes(key)), [])
  for (const direction of ['open', 'close'] as const) {
    const reduced = spriteMotion(direction, true)
    assert.equal(reduced.duration, 120)
    for (const frame of [...reduced.window, ...reduced.orb]) assert.deepEqual(Object.keys(frame), ['opacity'], '减弱动效不缩放')
  }
  assert.deepEqual(originOf({ x: 100, y: 200 }, { x: 80, y: 150, w: 420, h: 560 }), { x: 46, y: 76 })
})

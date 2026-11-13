/**
 * [INPUT]: 视口宽高、头像与浮窗的像素位置、localStorage 里的旧/新 Shape、prefers-reduced-motion
 * [OUTPUT]: 精灵的唯一位置——Anchor（横向离左或离右、纵向离上或离下，取松手时更近的一边）与换算：orbPoint / anchorAt（夹进视口 8px）、
 *           windowAt（按头像象限决定浮窗往哪长，放不下夹回）、anchorOfWindow（拖浮窗带着锚点走）、nudge（Alt+方向键 16px）、isDrag（4px 阈值）；
 *           parseShape（旧 x/y/w/h 迁移、缺字段或非法时回默认）与 load/saveShape；spriteMotion（展开/收起关键帧与时长，减弱动效只淡入淡出）、originOf
 * [POS]: Sprite 的纯函数层，不碰 DOM；存相对边距而不是绝对坐标，窗口缩小时只在显示时夹取，放大后回到原来的相对位置
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

/** 头像直径、离视口边的最小距离、拖与点的阈值、Alt+方向键步长 */
export const ORB = 52
export const EDGE = 8
export const DRAG_THRESHOLD = 4
export const NUDGE = 16
export const SPRITE_KEY = 'lumen.studio.sprite'

export interface Anchor { h: 'left' | 'right'; dx: number; v: 'top' | 'bottom'; dy: number }
export interface Shape { open: boolean; docked: boolean; anchor: Anchor; w: number; h: number }
export interface Point { x: number; y: number }
export interface Rect extends Point { w: number; h: number }

/** 默认位置与上一版一致：白板区右下角、缩放条上方。
 *  右：外边距 8 + 右栏 280 + 间距 8 + 面板边 1 + 内边距 14 = 311；下：外边距 8 + 面板边 1 + 缩放条让出 60 = 69 */
export const DEFAULT_ANCHOR: Anchor = { h: 'right', dx: 311, v: 'bottom', dy: 69 }
export const DEFAULT_SHAPE: Shape = { open: false, docked: false, anchor: DEFAULT_ANCHOR, w: 420, h: 560 }
const MIN_W = 320, MIN_H = 360

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, high))
const finite = (value: unknown, min: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min

/** 读旧数据：只有 x/y/w/h 的旧 Shape 保留大小与开合，位置回默认；字段缺失或非法时逐项回默认 */
export function parseShape(raw: string | null): Shape {
  let data: Record<string, unknown> = {}
  try {
    const value: unknown = JSON.parse(raw ?? '{}')
    if (value && typeof value === 'object' && !Array.isArray(value)) data = value as Record<string, unknown>
  } catch { /* 坏数据按空处理 */ }
  const stored = data.anchor && typeof data.anchor === 'object' ? data.anchor as Record<string, unknown> : null
  const anchor: Anchor = stored && (stored.h === 'left' || stored.h === 'right') && (stored.v === 'top' || stored.v === 'bottom') && finite(stored.dx, 0) && finite(stored.dy, 0)
    ? { h: stored.h, dx: stored.dx, v: stored.v, dy: stored.dy } : DEFAULT_ANCHOR
  return {
    open: data.open === true, docked: data.docked === true, anchor,
    w: finite(data.w, MIN_W) ? data.w : DEFAULT_SHAPE.w, h: finite(data.h, MIN_H) ? data.h : DEFAULT_SHAPE.h,
  }
}
export function loadShape(): Shape {
  try { return parseShape(localStorage.getItem(SPRITE_KEY)) } catch { return DEFAULT_SHAPE }
}
export function saveShape(shape: Shape) {
  try { localStorage.setItem(SPRITE_KEY, JSON.stringify(shape)) } catch { /* 存不下就只在本次有效 */ }
}

/** 头像整圆留在视口里，四边各 8px */
export function clampOrb(point: Point, vw: number, vh: number): Point {
  return { x: clamp(point.x, EDGE, vw - EDGE - ORB), y: clamp(point.y, EDGE, vh - EDGE - ORB) }
}
/** 锚点 → 头像左上角（显示时夹取，锚点本身不改，窗口再放大就回到原来的相对位置） */
export function orbPoint(anchor: Anchor, vw: number, vh: number): Point {
  return clampOrb({ x: anchor.h === 'left' ? anchor.dx : vw - anchor.dx - ORB, y: anchor.v === 'top' ? anchor.dy : vh - anchor.dy - ORB }, vw, vh)
}
/** 松手的位置 → 锚点：横纵各取更近的一边，存到那条边的距离 */
export function anchorAt(point: Point, vw: number, vh: number): Anchor {
  const { x, y } = clampOrb(point, vw, vh)
  const right = vw - x - ORB, bottom = vh - y - ORB
  return { h: x <= right ? 'left' : 'right', dx: Math.min(x, right), v: y <= bottom ? 'top' : 'bottom', dy: Math.min(y, bottom) }
}
/** Alt+方向键：每次 16px，同样夹取 */
export function nudge(anchor: Anchor, key: string, vw: number, vh: number): Anchor | null {
  const step = { ArrowLeft: [-NUDGE, 0], ArrowRight: [NUDGE, 0], ArrowUp: [0, -NUDGE], ArrowDown: [0, NUDGE] }[key]
  if (!step) return null
  const point = orbPoint(anchor, vw, vh)
  return anchorAt({ x: point.x + step[0]!, y: point.y + step[1]! }, vw, vh)
}
/** 按下后移动超过 4px 才算拖动 */
export function isDrag(dx: number, dy: number) { return Math.hypot(dx, dy) > DRAG_THRESHOLD }

/** 浮窗贴着头像展开：头像在右半边就往左长、在下半边就往上长，头像那个角与浮窗的角重合；放不下夹回视口 */
export function windowAt(orb: Point, size: { w: number; h: number }, vw: number, vh: number): Rect & { corner: { h: Anchor['h']; v: Anchor['v'] } } {
  const w = Math.max(0, Math.min(size.w, vw - 2 * EDGE)), h = Math.max(0, Math.min(size.h, vh - 2 * EDGE))
  const corner = { h: orb.x + ORB / 2 > vw / 2 ? 'right' as const : 'left' as const, v: orb.y + ORB / 2 > vh / 2 ? 'bottom' as const : 'top' as const }
  const x = corner.h === 'left' ? orb.x : orb.x + ORB - w, y = corner.v === 'top' ? orb.y : orb.y + ORB - h
  return { x: clamp(x, EDGE, vw - EDGE - w), y: clamp(y, EDGE, vh - EDGE - h), w, h, corner }
}
/** 拖动浮窗后锚点跟着走：头像落在浮窗靠视口那一侧的角上，再从这个头像展开会得到同一个浮窗 */
export function anchorOfWindow(rect: Rect, vw: number, vh: number): Anchor {
  const right = rect.x + rect.w / 2 > vw / 2, bottom = rect.y + rect.h / 2 > vh / 2
  return anchorAt({ x: right ? rect.x + rect.w - ORB : rect.x, y: bottom ? rect.y + rect.h - ORB : rect.y }, vw, vh)
}
/** 浮窗拖动时的位移夹取：整个浮窗留在视口里 */
export function clampWindow(rect: Rect, vw: number, vh: number): Rect {
  return { ...rect, x: clamp(rect.x, EDGE, vw - EDGE - rect.w), y: clamp(rect.y, EDGE, vh - EDGE - rect.h) }
}

/** 展开时的缩放原点：头像中心相对浮窗左上角 */
export function originOf(orb: Point, rect: Rect) {
  return { x: orb.x + ORB / 2 - rect.x, y: orb.y + ORB / 2 - rect.y }
}

export interface Motion { duration: number; easing: string; window: Keyframe[]; orb: Keyframe[] }
/** 展开 260ms 缓出、收起 200ms 缓入，只动 transform 与 opacity；减弱动效时两向都是 120ms 透明度 */
export function spriteMotion(direction: 'open' | 'close', reduced: boolean): Motion {
  if (reduced) {
    const window = [{ opacity: 0 }, { opacity: 1 }], orb = [{ opacity: 1 }, { opacity: 0 }]
    return direction === 'open' ? { duration: 120, easing: 'linear', window, orb } : { duration: 120, easing: 'linear', window: [...window].reverse(), orb: [...orb].reverse() }
  }
  const window = [{ transform: 'scale(0.2)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }]
  const orb = [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0.6)', opacity: 0 }]
  return direction === 'open'
    ? { duration: 260, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', window, orb }
    : { duration: 200, easing: 'cubic-bezier(0.4, 0, 1, 1)', window: [...window].reverse(), orb: [...orb].reverse() }
}

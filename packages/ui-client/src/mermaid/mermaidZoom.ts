/**
 * [INPUT]: 当前缩放/平移 + 手势因子
 * [OUTPUT]: clamp 后的 zoom / 绕锚点缩放后的 pan / 单指拖移
 * [POS]: Mermaid 放大层(双指缩放、单指拖移、滚轮/± 钮)
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 4
export const ZOOM_STEP = 0.25

export function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
}

export function zoomByStep(z: number, dir: 1 | -1): number {
  return clampZoom(Math.round((z + dir * ZOOM_STEP) * 100) / 100)
}

/** factor>1 放大; wheel pinch 常用 1 - deltaY*0.01 */
export function zoomByFactor(z: number, factor: number): number {
  if (!Number.isFinite(factor) || factor <= 0) return clampZoom(z)
  return clampZoom(z * factor)
}

/** 保持 origin(相对舞台中心)在屏幕上不动 */
export function panBy(
  pan: { x: number; y: number },
  dx: number,
  dy: number,
): { x: number; y: number } {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return pan
  return { x: pan.x + dx, y: pan.y + dy }
}

export function panForZoom(
  pan: { x: number; y: number },
  zoom: number,
  next: number,
  origin: { x: number; y: number },
): { x: number; y: number } {
  if (zoom <= 0 || next === zoom) return pan
  const k = next / zoom
  return {
    x: origin.x - (origin.x - pan.x) * k,
    y: origin.y - (origin.y - pan.y) * k,
  }
}

export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-deltaY * 0.008)
}

/** mermaid SVG 常带 width=100%+viewBox;父级 shrink-wrap 时 % 解析成 0。用 viewBox 换像素。 */
export function sizeFromViewBox(
  vbW: number,
  vbH: number,
  maxW: number,
  maxH: number,
): { w: number; h: number } {
  if (!(vbW > 0) || !(vbH > 0)) return { w: Math.max(0, maxW), h: Math.max(0, maxH) }
  const s = Math.min(maxW / vbW, maxH / vbH)
  return { w: vbW * s, h: vbH * s }
}

/** 用墨迹 bbox 收紧 viewBox(mermaid#1984 虚高空白的业界常规修法)。不改 LR/TB。 */
export function viewBoxFromBBox(
  box: { x: number; y: number; width: number; height: number },
  pad = 12,
): { x: number; y: number; w: number; h: number } | null {
  if (!(box.width > 1) || !(box.height > 1)) return null
  return {
    x: box.x - pad,
    y: box.y - pad,
    w: box.width + pad * 2,
    h: box.height + pad * 2,
  }
}

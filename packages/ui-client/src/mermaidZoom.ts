/**
 * [INPUT]: 当前缩放/平移 + 手势因子
 * [OUTPUT]: clamp 后的 zoom / 绕锚点缩放后的 pan
 * [POS]: Mermaid 放大层(双指/滚轮/± 钮)
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

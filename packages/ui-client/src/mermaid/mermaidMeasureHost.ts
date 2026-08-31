/**
 * [INPUT]: mermaidLayout.normalizeSvgIntrinsicSize; mermaidZoom.viewBoxFromBBox
 * [OUTPUT]: 测量宿主 + 墨迹收紧 + 宽度分桶缓存键 —— 主流只接收已 tighten 的 final SVG
 * [POS]: MermaidBlock 的箱外测量层;host 挂 document.body,禁止进入 .messages-content
 * [PROTOCOL]: 变更时更新此头部与 doc/mermaid-pipeline.md / doc/chat-scroll-ux.md
 */

import { normalizeSvgIntrinsicSize } from './mermaidLayout.ts'
import { viewBoxFromBBox } from './mermaidZoom.ts'

export type MermaidMeasureHost = {
  root: HTMLDivElement
  width: number
  dispose: () => void
}

/** 宽度分桶,避免每 1px 都打一套缓存 */
export function widthBucket(px: number): number {
  if (!(px > 0) || !Number.isFinite(px)) return 0
  return Math.max(16, Math.round(px / 16) * 16)
}

export function mermaidLayoutCacheKey(sourceHash: string, widthPx: number): string {
  return `${sourceHash}@${widthBucket(widthPx)}`
}

export function cacheHoldsFinalSvg(entry: { svg: string | null; tightened?: boolean }): boolean {
  return Boolean(entry.svg && entry.tightened)
}

/**
 * 可布局、不可见、不在对话滚动流里。禁止 display:none(getBBox 会假)。
 */
export function createMermaidMeasureHost(columnWidth: number): MermaidMeasureHost {
  const width = Math.max(1, columnWidth)
  const root = document.createElement('div')
  root.className = 'mermaid-measure-host'
  root.setAttribute('aria-hidden', 'true')
  root.setAttribute('data-mermaid-measure', '1')
  root.style.position = 'fixed'
  root.style.left = '-10000px'
  root.style.top = '0'
  root.style.width = `${width}px`
  root.style.visibility = 'hidden'
  root.style.pointerEvents = 'none'
  root.style.zIndex = '-1'
  document.body.appendChild(root)
  return {
    root,
    width,
    dispose() {
      root.remove()
    },
  }
}

function inkBox(svg: SVGSVGElement): { x: number; y: number; width: number; height: number } | null {
  try {
    const base = svg.getBBox()
    let x = base.x
    let y = base.y
    let r = base.x + base.width
    let b = base.y + base.height
    svg.querySelectorAll('foreignObject, text, .node, .cluster, .edgeLabel').forEach((n) => {
      try {
        const bb = (n as SVGGraphicsElement).getBBox()
        if (!(bb.width > 0) || !(bb.height > 0)) return
        x = Math.min(x, bb.x)
        y = Math.min(y, bb.y)
        r = Math.max(r, bb.x + bb.width)
        b = Math.max(b, bb.y + bb.height)
      } catch { /* 未插入布局的节点 getBBox 会抛 */ }
    })
    return { x, y, width: r - x, height: b - y }
  } catch {
    return null
  }
}

/** 按墨迹收紧 viewBox;卡片高度跟图走,不跟 mermaid 虚高 viewBox 走 */
export function tightenSvgInk(svg: SVGSVGElement): void {
  if (svg.dataset.inkTight === '1') return
  const box = inkBox(svg)
  const vb = box ? viewBoxFromBBox(box) : null
  if (vb) {
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`)
    svg.setAttribute('width', String(Math.round(vb.w)))
    svg.setAttribute('height', String(Math.round(vb.h)))
  }
  normalizeSvgIntrinsicSize(svg)
  svg.dataset.inkTight = '1'
}

/** 把 raw SVG 放进测量宿主,tighten 后序列化。主流不得走这条 DOM。 */
export function tightenSvgInHost(host: HTMLElement, rawSvg: string): { svg: string; height: number } {
  host.innerHTML = rawSvg
  const svg = host.querySelector('svg')
  if (!(svg instanceof SVGSVGElement)) throw new Error('mermaid render produced no svg')
  tightenSvgInk(svg)
  const height = svg.getBoundingClientRect().height
  return { svg: svg.outerHTML, height }
}

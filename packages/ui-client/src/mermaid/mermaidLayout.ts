/**
 * [INPUT]: mermaid 的 Mermaid.registerLayoutLoaders; SVG 节点
 * [OUTPUT]: ELK 注册、flowchart initialize 合同、SVG 固有尺寸归一(剥离百分比宽与卡片 max-width)
 * [POS]: MermaidBlock 渲染前的布局/固有尺寸层;不碰 Phase A 语法闸。
 *        卡片横滚与 lightbox fit 由各自宿主 CSS 决定,禁止写进缓存 SVG。
 *        合同真源:doc/mermaid-readability.md
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { Mermaid } from 'mermaid'

export type SvgIntrinsicSizePolicy = {
  /** 缓存 SVG 不得携带卡片专属 max-width */
  maxWidth: 'none'
  height: 'auto'
  /** 禁止铺满栏;固有宽走 width 属性,不走 style.width */
  stretchWidth: false
}

/** 固有宽政策:停拉伸,同时不把栏宽收缩写进 SVG */
export const SVG_INTRINSIC_SIZE_POLICY: SvgIntrinsicSizePolicy = {
  maxWidth: 'none',
  height: 'auto',
  stretchWidth: false,
}

type StyleHost = {
  style: {
    maxWidth: string
    height: string
    width: string
    removeProperty: (name: string) => void
  }
  getAttribute?: (name: string) => string | null
  removeAttribute?: (name: string) => void
}

/** 清掉百分比宽与 inline max-width;height:auto 让属性宽驱动比例 */
export function normalizeSvgIntrinsicSize(svg: StyleHost): void {
  svg.style.removeProperty('width')
  svg.style.removeProperty('max-width')
  svg.style.height = SVG_INTRINSIC_SIZE_POLICY.height
  const attrW = svg.getAttribute?.('width')
  if (attrW && attrW.includes('%')) svg.removeAttribute?.('width')
}

export type FlowchartInitConfig = {
  useMaxWidth: false
  htmlLabels: true
  padding: 8
  defaultRenderer?: 'elk'
}

export type MermaidInitContract = {
  startOnLoad: false
  securityLevel: 'strict'
  theme: 'dark'
  darkMode: true
  themeVariables: Record<string, string>
  fontFamily?: string
  layout?: 'elk'
  flowchart: FlowchartInitConfig
}

/** AT2:注册成功才带 elk;失败调用方走 dagre,不硬崩 */
export function mermaidInitializeOptions(
  themeVariables: Record<string, string>,
  elkReady: boolean,
): MermaidInitContract {
  const flowchart: FlowchartInitConfig = {
    useMaxWidth: false,
    htmlLabels: true,
    padding: 8,
  }
  if (elkReady) flowchart.defaultRenderer = 'elk'
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'dark',
    darkMode: true,
    themeVariables,
    fontFamily: themeVariables.fontFamily,
    ...(elkReady ? { layout: 'elk' as const } : {}),
    flowchart,
  }
}

let elkPromise: Promise<boolean> | null = null

/**
 * mermaid 11 的 ELK 在独立包。注册失败返回 false,调用方仍 render(dagre)。
 */
export async function ensureElkLayout(mermaid: Pick<Mermaid, 'registerLayoutLoaders'>): Promise<boolean> {
  if (!elkPromise) {
    elkPromise = (async () => {
      try {
        const { default: loaders } = await import('@mermaid-js/layout-elk')
        mermaid.registerLayoutLoaders(loaders)
        return true
      } catch {
        return false
      }
    })()
  }
  return elkPromise
}

/** 单测用:重置 ELK 注册缓存 */
export function resetElkLayoutCache(): void {
  elkPromise = null
}

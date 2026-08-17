/**
 * [INPUT]: mermaid 的 Mermaid.registerLayoutLoaders; SVG 宿主节点
 * [OUTPUT]: ELK 注册、flowchart initialize 合同、SVG 停拉伸尺寸政策
 * [POS]: MermaidBlock 渲染前的布局/宿主尺寸层;不碰 Phase A 语法闸。
 *        方法=官方 ELK + measure-then-box;库=beautiful-mermaid 本轮不接。
 *        合同真源:doc/mermaid-readability.md
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { Mermaid } from 'mermaid'

export type SvgHostSizePolicy = {
  maxWidth: '100%'
  height: 'auto'
  /** 禁止铺满栏;固有宽走 width 属性,不走 style.width */
  stretchWidth: false
}

/** AT1:卡片内 SVG 保持固有宽,只允许 max-width 收缩 */
export const SVG_HOST_SIZE_POLICY: SvgHostSizePolicy = {
  maxWidth: '100%',
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

/** 清掉 width:100% 拉伸;保留 max-width 与 height:auto */
export function applySvgHostSize(svg: StyleHost): void {
  svg.style.maxWidth = SVG_HOST_SIZE_POLICY.maxWidth
  svg.style.height = SVG_HOST_SIZE_POLICY.height
  svg.style.removeProperty('width')
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

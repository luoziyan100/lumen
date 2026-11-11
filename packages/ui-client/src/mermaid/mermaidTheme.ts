/**
 * [INPUT]: 当前外观 token(document 根计算值);模型写出的 mermaid 源码
 * [OUTPUT]: readMermaidPalette / paletteSignature / mermaidThemeVariables / applyHostColors /
 *           subscribeMermaidPalette / getMermaidPalette —— 流程图颜色只由宿主主题决定
 * [POS]: MermaidBlock 渲染前的颜色层;取代按暗色写死的 mermaidSanitize。
 *        模型只表达语义(class ok/warn/danger/accent/muted),不决定像素颜色。
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

export type MermaidPalette = {
  dark: boolean
  fontFamily: string
  canvas: string
  node: string
  cluster: string
  ink: string
  inkMute: string
  border: string
  accent: string
  accentFill: string
  ok: string
  okFill: string
  warn: string
  warnFill: string
  danger: string
  dangerFill: string
}

type Rgba = [number, number, number, number]

function parseColor(raw: string): Rgba | null {
  const s = raw.trim().toLowerCase()
  if (s.startsWith('#')) {
    let h = s.slice(1)
    if (h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join('')
    if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(h)) return null
    const alpha = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), alpha]
  }
  const m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/)
  if (!m) return null
  const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4])
  return [Number(m[1]), Number(m[2]), Number(m[3]), Math.max(0, Math.min(1, a))]
}

const hex = (rgb: number[]) => `#${rgb.slice(0, 3).map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`

/** mermaid 的颜色推导需要不透明色:半透明 token 先压到画布底色上 */
function opaque(raw: string, over: Rgba, fallback: string): string {
  const c = parseColor(raw)
  if (!c) return fallback
  const a = c[3]
  return hex([0, 1, 2].map(i => c[i]! * a + over[i]! * (1 - a)))
}

function luminance([r, g, b]: Rgba): number {
  const lin = (v: number) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** 从 token 读取器生成调色板;读取器可为 getComputedStyle 或测试表 */
export function readMermaidPalette(token: (name: string) => string): MermaidPalette {
  const read = (name: string) => token(name).trim()
  const canvasRgba = parseColor(read('--surface-base')) ?? [20, 22, 28, 1]
  const canvas = hex(canvasRgba)
  const dark = luminance(canvasRgba) < 0.4
  const pick = (name: string, fallback: string) => opaque(read(name), canvasRgba, fallback)
  const ink = pick('--ink', dark ? '#e8eaee' : '#18212d')
  return {
    dark,
    fontFamily: read('--font-sans') || 'sans-serif',
    canvas,
    node: pick('--surface-elevated', canvas),
    cluster: pick('--surface-recessed', canvas),
    ink,
    inkMute: pick('--ink-mute', ink),
    border: pick('--ink-faint', ink),
    accent: pick('--ember', ink),
    accentFill: pick('--ember-tint', canvas),
    ok: pick('--moss', ink),
    okFill: pick('--moss-tint', canvas),
    warn: pick('--warning', ink),
    warnFill: pick('--warning-bg', canvas),
    danger: pick('--danger', ink),
    dangerFill: pick('--danger-bg', canvas),
  }
}

export function paletteSignature(p: MermaidPalette): string {
  return Object.values(p).join('|')
}

/** theme:'base' 是 mermaid 唯一完整采用 themeVariables 的主题 */
export function mermaidThemeVariables(p: MermaidPalette): Record<string, string | boolean> {
  return {
    darkMode: p.dark,
    background: p.canvas,
    fontFamily: p.fontFamily,
    primaryColor: p.node,
    primaryTextColor: p.ink,
    primaryBorderColor: p.border,
    secondaryColor: p.cluster,
    secondaryTextColor: p.ink,
    secondaryBorderColor: p.border,
    tertiaryColor: p.cluster,
    tertiaryTextColor: p.ink,
    tertiaryBorderColor: p.border,
    mainBkg: p.node,
    nodeBorder: p.border,
    clusterBkg: p.cluster,
    clusterBorder: p.border,
    lineColor: p.inkMute,
    textColor: p.ink,
    titleColor: p.ink,
    edgeLabelBackground: p.canvas,
    noteBkgColor: p.accentFill,
    noteTextColor: p.ink,
    noteBorderColor: p.accent,
    actorBkg: p.node,
    actorBorder: p.border,
    actorTextColor: p.ink,
    signalColor: p.inkMute,
    signalTextColor: p.ink,
  }
}

/** 模型可用的语义名;别名指向同一组颜色 */
const SEMANTIC: Record<string, (p: MermaidPalette) => [fill: string, stroke: string, color: string]> = {
  ok: p => [p.okFill, p.ok, p.ink],
  success: p => [p.okFill, p.ok, p.ink],
  warn: p => [p.warnFill, p.warn, p.ink],
  warning: p => [p.warnFill, p.warn, p.ink],
  danger: p => [p.dangerFill, p.danger, p.ink],
  error: p => [p.dangerFill, p.danger, p.ink],
  accent: p => [p.accentFill, p.accent, p.ink],
  primary: p => [p.accentFill, p.accent, p.ink],
  focus: p => [p.accentFill, p.accent, p.ink],
  highlight: p => [p.accentFill, p.accent, p.ink],
  muted: p => [p.cluster, p.border, p.inkMute],
  secondary: p => [p.cluster, p.border, p.inkMute],
}

const COLOR_PROP = /^(fill|color|stroke|background|bg)$/i

/** 去掉 style/classDef/linkStyle 中的颜色属性,保留线宽等非颜色属性 */
function stripColorProps(body: string): string {
  return body.split(',').map(part => part.trim()).filter(part => {
    const key = part.split(':')[0]?.trim() ?? ''
    return part && !COLOR_PROP.test(key)
  }).join(',')
}

/**
 * 宿主颜色裁决:剥掉模型写的 init 配置与字面颜色;用到的语义 class 按当前主题定义。
 * 不改节点、边与标签。
 */
export function applyHostColors(source: string, p: MermaidPalette): { source: string; actions: string[] } {
  const actions: string[] = []
  let text = source.replace(/\r\n/g, '\n')
  text = text.replace(/%%\{\s*init[\s\S]*?\}%%[ \t]*\n?/g, () => { actions.push('strip-init'); return '' })
  text = text.replace(/^([ \t]*)(style|classDef|linkStyle)[ \t]+(\S+)[ \t]+(.+?)[ \t]*$/gm, (full, indent: string, kind: string, target: string, body: string) => {
    if (kind === 'classDef' && SEMANTIC[target.toLowerCase()]) { actions.push(`semantic:${target}`); return '' }
    const kept = stripColorProps(body)
    if (kept === body.trim()) return full
    actions.push(`strip-color:${kind}`)
    return kept ? `${indent}${kind} ${target} ${kept}` : ''
  })
  const used = new Set<string>()
  for (const m of text.matchAll(/^[ \t]*class[ \t]+[^\n]*?[ \t]+([A-Za-z_]\w*)[ \t]*$/gm)) used.add(m[1]!.toLowerCase())
  for (const m of text.matchAll(/:::([A-Za-z_]\w*)/g)) used.add(m[1]!.toLowerCase())
  const defs = [...used].flatMap(name => {
    const style = SEMANTIC[name]
    if (!style) return []
    const [fill, stroke, color] = style(p)
    return [`classDef ${name} fill:${fill},stroke:${stroke},color:${color}`]
  })
  if (defs.length) {
    actions.push(...defs.map(def => `define:${def.split(' ')[1]}`))
    text = `${text.trimEnd()}\n${defs.join('\n')}\n`
  }
  return { source: text, actions }
}

// --- 外观切换只改根元素 style/data-*;共享一个观察者,签名变化才通知 ---
let current: MermaidPalette | null = null
const listeners = new Set<() => void>()
let observer: MutationObserver | null = null

function computePalette(): MermaidPalette {
  const style = getComputedStyle(document.documentElement)
  return readMermaidPalette(name => style.getPropertyValue(name))
}

export function getMermaidPalette(): MermaidPalette {
  if (!current) current = computePalette()
  return current
}

export function subscribeMermaidPalette(listener: () => void): () => void {
  listeners.add(listener)
  if (!observer && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(() => {
      const next = computePalette()
      if (current && paletteSignature(next) === paletteSignature(current)) return
      current = next
      for (const notify of listeners) notify()
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-skin', 'data-material', 'data-appearance'] })
  }
  return () => {
    listeners.delete(listener)
    if (!listeners.size) { observer?.disconnect(); observer = null; current = null }
  }
}

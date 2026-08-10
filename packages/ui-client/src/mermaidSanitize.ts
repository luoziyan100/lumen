/**
 * [INPUT]: mermaid 源码(含 style / classDef / class);glass 暗色固定 hex 表
 * [OUTPUT]: sanitizeMermaidSource → 宿主裁决后的源码 + 动作日志;
 *           enforceNodeStyle / contrastRatio / parseStyleProps 供单测
 * [POS]: MermaidBlock 渲染前闸;Policy v0 中性底座 + v1 语义 class + v2 字面色对比度门禁
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 *
 * 原则:颜色可建议,像素必须过宿主验收。不可读比「色不对」更严重。
 */

export interface NodeStyle {
  fill?: string
  color?: string
  stroke?: string
  /** 透传的非颜色属性,如 stroke-width */
  extra?: string[]
}

export type ColorFailAction = 'remap-text' | 'remap-fill' | 'strip-to-neutral'

export interface ColorPolicy {
  /** 是否接受 #hex 字面色;false 则凡字面色均剥到中性/语义 */
  allowLiteralColors: boolean
  minContrast: number
  onFail: ColorFailAction
}

export interface SanitizeResult {
  source: string
  actions: string[]
}

/** 与 tokens.css glass 暗色对齐的实色(mermaid style 不吃 rgba 时更稳) */
export const GLASS_PALETTE = {
  ink: '#E8EAEE',
  inkOnLight: '#211F1C',
  mute: '#9AA3B2',
  line: '#5A6270',
  surface: '#252833',
  surfaceDeep: '#1A1D26',
  surfaceRaised: '#2E323E',
  border: '#3A4050',
  accentFill: '#1E322A',
  accentStroke: '#6BC49A',
  okFill: '#1F3326',
  okStroke: '#7FCF9E',
  warnFill: '#3A2F17',
  warnStroke: '#D4A94F',
  dangerFill: '#3D231C',
  dangerStroke: '#E08A72',
  clusterFill: '#161820',
  clusterStroke: '#3A4050',
} as const

const DEFAULT_STYLE: Required<Pick<NodeStyle, 'fill' | 'color' | 'stroke'>> = {
  fill: GLASS_PALETTE.surface,
  color: GLASS_PALETTE.ink,
  stroke: GLASS_PALETTE.border,
}

/** 语义角色 → 固定节点样式(v1) */
export const SEMANTIC_STYLES: Record<string, Required<Pick<NodeStyle, 'fill' | 'color' | 'stroke'>>> = {
  default: { ...DEFAULT_STYLE },
  muted: {
    fill: GLASS_PALETTE.surfaceDeep,
    color: GLASS_PALETTE.mute,
    stroke: GLASS_PALETTE.border,
  },
  secondary: {
    fill: GLASS_PALETTE.surfaceDeep,
    color: GLASS_PALETTE.mute,
    stroke: GLASS_PALETTE.border,
  },
  accent: {
    fill: GLASS_PALETTE.accentFill,
    color: GLASS_PALETTE.ink,
    stroke: GLASS_PALETTE.accentStroke,
  },
  focus: {
    fill: GLASS_PALETTE.accentFill,
    color: GLASS_PALETTE.ink,
    stroke: GLASS_PALETTE.accentStroke,
  },
  primary: {
    fill: GLASS_PALETTE.accentFill,
    color: GLASS_PALETTE.ink,
    stroke: GLASS_PALETTE.accentStroke,
  },
  ok: {
    fill: GLASS_PALETTE.okFill,
    color: GLASS_PALETTE.ink,
    stroke: GLASS_PALETTE.okStroke,
  },
  success: {
    fill: GLASS_PALETTE.okFill,
    color: GLASS_PALETTE.ink,
    stroke: GLASS_PALETTE.okStroke,
  },
  warn: {
    fill: GLASS_PALETTE.warnFill,
    color: GLASS_PALETTE.ink,
    stroke: GLASS_PALETTE.warnStroke,
  },
  warning: {
    fill: GLASS_PALETTE.warnFill,
    color: GLASS_PALETTE.ink,
    stroke: GLASS_PALETTE.warnStroke,
  },
  danger: {
    fill: GLASS_PALETTE.dangerFill,
    color: GLASS_PALETTE.ink,
    stroke: GLASS_PALETTE.dangerStroke,
  },
  error: {
    fill: GLASS_PALETTE.dangerFill,
    color: GLASS_PALETTE.ink,
    stroke: GLASS_PALETTE.dangerStroke,
  },
  cluster: {
    fill: GLASS_PALETTE.clusterFill,
    color: GLASS_PALETTE.ink,
    stroke: GLASS_PALETTE.clusterStroke,
  },
}

export const DEFAULT_COLOR_POLICY: ColorPolicy = {
  allowLiteralColors: true,
  minContrast: 4.5,
  onFail: 'remap-text',
}

const COLOR_KEYS = new Set(['fill', 'color', 'stroke', 'bg', 'background'])

/** 解析 #rgb / #rrggbb / #rrggbbaa / rgb() / rgba() → [r,g,b] 0-255;失败 null */
export function parseColorToRgb(raw: string): [number, number, number] | null {
  const s = raw.trim().toLowerCase()
  if (!s) return null
  if (s.startsWith('#')) {
    let h = s.slice(1)
    if (h.length === 3) h = h.split('').map((c) => c + c).join('')
    if (h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('') // #rgba → rgb
    if (h.length === 8) h = h.slice(0, 6) // drop aa
    if (h.length !== 6 || !/^[0-9a-f]+$/.test(h)) return null
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  const m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/)
  if (m) {
    return [clamp255(Number(m[1])), clamp255(Number(m[2])), clamp255(Number(m[3]))]
  }
  return null
}

function clamp255(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(255, Math.round(n)))
}

function srgbToLin(c: number): number {
  const x = c / 255
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}

/** WCAG 相对亮度 0–1 */
export function relativeLuminance(raw: string): number | null {
  const rgb = parseColorToRgb(raw)
  if (!rgb) return null
  const [r, g, b] = rgb.map(srgbToLin) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  if (la == null || lb == null) return null
  const light = Math.max(la, lb)
  const dark = Math.min(la, lb)
  return (light + 0.05) / (dark + 0.05)
}

/** 按底色亮度选字色 */
export function pickTextOn(fill: string): string {
  const l = relativeLuminance(fill)
  if (l == null) return GLASS_PALETTE.ink
  return l > 0.45 ? GLASS_PALETTE.inkOnLight : GLASS_PALETTE.ink
}

export function isSemanticClass(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(SEMANTIC_STYLES, name.toLowerCase())
}

export function semanticStyle(name: string): Required<Pick<NodeStyle, 'fill' | 'color' | 'stroke'>> | null {
  return SEMANTIC_STYLES[name.toLowerCase()] ?? null
}

/** 解析 fill:#x,color:#y,stroke-width:2 → NodeStyle */
export function parseStyleProps(body: string): NodeStyle {
  const extra: string[] = []
  const out: NodeStyle = {}
  for (const part of body.split(',')) {
    const seg = part.trim()
    if (!seg) continue
    const i = seg.indexOf(':')
    if (i < 0) {
      extra.push(seg)
      continue
    }
    const key = seg.slice(0, i).trim().toLowerCase()
    const val = seg.slice(i + 1).trim()
    if (key === 'fill' || key === 'bg' || key === 'background') out.fill = val
    else if (key === 'color') out.color = val
    else if (key === 'stroke') out.stroke = val
    else extra.push(seg)
  }
  if (extra.length) out.extra = extra
  return out
}

export function formatStyleProps(style: NodeStyle): string {
  const parts: string[] = []
  if (style.fill) parts.push(`fill:${style.fill}`)
  if (style.color) parts.push(`color:${style.color}`)
  if (style.stroke) parts.push(`stroke:${style.stroke}`)
  if (style.extra?.length) parts.push(...style.extra)
  return parts.join(',')
}

function hasLiteralColor(style: NodeStyle): boolean {
  for (const v of [style.fill, style.color, style.stroke]) {
    if (v && parseColorToRgb(v)) return true
  }
  return false
}

/**
 * v2 门禁:保证 fill/color 对比度;失败按 policy 修。
 * 无 fill 时用默认 surface;无 color 时按 fill 选字。
 */
export function enforceNodeStyle(
  input: NodeStyle,
  policy: ColorPolicy = DEFAULT_COLOR_POLICY,
): { style: NodeStyle; action: string } {
  const extra = input.extra

  if (!policy.allowLiteralColors && hasLiteralColor(input)) {
    return {
      style: { ...DEFAULT_STYLE, extra },
      action: 'strip-literal-disabled',
    }
  }

  // 无法解析的色值 → 中性,避免透传垃圾
  const fillRaw = input.fill
  const colorRaw = input.color
  const strokeRaw = input.stroke
  if (fillRaw && !parseColorToRgb(fillRaw)) {
    return { style: { ...DEFAULT_STYLE, extra }, action: 'strip-unparsed-fill' }
  }
  if (colorRaw && !parseColorToRgb(colorRaw)) {
    return { style: { ...DEFAULT_STYLE, fill: fillRaw ?? DEFAULT_STYLE.fill, extra }, action: 'strip-unparsed-color' }
  }

  let fill = fillRaw ?? DEFAULT_STYLE.fill
  let color = colorRaw ?? pickTextOn(fill)
  let stroke = strokeRaw
  if (stroke && !parseColorToRgb(stroke)) stroke = DEFAULT_STYLE.stroke

  const ratio = contrastRatio(fill, color)
  if (ratio != null && ratio >= policy.minContrast) {
    return {
      style: {
        fill,
        color,
        stroke: stroke ?? (relativeLuminance(fill)! > 0.45 ? GLASS_PALETTE.line : DEFAULT_STYLE.stroke),
        extra,
      },
      action: 'ok',
    }
  }

  // 不达标
  if (policy.onFail === 'strip-to-neutral') {
    return { style: { ...DEFAULT_STYLE, extra }, action: 'fail-strip' }
  }

  if (policy.onFail === 'remap-fill') {
    // 保留字色意图:字浅 → 深底;字深 → 浅底(纸面)
    const cl = relativeLuminance(color)
    const nextFill = cl != null && cl > 0.45 ? GLASS_PALETTE.surfaceDeep : GLASS_PALETTE.surfaceRaised
    const nextColor = pickTextOn(nextFill)
    return {
      style: { fill: nextFill, color: nextColor, stroke: DEFAULT_STYLE.stroke, extra },
      action: 'fail-remap-fill',
    }
  }

  // remap-text(默认):先换对立字色;仍不够再中性
  const alt = pickTextOn(fill)
  const r2 = contrastRatio(fill, alt)
  if (r2 != null && r2 >= policy.minContrast) {
    return {
      style: {
        fill,
        color: alt,
        stroke: stroke ?? (relativeLuminance(fill)! > 0.45 ? GLASS_PALETTE.line : DEFAULT_STYLE.stroke),
        extra,
      },
      action: 'fail-remap-text',
    }
  }
  return { style: { ...DEFAULT_STYLE, extra }, action: 'fail-strip-after-remap-text' }
}

function rewriteDirectiveLine(
  kind: 'style' | 'classDef',
  name: string,
  body: string,
  policy: ColorPolicy,
  actions: string[],
): string {
  const sem = kind === 'classDef' ? semanticStyle(name) : null
  if (sem) {
    actions.push(`semantic:${name}`)
    return `${kind} ${name} ${formatStyleProps(sem)}`
  }

  const parsed = parseStyleProps(body)
  if (!parsed.fill && !parsed.color && !parsed.stroke) {
    // 无颜色属性,原样
    return `${kind} ${name} ${body.trim()}`
  }

  const { style, action } = enforceNodeStyle(parsed, policy)
  if (action !== 'ok') actions.push(`${kind}:${name}:${action}`)
  return `${kind} ${name} ${formatStyleProps(style)}`
}

/** 收集 `class id1,id2 name` / `class id name` 里用到的语义名 */
export function collectUsedClasses(source: string): Set<string> {
  const used = new Set<string>()
  const re = /^\s*class\s+[\w,-]+\s+(\w+)\s*$/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(source))) {
    used.add(m[1]!.toLowerCase())
  }
  return used
}

/**
 * 渲染前宿主裁决:
 * 1. 重写 classDef / style 的色(语义优先,字面色过对比度门禁)
 * 2. 对已用到但缺少 classDef 的语义 class 注入定义
 * 3. 剥离 init 里强制 light 主题的 theme(保留其它配置太脆 → 仅剥 theme 字段困难,整段 init 若含 theme: 则去掉 theme 相关)
 */
export function sanitizeMermaidSource(
  source: string,
  policy: ColorPolicy = DEFAULT_COLOR_POLICY,
): SanitizeResult {
  const actions: string[] = []
  let text = source.replace(/\r\n/g, '\n')

  // 剥 init 指令中的 theme 强制(嵌套 {} 难非贪婪截断 → 含 theme 则整段去掉,避免盖过宿主 dark)
  text = text.replace(/%%\{init:\s*[\s\S]*?\}%%\s*/g, (full) => {
    // 兼容 'theme': / "theme": / theme:
    if (/['"]?theme['"]?\s*:/i.test(full)) {
      actions.push('strip-init-theme')
      return ''
    }
    return full
  })

  const definedClassDefs = new Set<string>()

  // classDef name props
  text = text.replace(
    /^([ \t]*)classDef\s+(\w+)\s+(.+?)\s*$/gm,
    (_full, indent: string, name: string, body: string) => {
      definedClassDefs.add(name.toLowerCase())
      return `${indent}${rewriteDirectiveLine('classDef', name, body, policy, actions)}`
    },
  )

  // style id props
  text = text.replace(
    /^([ \t]*)style\s+(\w+)\s+(.+?)\s*$/gm,
    (_full, indent: string, name: string, body: string) => {
      return `${indent}${rewriteDirectiveLine('style', name, body, policy, actions)}`
    },
  )

  // 注入缺失的语义 classDef
  const used = collectUsedClasses(text)
  const inject: string[] = []
  for (const name of used) {
    if (!isSemanticClass(name)) continue
    if (definedClassDefs.has(name)) continue
    const sem = semanticStyle(name)!
    inject.push(`classDef ${name} ${formatStyleProps(sem)}`)
    actions.push(`inject-classDef:${name}`)
    definedClassDefs.add(name)
  }
  if (inject.length) {
    text = `${text.trimEnd()}\n${inject.join('\n')}\n`
  }

  return { source: text, actions }
}

/** MermaidBlock 用的 dark themeVariables 实色兜底(无 DOM 时) */
export function glassMermaidThemeVariables(): Record<string, string> {
  return {
    background: 'transparent',
    primaryColor: GLASS_PALETTE.accentFill,
    primaryTextColor: GLASS_PALETTE.ink,
    primaryBorderColor: GLASS_PALETTE.accentStroke,
    secondaryColor: GLASS_PALETTE.surfaceDeep,
    secondaryTextColor: GLASS_PALETTE.mute,
    secondaryBorderColor: GLASS_PALETTE.border,
    tertiaryColor: GLASS_PALETTE.surface,
    tertiaryTextColor: GLASS_PALETTE.ink,
    tertiaryBorderColor: GLASS_PALETTE.border,
    lineColor: GLASS_PALETTE.mute,
    textColor: GLASS_PALETTE.ink,
    mainBkg: GLASS_PALETTE.surface,
    nodeBorder: GLASS_PALETTE.border,
    clusterBkg: GLASS_PALETTE.clusterFill,
    clusterBorder: GLASS_PALETTE.clusterStroke,
    titleColor: GLASS_PALETTE.ink,
    edgeLabelBackground: GLASS_PALETTE.surfaceDeep,
    fontFamily: 'sans-serif',
  }
}

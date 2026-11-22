/**
 * [INPUT]: 外观偏好合同 doc/appearance-skin.md
 * [OUTPUT]: AppearanceState(含阅读字体、桌面物件套组与乐器声音) / DeskObjects / SkinDefinition / ResolvedTheme / 白名单
 * [POS]: appearance 层类型真源;resolve/apply/store/registry 共用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export type AppearanceMode = 'dark' | 'light' | 'system'
export type SkinMaterial = 'glass' | 'paper'

export interface AppearanceState {
  version: 1
  mode: AppearanceMode
  skinId: string
  /** 0–1 背景遮罩 */
  overlay: number
  blurPx: number
  /** 阅读字体：西文与中文分别选(id 见 fonts.ts)，justify 让正文两端对齐 */
  latinFont: string
  cjkFont: string
  justify: boolean
  /** 桌面物件套组：仪器（默认）或音乐；instrumentSounds 只在音乐套组下生效：开时物件一动就有声（悬停、点开、合上、输入中与循环），关时不请求录音、不建音频上下文；设置与中栏头部喇叭共用此字段 */
  deskObjects: DeskObjects
  instrumentSounds: boolean
}

export type DeskObjects = 'instruments' | 'music'

export const DEFAULT_APPEARANCE: AppearanceState = {
  version: 1,
  mode: 'light',
  skinId: 'yan-clear',
  /** Phase A 无壁纸图时默认 0,避免整窗发灰;有图皮肤可在 effects 里抬高 */
  overlay: 0,
  blurPx: 0,
  latinFont: 'source-serif',
  cjkFont: 'wenkai',
  justify: false,
  deskObjects: 'instruments',
  instrumentSounds: false,
}

/** 皮肤可 patch 的原语键（不含别名 --code-keyword 等） */
export const APPEARANCE_TOKEN_WHITELIST = [
  // 玻璃壳
  '--canvas',
  '--paper',
  '--paper-solid',
  '--paper-deep',
  '--fill-subtle',
  '--card',
  '--border',
  '--border-strong',
  '--scrim',
  // 实色伴生（Kumo Solid）
  '--surface-canvas',
  '--surface-base',
  '--surface-elevated',
  '--surface-recessed',
  '--surface-control',
  '--surface-fill',
  '--surface-fill-hover',
  '--surface-interact',
  // 墨
  '--text',
  '--text-soft',
  '--text-muted',
  '--text-faint',
  '--text-on-accent',
  // 强调原语
  '--accent',
  '--accent-hover',
  '--accent-ink',
  '--accent-tint',
  '--success',
  '--success-bg',
  '--info',
  '--info-tint',
  // 语义原语
  '--warning',
  '--warning-bg',
  '--danger',
  '--danger-bg',
  '--danger-line',
  '--focus-ring',
  // 光边 / 氛围
  '--beam-a',
  '--beam-b',
  '--beam-c',
  '--aurora-a',
  '--aurora-b',
  '--aurora-c',
  // 材质与层次
  '--shadow-1',
  '--shadow-2',
  '--shadow-3',
  '--material-blur',
  '--material-saturation',
  '--material-highlight',
  '--material-edge',
  '--skin-overlay-rgb',
  // 代码原语（字面量）
  '--code-string',
  '--code-type',
  '--code-attr',
] as const

export type AppearanceTokenName = (typeof APPEARANCE_TOKEN_WHITELIST)[number]

export const APPEARANCE_TOKEN_SET = new Set<string>(APPEARANCE_TOKEN_WHITELIST)

/** CSS 别名：禁皮肤 patch；baseline 保留 var(--原语) */
export const TOKEN_ALIASES: Record<string, string> = {
  '--code-keyword': 'var(--accent-ink)',
  '--code-number': 'var(--warning)',
  '--code-title': 'var(--info)',
  // R5：画布伴生跟随 canvas
  '--surface-canvas': 'var(--canvas)',
}

export interface SkinDefinition {
  /** The name is UI text: i18n catalog `skins[id]` */
  id: string
  /** 设置页缩略：CSS 渐变 */
  preview: string
  /** 卡片底部强调色点（2–3 个 hex） */
  accents?: string[]
  preferredScheme: 'dark' | 'light'
  material?: SkinMaterial
  backgroundImage: string | null
  /** 推荐明暗模式的完整配色，另一模式使用独立补丁，避免深浅文字混用。 */
  tokens: Partial<Record<AppearanceTokenName, string>>
  alternateTokens?: Partial<Record<AppearanceTokenName, string>>
  effects?: { overlay?: number; blurPx?: number; aurora?: boolean }
}

export interface ResolvedTheme {
  /** 与实际 token 基线及原生控件一致的明暗模式。 */
  colorScheme: 'dark' | 'light'
  /** 用户意图（system 已折叠）供 data-appearance */
  appearanceIntent: 'dark' | 'light'
  skinId: string
  material: SkinMaterial
  /** 组合正文字族；undefined 表示沿用设计系统默认 --font-serif */
  fontSerif?: string
  justify: boolean
  tokens: Record<string, string>
  backgroundImage: string | null
  overlay: number
  blurPx: number
  aurora: boolean
}

/**
 * [INPUT]: 外观偏好合同 doc/appearance-skin.md
 * [OUTPUT]: AppearanceState / SkinDefinition / ResolvedTheme / 白名单
 * [POS]: appearance 层类型真源;resolve/apply/store/registry 共用
 * [PROTOCOL]: 变更时同步 doc/appearance-skin.md §6
 */

export type AppearanceMode = 'dark' | 'light' | 'system'

export interface AppearanceState {
  version: 1
  mode: AppearanceMode
  skinId: string
  /** 0–1 背景遮罩 */
  overlay: number
  blurPx: number
}

export const DEFAULT_APPEARANCE: AppearanceState = {
  version: 1,
  mode: 'dark',
  skinId: 'default',
  /** Phase A 无壁纸图时默认 0,避免整窗发灰;有图皮肤可在 effects 里抬高 */
  overlay: 0,
  blurPx: 0,
}

/** 皮肤可 patch 的原语键（不含别名 --success / --code-keyword 等） */
export const APPEARANCE_TOKEN_WHITELIST = [
  // 玻璃壳
  '--canvas',
  '--paper',
  '--paper-solid',
  '--paper-deep',
  '--vellum',
  '--card',
  '--sand',
  '--sand-deep',
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
  '--ink',
  '--ink-soft',
  '--ink-mute',
  '--ink-faint',
  // 强调原语
  '--ember',
  '--ember-soft',
  '--ember-tint',
  '--moss',
  '--moss-tint',
  '--indigo',
  '--indigo-tint',
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
  // 代码原语（字面量）
  '--code-string',
  '--code-type',
  '--code-attr',
] as const

export type AppearanceTokenName = (typeof APPEARANCE_TOKEN_WHITELIST)[number]

export const APPEARANCE_TOKEN_SET = new Set<string>(APPEARANCE_TOKEN_WHITELIST)

/** CSS 别名：禁皮肤 patch；baseline 保留 var(--原语) */
export const TOKEN_ALIASES: Record<string, string> = {
  '--success': 'var(--moss)',
  '--success-bg': 'var(--moss-tint)',
  '--code-keyword': 'var(--ember)',
  '--code-number': 'var(--warning)',
  '--code-title': 'var(--indigo)',
  // R5：画布伴生跟随 canvas
  '--surface-canvas': 'var(--canvas)',
}

export interface SkinDefinition {
  id: string
  name: string
  /** 设置页缩略：CSS 渐变或色串 */
  preview: string
  preferredScheme: 'dark' | 'light'
  backgroundImage: string | null
  tokens: Partial<Record<AppearanceTokenName, string>>
  effects?: { overlay?: number; blurPx?: number; aurora?: boolean }
}

export interface ResolvedTheme {
  /** Phase A 恒为 dark（已应用 token 的 scheme） */
  colorScheme: 'dark' | 'light'
  /** 用户意图（system 已折叠）供 data-appearance */
  appearanceIntent: 'dark' | 'light'
  skinId: string
  tokens: Record<string, string>
  backgroundImage: string | null
  overlay: number
  blurPx: number
  aurora: boolean
}

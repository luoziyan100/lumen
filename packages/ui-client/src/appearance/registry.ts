/**
 * [INPUT]: SkinDefinition 合同
 * [OUTPUT]: 内置皮肤注册表（Phase A · 全 dark · 高对比预览）
 * [POS]: appearance/registry;预置 preferredScheme 一律 dark（R2）
 *        default = 当前 Lumen Glass 青瓷；其余拉大色相差，切换可感知
 */

import type { AppearanceTokenName, SkinDefinition } from './types.ts'

function t(partial: Partial<Record<AppearanceTokenName, string>>): SkinDefinition['tokens'] {
  return partial
}

/** 当前 Lumen Glass 青瓷（与 tokens.css / theme 基线一致） */
export const SKIN_DEFAULT: SkinDefinition = {
  id: 'default',
  name: '青瓷默认',
  description: '当前 Lumen 玻璃壳：近黑画布 + 青瓷强调',
  preview: 'linear-gradient(145deg, #0B0C10 0%, #14161C 35%, #1E212A 55%, #6BC49A 100%)',
  accents: ['#6BC49A', '#8AD4B0', '#5EF0D0'],
  preferredScheme: 'dark',
  backgroundImage: null,
  tokens: {},
  effects: { aurora: true, overlay: 0, blurPx: 0 },
}

export const SKIN_MIST: SkinDefinition = {
  id: 'mist-forest',
  name: '雾林深境',
  description: '冷绿雾气，强调与光边偏松林',
  preview: 'linear-gradient(145deg, #061210 0%, #0f2a22 40%, #1a5c48 70%, #3dcc9a 100%)',
  accents: ['#3dcc9a', '#2a8f6e', '#7dffe0'],
  preferredScheme: 'dark',
  backgroundImage: null,
  tokens: t({
    '--canvas': '#061210',
    '--ember': '#3dcc9a',
    '--ember-soft': '#7dffe0',
    '--ember-tint': 'rgba(61, 204, 154, 0.18)',
    '--moss': '#2a8f6e',
    '--moss-tint': 'rgba(42, 143, 110, 0.16)',
    '--indigo': '#5a9a8c',
    '--focus-ring': 'rgba(61, 220, 170, 0.45)',
    '--beam-a': '#3dcc9a',
    '--beam-b': '#2a8f6e',
    '--beam-c': '#a8ffe8',
    '--aurora-a': 'rgba(40, 200, 150, 0.28)',
    '--aurora-b': 'rgba(20, 100, 80, 0.20)',
    '--aurora-c': 'rgba(80, 180, 140, 0.12)',
    '--surface-base': '#0c1c18',
    '--surface-elevated': '#142822',
    '--surface-recessed': '#081410',
    '--surface-control': '#10241c',
    '--surface-fill': '#1a3028',
    '--surface-fill-hover': '#244038',
    '--surface-interact': '#1e3830',
  }),
  effects: { aurora: true, overlay: 0, blurPx: 0 },
}

export const SKIN_SKY: SkinDefinition = {
  id: 'clear-sky',
  name: '晴穹蓝构',
  description: '冷蓝构架，按钮与强调偏天蓝',
  preview: 'linear-gradient(145deg, #060a14 0%, #102038 40%, #1a4a80 70%, #4db0ff 100%)',
  accents: ['#4db0ff', '#2a6db0', '#8ad0ff'],
  preferredScheme: 'dark',
  backgroundImage: null,
  tokens: t({
    '--canvas': '#060a14',
    '--ember': '#4db0ff',
    '--ember-soft': '#8ad0ff',
    '--ember-tint': 'rgba(77, 176, 255, 0.18)',
    '--moss': '#3a9a90',
    '--moss-tint': 'rgba(58, 154, 144, 0.14)',
    '--indigo': '#6a9fd4',
    '--focus-ring': 'rgba(100, 180, 255, 0.45)',
    '--beam-a': '#4db0ff',
    '--beam-b': '#7080ff',
    '--beam-c': '#a8e0ff',
    '--aurora-a': 'rgba(60, 160, 255, 0.26)',
    '--aurora-b': 'rgba(80, 100, 255, 0.18)',
    '--aurora-c': 'rgba(40, 120, 200, 0.12)',
    '--surface-base': '#0c1420',
    '--surface-elevated': '#162434',
    '--surface-recessed': '#080e18',
    '--surface-control': '#101c2c',
    '--surface-fill': '#1a283c',
    '--surface-fill-hover': '#243850',
    '--surface-interact': '#1e3044',
  }),
  effects: { aurora: true, overlay: 0, blurPx: 0 },
}

export const SKIN_CLAY: SkinDefinition = {
  id: 'clay-warm',
  name: '陶土叠影',
  description: '暖陶土强调，琥珀光边',
  preview: 'linear-gradient(145deg, #140c08 0%, #3a2418 40%, #8a5030 70%, #e8a060 100%)',
  accents: ['#e8a060', '#c07040', '#ffd0a0'],
  preferredScheme: 'dark',
  backgroundImage: null,
  tokens: t({
    '--canvas': '#140c08',
    '--ember': '#e8a060',
    '--ember-soft': '#ffd0a0',
    '--ember-tint': 'rgba(232, 160, 96, 0.18)',
    '--moss': '#c0a060',
    '--moss-tint': 'rgba(192, 160, 96, 0.14)',
    '--indigo': '#d0a080',
    '--focus-ring': 'rgba(240, 180, 100, 0.42)',
    '--beam-a': '#e8a060',
    '--beam-b': '#e07050',
    '--beam-c': '#ffd890',
    '--aurora-a': 'rgba(232, 150, 80, 0.24)',
    '--aurora-b': 'rgba(200, 80, 50, 0.16)',
    '--aurora-c': 'rgba(255, 180, 80, 0.10)',
    '--surface-base': '#1c1410',
    '--surface-elevated': '#2c2018',
    '--surface-recessed': '#100c08',
    '--surface-control': '#201810',
    '--surface-fill': '#302418',
    '--surface-fill-hover': '#403020',
    '--surface-interact': '#382c20',
  }),
  effects: { aurora: true, overlay: 0, blurPx: 0 },
}

const ALL: SkinDefinition[] = [SKIN_DEFAULT, SKIN_MIST, SKIN_SKY, SKIN_CLAY]

export const SKIN_REGISTRY: Record<string, SkinDefinition> = Object.fromEntries(
  ALL.map((s) => [s.id, s]),
)

export function listSkins(): SkinDefinition[] {
  return ALL.slice()
}

export function getSkin(id: string): SkinDefinition {
  return SKIN_REGISTRY[id] ?? SKIN_DEFAULT
}

/** 保证始终有合法选中项 */
export function coerceSkinId(id: string | undefined | null): string {
  if (id && SKIN_REGISTRY[id]) return id
  return SKIN_DEFAULT.id
}

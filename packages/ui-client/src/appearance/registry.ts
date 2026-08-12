/**
 * [INPUT]: SkinDefinition 合同
 * [OUTPUT]: 内置「整窗」皮肤——玻璃壳 + 实色面 + 强调 + aurora 成套 patch
 * [POS]: appearance/registry; default = 当前 Lumen; 零件级微调以后再说
 * [PROTOCOL]: 切换须可感知侧栏/标题/卡片/按钮一起变,不能只动背景光
 */

import type { AppearanceTokenName, SkinDefinition } from './types.ts'

function t(partial: Partial<Record<AppearanceTokenName, string>>): SkinDefinition['tokens'] {
  return partial
}

/** 当前 Lumen Glass 青瓷（空补丁 = 全基线） */
export const SKIN_DEFAULT: SkinDefinition = {
  id: 'default',
  name: '青瓷默认',
  description: '当前 Lumen：近黑玻璃壳 + 青瓷强调（整窗基线）',
  preview: 'linear-gradient(145deg, #0B0C10 0%, #14161C 35%, #1E212A 55%, #6BC49A 100%)',
  accents: ['#6BC49A', '#8AD4B0', '#5EF0D0'],
  preferredScheme: 'dark',
  backgroundImage: null,
  tokens: {},
  effects: { aurora: true, overlay: 0, blurPx: 0 },
}

/**
 * 整窗包：canvas/玻璃壳/墨/强调/beam/aurora/surface 一并写，
 * 侧栏(--paper)与卡片(--card)跟色相走。
 */
export const SKIN_MIST: SkinDefinition = {
  id: 'mist-forest',
  name: '雾林深境',
  description: '整窗冷绿玻璃：侧栏与卡片带松林色偏',
  preview: 'linear-gradient(145deg, #061210 0%, #0f2a22 40%, #1a5c48 70%, #3dcc9a 100%)',
  accents: ['#3dcc9a', '#1a3a30', '#7dffe0'],
  preferredScheme: 'dark',
  backgroundImage: null,
  tokens: t({
    // 画布
    '--canvas': '#061210',
    // 玻璃壳（大面积 UI）
    '--paper': 'rgba(14, 36, 30, 0.82)',
    '--paper-solid': 'rgba(12, 30, 26, 0.92)',
    '--paper-deep': 'rgba(8, 22, 18, 0.94)',
    '--vellum': 'rgba(100, 220, 180, 0.08)',
    '--card': 'rgba(22, 48, 40, 0.86)',
    '--sand': 'rgba(120, 200, 170, 0.10)',
    '--sand-deep': 'rgba(140, 220, 190, 0.18)',
    '--scrim': 'rgba(0, 12, 8, 0.58)',
    // 墨（略偏冷绿灰，仍保证对比）
    '--ink': '#E2F2EC',
    '--ink-soft': 'rgba(220, 240, 230, 0.84)',
    '--ink-mute': 'rgba(170, 200, 188, 0.58)',
    '--ink-faint': 'rgba(150, 185, 172, 0.36)',
    // 强调
    '--ember': '#3dcc9a',
    '--ember-soft': '#7dffe0',
    '--ember-tint': 'rgba(61, 204, 154, 0.18)',
    '--moss': '#2a8f6e',
    '--moss-tint': 'rgba(42, 143, 110, 0.16)',
    '--indigo': '#5a9a8c',
    '--indigo-tint': 'rgba(90, 154, 140, 0.14)',
    '--focus-ring': 'rgba(61, 220, 170, 0.45)',
    '--warning': '#c8b050',
    '--warning-bg': 'rgba(200, 176, 80, 0.14)',
    '--danger': '#e08070',
    '--danger-bg': 'rgba(224, 128, 112, 0.12)',
    '--danger-line': 'rgba(224, 128, 112, 0.36)',
    // 光边 / aurora
    '--beam-a': '#3dcc9a',
    '--beam-b': '#2a8f6e',
    '--beam-c': '#a8ffe8',
    '--aurora-a': 'rgba(40, 200, 150, 0.30)',
    '--aurora-b': 'rgba(20, 100, 80, 0.22)',
    '--aurora-c': 'rgba(80, 180, 140, 0.14)',
    // 代码
    '--code-string': '#90d4b0',
    '--code-type': '#6ec4a8',
    '--code-attr': '#a0c8b8',
    // Kumo 实色
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
  description: '整窗冷蓝玻璃：侧栏与卡片偏夜空蓝',
  preview: 'linear-gradient(145deg, #060a14 0%, #102038 40%, #1a4a80 70%, #4db0ff 100%)',
  accents: ['#4db0ff', '#162434', '#8ad0ff'],
  preferredScheme: 'dark',
  backgroundImage: null,
  tokens: t({
    '--canvas': '#060a14',
    '--paper': 'rgba(16, 28, 48, 0.84)',
    '--paper-solid': 'rgba(12, 22, 40, 0.93)',
    '--paper-deep': 'rgba(8, 14, 28, 0.95)',
    '--vellum': 'rgba(100, 170, 255, 0.08)',
    '--card': 'rgba(24, 40, 64, 0.88)',
    '--sand': 'rgba(120, 170, 230, 0.10)',
    '--sand-deep': 'rgba(140, 190, 255, 0.18)',
    '--scrim': 'rgba(0, 6, 16, 0.58)',
    '--ink': '#E4EEF8',
    '--ink-soft': 'rgba(220, 232, 248, 0.84)',
    '--ink-mute': 'rgba(160, 185, 215, 0.58)',
    '--ink-faint': 'rgba(140, 165, 200, 0.36)',
    '--ember': '#4db0ff',
    '--ember-soft': '#8ad0ff',
    '--ember-tint': 'rgba(77, 176, 255, 0.18)',
    '--moss': '#3a9a90',
    '--moss-tint': 'rgba(58, 154, 144, 0.14)',
    '--indigo': '#6a9fd4',
    '--indigo-tint': 'rgba(106, 159, 212, 0.14)',
    '--focus-ring': 'rgba(100, 180, 255, 0.45)',
    '--warning': '#d4b060',
    '--warning-bg': 'rgba(212, 176, 96, 0.14)',
    '--danger': '#e08878',
    '--danger-bg': 'rgba(224, 136, 120, 0.12)',
    '--danger-line': 'rgba(224, 136, 120, 0.36)',
    '--beam-a': '#4db0ff',
    '--beam-b': '#7080ff',
    '--beam-c': '#a8e0ff',
    '--aurora-a': 'rgba(60, 160, 255, 0.28)',
    '--aurora-b': 'rgba(80, 100, 255, 0.20)',
    '--aurora-c': 'rgba(40, 120, 200, 0.14)',
    '--code-string': '#90b8e0',
    '--code-type': '#70c0d0',
    '--code-attr': '#a0c0d8',
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
  description: '整窗暖陶玻璃：侧栏与卡片偏赭石暖调',
  preview: 'linear-gradient(145deg, #140c08 0%, #3a2418 40%, #8a5030 70%, #e8a060 100%)',
  accents: ['#e8a060', '#2c2018', '#ffd0a0'],
  preferredScheme: 'dark',
  backgroundImage: null,
  tokens: t({
    '--canvas': '#140c08',
    '--paper': 'rgba(42, 28, 20, 0.86)',
    '--paper-solid': 'rgba(36, 24, 16, 0.94)',
    '--paper-deep': 'rgba(24, 16, 12, 0.96)',
    '--vellum': 'rgba(255, 180, 100, 0.08)',
    '--card': 'rgba(52, 36, 26, 0.90)',
    '--sand': 'rgba(220, 160, 100, 0.10)',
    '--sand-deep': 'rgba(240, 180, 120, 0.18)',
    '--scrim': 'rgba(12, 6, 2, 0.58)',
    '--ink': '#F4ECE4',
    '--ink-soft': 'rgba(244, 232, 220, 0.86)',
    '--ink-mute': 'rgba(210, 185, 160, 0.58)',
    '--ink-faint': 'rgba(190, 165, 140, 0.36)',
    '--ember': '#e8a060',
    '--ember-soft': '#ffd0a0',
    '--ember-tint': 'rgba(232, 160, 96, 0.18)',
    '--moss': '#c0a060',
    '--moss-tint': 'rgba(192, 160, 96, 0.14)',
    '--indigo': '#d0a080',
    '--indigo-tint': 'rgba(208, 160, 128, 0.14)',
    '--focus-ring': 'rgba(240, 180, 100, 0.42)',
    '--warning': '#e0b050',
    '--warning-bg': 'rgba(224, 176, 80, 0.14)',
    '--danger': '#e07860',
    '--danger-bg': 'rgba(224, 120, 96, 0.12)',
    '--danger-line': 'rgba(224, 120, 96, 0.36)',
    '--beam-a': '#e8a060',
    '--beam-b': '#e07050',
    '--beam-c': '#ffd890',
    '--aurora-a': 'rgba(232, 150, 80, 0.26)',
    '--aurora-b': 'rgba(200, 80, 50, 0.18)',
    '--aurora-c': 'rgba(255, 180, 80, 0.12)',
    '--code-string': '#e0b080',
    '--code-type': '#d0a070',
    '--code-attr': '#c8b098',
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

/**
 * Cosmic Latte — 来自 doc/skin/cosmic-latte.html 玻璃卡试样
 * 奶油半透玻璃 + 琥珀内光 + 咖啡阴影；辅色点缀 #3b82f6
 */
export const SKIN_COSMIC_LATTE: SkinDefinition = {
  id: 'cosmic-latte',
  name: '宇宙拿铁',
  description: 'Cosmic Latte：暖奶油玻璃 + 琥珀光晕（试样式）',
  preview: 'linear-gradient(145deg, #1a120c 0%, #3d2a18 35%, #78716c 55%, #f59e0b 78%, #fdf4e3 100%)',
  accents: ['#f59e0b', '#fdf4e3', '#3b82f6'],
  preferredScheme: 'dark',
  backgroundImage: null,
  tokens: t({
    // 深咖啡宇宙底
    '--canvas': '#1a120c',
    // 试样卡：rgba(253,244,227,0.08) 抬到可读的玻璃纸面
    '--paper': 'rgba(253, 244, 227, 0.10)',
    '--paper-solid': 'rgba(40, 30, 22, 0.92)',
    '--paper-deep': 'rgba(28, 20, 14, 0.95)',
    '--vellum': 'rgba(253, 244, 227, 0.08)',
    // 卡片 ≈ 试样 .glass-card
    '--card': 'rgba(253, 244, 227, 0.10)',
    '--sand': 'rgba(255, 255, 255, 0.12)',
    '--sand-deep': 'rgba(255, 255, 255, 0.20)',
    // 试样 shadow 主色 120,53,15
    '--scrim': 'rgba(120, 53, 15, 0.45)',
    '--ink': '#FDF8F0',
    '--ink-soft': 'rgba(253, 248, 240, 0.88)',
    '--ink-mute': 'rgba(230, 214, 190, 0.62)',
    '--ink-faint': 'rgba(210, 190, 165, 0.40)',
    // amber-500 #f59e0b（试样 inset glow）
    '--ember': '#f59e0b',
    '--ember-soft': '#fbbf24',
    '--ember-tint': 'rgba(245, 158, 11, 0.12)',
    '--moss': '#d4a574',
    '--moss-tint': 'rgba(212, 165, 116, 0.14)',
    // 试样头像描边蓝
    '--indigo': '#3b82f6',
    '--indigo-tint': 'rgba(59, 130, 246, 0.16)',
    '--focus-ring': 'rgba(59, 130, 246, 0.40)',
    '--warning': '#fbbf24',
    '--warning-bg': 'rgba(251, 191, 36, 0.14)',
    '--danger': '#e07a5f',
    '--danger-bg': 'rgba(224, 122, 95, 0.12)',
    '--danger-line': 'rgba(224, 122, 95, 0.36)',
    '--beam-a': '#fbbf24',
    '--beam-b': '#f59e0b',
    '--beam-c': '#fde68a',
    // 宇宙拿铁星云：奶油 + 琥珀 + 淡蓝
    '--aurora-a': 'rgba(253, 244, 227, 0.14)',
    '--aurora-b': 'rgba(245, 158, 11, 0.16)',
    '--aurora-c': 'rgba(59, 130, 246, 0.10)',
    '--code-string': '#f0c070',
    '--code-type': '#d4a574',
    '--code-attr': '#c4b8a8',
    // 实色面：咖啡深棕（对齐试样阴影族）
    '--surface-base': '#241810',
    '--surface-elevated': '#322418',
    '--surface-recessed': '#140e0a',
    '--surface-control': '#2a1e14',
    '--surface-fill': '#3a2c1c',
    '--surface-fill-hover': '#4a3a28',
    '--surface-interact': '#403224',
  }),
  effects: { aurora: true, overlay: 0.08, blurPx: 0 },
}

const ALL: SkinDefinition[] = [SKIN_DEFAULT, SKIN_COSMIC_LATTE, SKIN_MIST, SKIN_SKY, SKIN_CLAY]

export const SKIN_REGISTRY: Record<string, SkinDefinition> = Object.fromEntries(
  ALL.map((s) => [s.id, s]),
)

export function listSkins(): SkinDefinition[] {
  return ALL.slice()
}

export function getSkin(id: string): SkinDefinition {
  return SKIN_REGISTRY[id] ?? SKIN_DEFAULT
}

export function coerceSkinId(id: string | undefined | null): string {
  if (id && SKIN_REGISTRY[id]) return id
  return SKIN_DEFAULT.id
}

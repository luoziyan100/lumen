/**
 * [INPUT]: SkinDefinition 合同
 * [OUTPUT]: 内置皮肤注册表（Phase A · 全 dark · CSS 渐变预览）
 * [POS]: appearance/registry;预置 preferredScheme 一律 dark（R2）
 */

import type { AppearanceTokenName, SkinDefinition } from './types.ts'

function t(partial: Partial<Record<AppearanceTokenName, string>>): SkinDefinition['tokens'] {
  return partial
}

/** 默认：与当前 Glass 基线一致，tokens 空补丁 */
export const SKIN_DEFAULT: SkinDefinition = {
  id: 'default',
  name: '青瓷默认',
  preview: 'linear-gradient(135deg, #0B0C10 0%, #1a2430 45%, #6BC49A 100%)',
  preferredScheme: 'dark',
  backgroundImage: null,
  tokens: {},
  effects: { aurora: true, overlay: 0, blurPx: 0 },
}

export const SKIN_MIST: SkinDefinition = {
  id: 'mist-forest',
  name: '雾林深境',
  preview: 'linear-gradient(145deg, #0a1210 0%, #1a3a32 50%, #3d8f7a 100%)',
  preferredScheme: 'dark',
  backgroundImage: null,
  tokens: t({
    '--canvas': '#0a1210',
    '--ember': '#5FBF9A',
    '--ember-soft': '#7FD4B0',
    '--ember-tint': 'rgba(95, 191, 154, 0.14)',
    '--moss': '#6FB892',
    '--moss-tint': 'rgba(111, 184, 146, 0.14)',
    '--indigo': '#7AA8A0',
    '--beam-a': '#4FE0C0',
    '--beam-b': '#6BC4A8',
    '--beam-c': '#A8D4C0',
    '--aurora-a': 'rgba(48, 180, 150, 0.20)',
    '--aurora-b': 'rgba(60, 120, 110, 0.14)',
    '--aurora-c': 'rgba(100, 160, 120, 0.10)',
    '--surface-base': '#121c18',
    '--surface-elevated': '#1a2822',
    '--surface-recessed': '#0e1612',
    '--surface-control': '#16201a',
    '--surface-fill': '#1e2c26',
    '--surface-fill-hover': '#283830',
    '--surface-interact': '#24342c',
  }),
  effects: { aurora: true, overlay: 0, blurPx: 0 },
}

export const SKIN_SKY: SkinDefinition = {
  id: 'clear-sky',
  name: '晴穹蓝构',
  preview: 'linear-gradient(145deg, #0a0e16 0%, #1a2840 50%, #5B9BD5 100%)',
  preferredScheme: 'dark',
  backgroundImage: null,
  tokens: t({
    '--canvas': '#0a0e16',
    '--ember': '#6BA3D4',
    '--ember-soft': '#8BB8E0',
    '--ember-tint': 'rgba(107, 163, 212, 0.14)',
    '--moss': '#6BB0A0',
    '--indigo': '#8FB8CE',
    '--focus-ring': 'rgba(120, 180, 230, 0.4)',
    '--beam-a': '#6BC4F0',
    '--beam-b': '#8B9BFA',
    '--beam-c': '#A8D4F0',
    '--aurora-a': 'rgba(80, 160, 220, 0.18)',
    '--aurora-b': 'rgba(100, 120, 220, 0.14)',
    '--aurora-c': 'rgba(60, 140, 200, 0.10)',
    '--surface-base': '#121820',
    '--surface-elevated': '#1a2432',
    '--surface-recessed': '#0e1218',
    '--surface-control': '#161c28',
    '--surface-fill': '#1e2838',
    '--surface-fill-hover': '#283448',
    '--surface-interact': '#243040',
  }),
  effects: { aurora: true, overlay: 0, blurPx: 0 },
}

export const SKIN_CLAY: SkinDefinition = {
  id: 'clay-warm',
  name: '陶土叠影',
  preview: 'linear-gradient(145deg, #120e0c 0%, #3a2820 50%, #D4A06A 100%)',
  preferredScheme: 'dark',
  backgroundImage: null,
  tokens: t({
    '--canvas': '#120e0c',
    '--ember': '#D4A06A',
    '--ember-soft': '#E0B888',
    '--ember-tint': 'rgba(212, 160, 106, 0.14)',
    '--moss': '#B8A070',
    '--moss-tint': 'rgba(184, 160, 112, 0.14)',
    '--indigo': '#C4A890',
    '--focus-ring': 'rgba(220, 180, 120, 0.36)',
    '--beam-a': '#E0B080',
    '--beam-b': '#D49070',
    '--beam-c': '#F0D0A0',
    '--aurora-a': 'rgba(220, 160, 100, 0.16)',
    '--aurora-b': 'rgba(180, 100, 80, 0.12)',
    '--aurora-c': 'rgba(240, 180, 100, 0.08)',
    '--surface-base': '#1a1410',
    '--surface-elevated': '#282018',
    '--surface-recessed': '#100c0a',
    '--surface-control': '#1e1814',
    '--surface-fill': '#2a221c',
    '--surface-fill-hover': '#383028',
    '--surface-interact': '#322a22',
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

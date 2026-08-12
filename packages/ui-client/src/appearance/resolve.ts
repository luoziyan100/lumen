/**
 * [INPUT]: AppearanceState + registry
 * [OUTPUT]: resolveTheme —— 纯函数;无 DOM
 * [POS]: appearance 核;单测锁定 AT4
 * [PROTOCOL]: doc/appearance-skin.md §6.3
 */

import { getSkin } from './registry.ts'
import {
  APPEARANCE_TOKEN_SET,
  DEFAULT_APPEARANCE,
  TOKEN_ALIASES,
  type AppearanceState,
  type AppearanceTokenName,
  type ResolvedTheme,
} from './types.ts'
import { resolveSystemScheme } from './systemMode.ts'

/** Phase A 暗色基线（与 tokens.css 默认对齐；伴生实色 = 今日 Kumo 字面量） */
export const DARK_BASELINE: Record<string, string> = {
  '--canvas': '#0B0C10',
  '--paper': 'rgba(28, 30, 38, 0.72)',
  '--paper-solid': 'rgba(20, 22, 28, 0.86)',
  '--paper-deep': 'rgba(16, 18, 24, 0.92)',
  '--vellum': 'rgba(255, 255, 255, 0.09)',
  '--card': 'rgba(34, 36, 44, 0.78)',
  '--sand': 'rgba(255, 255, 255, 0.06)',
  '--sand-deep': 'rgba(255, 255, 255, 0.14)',
  '--scrim': 'rgba(0, 0, 0, 0.52)',

  '--surface-base': '#14161C',
  '--surface-elevated': '#1E212A',
  '--surface-recessed': '#101218',
  '--surface-control': '#1A1D26',
  '--surface-fill': '#252833',
  '--surface-fill-hover': '#2E323E',
  '--surface-interact': '#2A2F3C',

  '--ink': '#E8EAEE',
  '--ink-soft': 'rgba(232, 234, 238, 0.82)',
  '--ink-mute': 'rgba(200, 206, 214, 0.55)',
  '--ink-faint': 'rgba(200, 206, 214, 0.34)',

  '--ember': '#6BC49A',
  '--ember-soft': '#8AD4B0',
  '--ember-tint': 'rgba(107, 196, 154, 0.14)',
  '--moss': '#7FCF9E',
  '--moss-tint': 'rgba(127, 207, 158, 0.14)',
  '--indigo': '#8FB8CE',
  '--indigo-tint': 'rgba(143, 184, 206, 0.14)',

  '--warning': '#D4A94F',
  '--warning-bg': 'rgba(212, 169, 79, 0.14)',
  '--danger': '#E08A72',
  '--danger-bg': 'rgba(224, 138, 114, 0.12)',
  '--danger-line': 'rgba(224, 138, 114, 0.36)',
  '--focus-ring': 'rgba(120, 220, 200, 0.36)',

  '--beam-a': '#5EF0D0',
  '--beam-b': '#A78BFA',
  '--beam-c': '#FDE68A',
  '--aurora-a': 'rgba(56, 210, 180, 0.18)',
  '--aurora-b': 'rgba(140, 100, 255, 0.16)',
  '--aurora-c': 'rgba(255, 200, 80, 0.09)',

  '--code-string': '#E0A878',
  '--code-type': '#7FCFC0',
  '--code-attr': '#A8C4B4',
}

export function filterWhitelist(
  tokens: Partial<Record<string, string>>,
): Partial<Record<AppearanceTokenName, string>> {
  const out: Partial<Record<AppearanceTokenName, string>> = {}
  for (const [k, v] of Object.entries(tokens)) {
    if (!v) continue
    if (TOKEN_ALIASES[k]) continue // 别名禁 patch
    if (!APPEARANCE_TOKEN_SET.has(k)) continue
    if (k === '--surface-canvas') continue // R5 别名，只 patch --canvas
    out[k as AppearanceTokenName] = v
  }
  return out
}

export function resolveTheme(
  state: AppearanceState,
  systemScheme: 'dark' | 'light' = resolveSystemScheme(),
): ResolvedTheme {
  const mode = state.mode ?? DEFAULT_APPEARANCE.mode
  const appearanceIntent: 'dark' | 'light' =
    mode === 'system' ? systemScheme : mode === 'light' ? 'light' : 'dark'

  const skin = getSkin(state.skinId ?? DEFAULT_APPEARANCE.skinId)
  const patch = filterWhitelist(skin.tokens)

  const tokens: Record<string, string> = { ...DARK_BASELINE, ...patch }
  // 别名始终 var()，保留级联（含 surface-canvas → canvas）
  for (const [alias, ref] of Object.entries(TOKEN_ALIASES)) {
    tokens[alias] = ref
  }
  // 若皮肤 patch 了 --canvas，surface-canvas 仍是 var(--canvas)，自动跟随

  const overlay =
    typeof state.overlay === 'number' && Number.isFinite(state.overlay)
      ? Math.min(1, Math.max(0, state.overlay))
      : (skin.effects?.overlay ?? DEFAULT_APPEARANCE.overlay)

  const blurPx =
    typeof state.blurPx === 'number' && Number.isFinite(state.blurPx)
      ? Math.max(0, state.blurPx)
      : (skin.effects?.blurPx ?? DEFAULT_APPEARANCE.blurPx)

  const aurora = skin.effects?.aurora ?? skin.id === 'default'

  return {
    colorScheme: 'dark', // Phase A 已应用基线
    appearanceIntent,
    skinId: skin.id,
    tokens,
    backgroundImage: skin.backgroundImage,
    overlay,
    blurPx,
    aurora,
  }
}

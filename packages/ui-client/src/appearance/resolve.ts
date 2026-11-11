/**
 * [INPUT]: 外观偏好、系统明暗与皮肤注册表
 * [OUTPUT]: 明暗基线、白名单过滤与 resolveTheme 纯解析结果
 * [POS]: 外观计算边界；先选择明暗基线，再合并相应皮肤补丁，隔离 DOM 与原生窗口
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
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

/** 暗色基线与 tokens.css 默认对齐，未覆盖的皮肤 token 始终有确定值。 */
export const DARK_BASELINE: Record<string, string> = {
  '--canvas': '#0B0C10',
  '--paper': 'rgba(28, 30, 38, 0.72)',
  '--paper-solid': 'rgba(20, 22, 28, 0.86)',
  '--paper-deep': 'rgba(16, 18, 24, 0.92)',
  '--fill-subtle': 'rgba(255, 255, 255, 0.09)',
  '--card': 'rgba(34, 36, 44, 0.78)',
  '--border': 'rgba(255, 255, 255, 0.06)',
  '--border-strong': 'rgba(255, 255, 255, 0.14)',
  '--scrim': 'rgba(0, 0, 0, 0.52)',

  '--surface-base': '#14161C',
  '--surface-elevated': '#1E212A',
  '--surface-recessed': '#101218',
  '--surface-control': '#1A1D26',
  '--surface-fill': '#252833',
  '--surface-fill-hover': '#2E323E',
  '--surface-interact': '#2A2F3C',

  '--text': '#E8EAEE',
  '--text-soft': 'rgba(232, 234, 238, 0.82)',
  '--text-muted': 'rgba(200, 206, 214, 0.55)',
  '--text-faint': 'rgba(200, 206, 214, 0.34)',
  '--text-on-accent': '#0B0C10',

  '--accent': '#6BC49A',
  '--accent-hover': '#8AD4B0',
  '--accent-tint': 'rgba(107, 196, 154, 0.14)',
  '--success': '#7FCF9E',
  '--success-bg': 'rgba(127, 207, 158, 0.14)',
  '--info': '#8FB8CE',
  '--info-tint': 'rgba(143, 184, 206, 0.14)',

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
  '--shadow-1': '0 1px 2px rgba(0, 0, 0, 0.28)',
  '--shadow-2': '0 1px 0 rgba(255, 255, 255, 0.05) inset, 0 12px 32px -14px rgba(0, 0, 0, 0.55), 0 0 24px -12px rgba(80, 160, 255, 0.18)',
  '--shadow-3': '0 1px 0 rgba(255, 255, 255, 0.06) inset, 0 24px 56px -18px rgba(0, 0, 0, 0.65), 0 0 40px -16px rgba(140, 100, 255, 0.22)',
  '--material-blur': '20px',
  '--material-saturation': '1.25',
  '--material-highlight': 'rgba(255, 255, 255, 0.38)',
  '--material-edge': 'rgba(255, 255, 255, 0.14)',
  '--skin-overlay-rgb': '0, 0, 0',
}

/** 浅色以银灰画布、深墨和轻阴影为底，Kumo 控件始终使用实色伴生。 */
export const LIGHT_BASELINE: Record<string, string> = {
  '--canvas': '#E8EEF4',
  '--paper': 'rgba(255, 255, 255, 0.58)',
  '--paper-solid': 'rgba(255, 255, 255, 0.94)',
  '--paper-deep': 'rgba(224, 232, 242, 0.68)',
  '--fill-subtle': 'rgba(52, 91, 132, 0.08)',
  '--card': 'rgba(255, 255, 255, 0.72)',
  '--border': 'rgba(31, 48, 68, 0.07)',
  '--border-strong': 'rgba(31, 48, 68, 0.14)',
  '--scrim': 'rgba(24, 33, 45, 0.20)',
  '--surface-base': '#F5F8FC',
  '--surface-elevated': '#FFFFFF',
  '--surface-recessed': '#E0E8F1',
  '--surface-control': '#F8FAFD',
  '--surface-fill': '#E7EEF6',
  '--surface-fill-hover': '#DCE6F0',
  '--surface-interact': '#D5E1EC',
  '--text': '#18212D',
  '--text-soft': '#334155',
  '--text-muted': '#536272',
  '--text-faint': '#8190A1',
  '--text-on-accent': '#FFFFFF',
  '--accent': '#345B84',
  '--accent-hover': '#284B70',
  '--accent-tint': 'rgba(52, 91, 132, 0.10)',
  '--success': '#2A6C53',
  '--success-bg': 'rgba(42, 108, 83, 0.09)',
  '--info': '#3569AB',
  '--info-tint': 'rgba(53, 105, 171, 0.09)',
  '--warning': '#8B5B13',
  '--warning-bg': 'rgba(139, 91, 19, 0.09)',
  '--danger': '#A43D48',
  '--danger-bg': 'rgba(164, 61, 72, 0.09)',
  '--danger-line': 'rgba(164, 61, 72, 0.24)',
  '--focus-ring': 'rgba(52, 91, 132, 0.30)',
  '--beam-a': '#FFFFFF',
  '--beam-b': '#A7BFDA',
  '--beam-c': '#BCD4D1',
  '--aurora-a': 'rgba(135, 166, 199, 0.24)',
  '--aurora-b': 'rgba(170, 186, 206, 0.22)',
  '--aurora-c': 'rgba(196, 207, 220, 0.14)',
  '--code-string': '#925235',
  '--code-type': '#2B6F70',
  '--code-attr': '#674C92',
  '--shadow-1': '0 1px 3px rgba(33, 56, 83, 0.08)',
  '--shadow-2': '0 1px 0 rgba(255, 255, 255, 0.78) inset, 0 14px 36px -18px rgba(33, 56, 83, 0.18)',
  '--shadow-3': '0 1px 0 rgba(255, 255, 255, 0.88) inset, 0 24px 64px -24px rgba(33, 56, 83, 0.24)',
  '--material-blur': '26px',
  '--material-saturation': '1.14',
  '--material-highlight': 'rgba(255, 255, 255, 0.88)',
  '--material-edge': 'rgba(255, 255, 255, 0.75)',
  '--skin-overlay-rgb': '255, 255, 255',
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
  const patch = filterWhitelist(appearanceIntent === skin.preferredScheme ? skin.tokens : skin.alternateTokens ?? {})

  const baseline = appearanceIntent === 'light' ? LIGHT_BASELINE : DARK_BASELINE
  const tokens: Record<string, string> = { ...baseline, ...patch }
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
    colorScheme: appearanceIntent,
    appearanceIntent,
    skinId: skin.id,
    material: skin.material ?? 'glass',
    tokens,
    backgroundImage: skin.backgroundImage,
    overlay,
    blurPx,
    aurora,
  }
}

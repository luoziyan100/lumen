/**
 * [INPUT]: localStorage lumen:appearance.v2(无则一次性读取 v1)
 * [OUTPUT]: loadAppearance / saveAppearance / normalizeAppearance
 * [POS]: appearance 本地偏好持久化，与服务端模型和运行设置分离；
 *        v1 迁移：停留在旧默认青瓷的偏好改为新默认「清透」，其余皮肤选择原样保留
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { coerceSkinId } from './registry.ts'
import { coerceCjkFont, coerceLatinFont } from './fonts.ts'
import { DEFAULT_APPEARANCE, type AppearanceMode, type AppearanceState } from './types.ts'

export const APPEARANCE_STORAGE_KEY = 'lumen:appearance.v2'
export const LEGACY_APPEARANCE_STORAGE_KEY = 'lumen:appearance.v1'

const MODES = new Set<AppearanceMode>(['dark', 'light', 'system'])

export function normalizeAppearance(raw: unknown): AppearanceState {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_APPEARANCE }
  const o = raw as Record<string, unknown>
  const mode = MODES.has(o.mode as AppearanceMode) ? (o.mode as AppearanceMode) : DEFAULT_APPEARANCE.mode
  const skinId = coerceSkinId(typeof o.skinId === 'string' ? o.skinId : DEFAULT_APPEARANCE.skinId)
  let overlay = typeof o.overlay === 'number' && Number.isFinite(o.overlay) ? o.overlay : DEFAULT_APPEARANCE.overlay
  overlay = Math.min(1, Math.max(0, overlay))
  let blurPx = typeof o.blurPx === 'number' && Number.isFinite(o.blurPx) ? o.blurPx : DEFAULT_APPEARANCE.blurPx
  blurPx = Math.max(0, blurPx)
  return { version: 1, mode, skinId, overlay, blurPx,
    latinFont: coerceLatinFont(o.latinFont), cjkFont: coerceCjkFont(o.cjkFont), justify: o.justify === true }
}

export function loadAppearance(): AppearanceState {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_APPEARANCE }
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY)
    if (raw) return normalizeAppearance(JSON.parse(raw))
    const legacy = localStorage.getItem(LEGACY_APPEARANCE_STORAGE_KEY)
    if (!legacy) return { ...DEFAULT_APPEARANCE }
    const previous = normalizeAppearance(JSON.parse(legacy))
    const migrated = previous.skinId === 'default' ? { ...DEFAULT_APPEARANCE } : previous
    saveAppearance(migrated)
    return migrated
  } catch {
    return { ...DEFAULT_APPEARANCE }
  }
}

export function saveAppearance(state: AppearanceState): void {
  try {
    if (typeof localStorage === 'undefined') return
    const next = normalizeAppearance(state)
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore quota */
  }
}

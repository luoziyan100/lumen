/**
 * [INPUT]: localStorage lumen:appearance.v1
 * [OUTPUT]: loadAppearance / saveAppearance / normalizeAppearance
 * [POS]: appearance 持久化;不进 agent-service settings
 */

import { coerceSkinId } from './registry.ts'
import { DEFAULT_APPEARANCE, type AppearanceMode, type AppearanceState } from './types.ts'

export const APPEARANCE_STORAGE_KEY = 'lumen:appearance.v1'

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
  return { version: 1, mode, skinId, overlay, blurPx }
}

export function loadAppearance(): AppearanceState {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_APPEARANCE }
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_APPEARANCE }
    return normalizeAppearance(JSON.parse(raw))
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

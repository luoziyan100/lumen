/**
 * [INPUT]: appearance 子模块
 * [OUTPUT]: 公共导出 + bootstrapAppearance / useAppearance
 * [POS]: ui-client 外观入口
 */

export type {
  AppearanceMode,
  AppearanceState,
  AppearanceTokenName,
  ResolvedTheme,
  SkinDefinition,
} from './types.ts'
export {
  APPEARANCE_TOKEN_WHITELIST,
  APPEARANCE_TOKEN_SET,
  DEFAULT_APPEARANCE,
  TOKEN_ALIASES,
} from './types.ts'
export { listSkins, getSkin, SKIN_REGISTRY, coerceSkinId, SKIN_DEFAULT } from './registry.ts'
export { resolveTheme, filterWhitelist, DARK_BASELINE } from './resolve.ts'
export { applyTheme } from './apply.ts'
export { loadAppearance, saveAppearance, normalizeAppearance, APPEARANCE_STORAGE_KEY } from './store.ts'
export { resolveSystemScheme, subscribeSystemScheme } from './systemMode.ts'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { applyTheme } from './apply.ts'
import { resolveTheme } from './resolve.ts'
import { loadAppearance, saveAppearance } from './store.ts'
import { subscribeSystemScheme } from './systemMode.ts'
import type { AppearanceState } from './types.ts'

/** 启动时同步应用（main.tsx 在 render 前调用） */
export function bootstrapAppearance(): AppearanceState {
  const state = loadAppearance()
  applyTheme(resolveTheme(state))
  return state
}

export function useAppearance(): {
  state: AppearanceState
  setAppearance: (partial: Partial<AppearanceState>) => void
} {
  const [state, setState] = useState<AppearanceState>(() => loadAppearance())

  const reapply = useCallback((next: AppearanceState) => {
    applyTheme(resolveTheme(next))
  }, [])

  useEffect(() => {
    reapply(state)
  }, [state, reapply])

  useEffect(() => {
    if (state.mode !== 'system') return
    return subscribeSystemScheme(() => {
      reapply(loadAppearance())
    })
  }, [state.mode, reapply])

  const setAppearance = useCallback((partial: Partial<AppearanceState>) => {
    setState((prev) => {
      const next = { ...prev, ...partial, version: 1 as const }
      saveAppearance(next)
      // 同步 apply：不依赖 useEffect 时序，点选立刻生效
      applyTheme(resolveTheme(next))
      return next
    })
  }, [])

  return useMemo(() => ({ state, setAppearance }), [state, setAppearance])
}

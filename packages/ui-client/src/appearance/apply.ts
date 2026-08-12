/**
 * [INPUT]: ResolvedTheme
 * [OUTPUT]: applyTheme —— 唯一 DOM 副作用
 * [POS]: appearance;data-theme=celadon 恒驻;color-scheme 固定 dark（R1）
 * [PROTOCOL]: doc/appearance-skin.md §6.4
 */

import type { ResolvedTheme } from './types.ts'

const APPLIED_TOKEN_KEYS = 'data-lumen-appearance-keys'

export function applyTheme(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement

  // D4：Kumo 锚恒驻
  root.dataset.theme = 'celadon'
  root.dataset.skin = resolved.skinId
  // 用户意图（system 已折叠）；不驱动 widget
  root.dataset.appearance = resolved.appearanceIntent

  // R1 / D12：宿主 color-scheme 固定 dark
  root.style.colorScheme = 'dark'

  // 清除上一轮 setProperty 的键（避免皮肤切换残留）
  const prevRaw = root.getAttribute(APPLIED_TOKEN_KEYS)
  if (prevRaw) {
    for (const k of prevRaw.split(',')) {
      if (k) root.style.removeProperty(k)
    }
  }

  const keys: string[] = []
  for (const [k, v] of Object.entries(resolved.tokens)) {
    root.style.setProperty(k, v)
    keys.push(k)
  }
  root.setAttribute(APPLIED_TOKEN_KEYS, keys.join(','))

  // 背景层
  if (resolved.backgroundImage) {
    root.style.setProperty('--skin-bg-image', `url(${JSON.stringify(resolved.backgroundImage).slice(1, -1)})`)
  } else {
    root.style.setProperty('--skin-bg-image', 'none')
  }
  root.style.setProperty('--skin-overlay', String(resolved.overlay))
  root.style.setProperty('--skin-blur', `${resolved.blurPx}px`)
  root.dataset.aurora = resolved.aurora ? '1' : '0'
}

/**
 * [INPUT]: localStorage、本窗口的自定义事件与 React 生命周期
 * [OUTPUT]: 默认关闭的桌面形态功能常量，以及保留的本机偏好读取、持久化与订阅
 * [POS]: 精灵与外观页共享的功能边界；关闭时不投影、不监听、不渲染入口，与 Rust 的 DESKTOP_ENABLED 同步
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useState } from 'react'

export const DESKTOP_SPRITE_ENABLED = false
export const DESKTOP_SPRITE_KEY = 'lumen.studio.desktop-sprite'
export const DESKTOP_SPRITE_EVENT = 'lumen-desktop-sprite-preference'

export function loadDesktopSpriteEnabled(): boolean {
  try {
    const value = localStorage.getItem(DESKTOP_SPRITE_KEY)
    return value === null ? true : value === 'true'
  } catch {
    return true
  }
}

export function saveDesktopSpriteEnabled(enabled: boolean): void {
  try { localStorage.setItem(DESKTOP_SPRITE_KEY, String(enabled)) } catch { /* 本次有效 */ }
  window.dispatchEvent(new CustomEvent<boolean>(DESKTOP_SPRITE_EVENT, { detail: enabled }))
}

export function useDesktopSpriteEnabled(): [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabled] = useState(loadDesktopSpriteEnabled)
  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<boolean>).detail
      if (typeof detail === 'boolean') setEnabled(detail)
    }
    window.addEventListener(DESKTOP_SPRITE_EVENT, onChange)
    return () => window.removeEventListener(DESKTOP_SPRITE_EVENT, onChange)
  }, [])
  return [enabled, saveDesktopSpriteEnabled]
}

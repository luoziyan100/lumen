/**
 * [INPUT]: 主窗口唯一会话订阅投影、本机开关与原生打开/可见性事件
 * [OUTPUT]: useDesktopSpritePreference 独立于服务发现应用本机开关；useDesktopSprite 单向发布状态并返回避免两形重叠所需的主形象可见性；useSpriteDesktopOpenBridge 接回既有开合交互
 * [POS]: 功能常量关闭时所有原生副作用停用；业务状态在 Sprite 推导，不创建会话订阅
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { DESKTOP_SPRITE_ENABLED, useDesktopSpriteEnabled } from './preference'
import type { SpriteState } from '../sprite-face'

export function useDesktopSpritePreference(): void {
  const [enabled] = useDesktopSpriteEnabled()
  useEffect(() => {
    if (DESKTOP_SPRITE_ENABLED && isTauri()) void invoke('set_desktop_sprite_enabled', { enabled }).catch(() => {})
  }, [enabled])
}

export function useDesktopSprite(state: SpriteState): boolean {
  const [mainVisible, setMainVisible] = useState(true)
  useEffect(() => {
    if (DESKTOP_SPRITE_ENABLED && isTauri()) void invoke('publish_sprite_state', { state }).catch(() => {})
  }, [state])
  useEffect(() => {
    if (!DESKTOP_SPRITE_ENABLED || !isTauri()) return
    let stopped = false, unlisten: (() => void) | undefined
    void listen<boolean>('sprite-main-visible', event => {
      setMainVisible(event.payload)
    }).then(stop => { if (stopped) stop(); else unlisten = stop })
    return () => { stopped = true; unlisten?.() }
  }, [])
  return mainVisible
}

export function useSpriteDesktopOpenBridge(onOpen: () => void): void {
  useEffect(() => {
    if (!DESKTOP_SPRITE_ENABLED || !isTauri()) return
    let stopped = false, unlisten: (() => void) | undefined
    void listen('sprite-open', onOpen).then(stop => { if (stopped) stop(); else unlisten = stop })
    return () => { stopped = true; unlisten?.() }
  }, [onOpen])
}

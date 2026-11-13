/**
 * [INPUT]: 主窗口唯一会话订阅投影、本机开关与原生打开/可见性事件
 * [OUTPUT]: useDesktopSpritePreference 独立于服务发现应用本机开关；useDesktopSprite 单向发布状态并返回避免两形重叠所需的主形象可见性；useSpriteDesktopOpenBridge 接回既有开合交互
 * [POS]: 不创建会话订阅；业务状态在 Sprite 推导，原生层只缓存和转发
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { useDesktopSpriteEnabled } from './preference'
import type { SpriteState } from '../sprite-face'

export function useDesktopSpritePreference(): void {
  const [enabled] = useDesktopSpriteEnabled()
  useEffect(() => {
    if (isTauri()) void invoke('set_desktop_sprite_enabled', { enabled }).catch(() => {})
  }, [enabled])
}

export function useDesktopSprite(state: SpriteState): boolean {
  const [mainVisible, setMainVisible] = useState(true)
  useEffect(() => {
    if (isTauri()) void invoke('publish_sprite_state', { state }).catch(() => {})
  }, [state])
  useEffect(() => {
    if (!isTauri()) return
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
    if (!isTauri()) return
    let stopped = false, unlisten: (() => void) | undefined
    void listen('sprite-open', onOpen).then(stop => { if (stopped) stop(); else unlisten = stop })
    return () => { stopped = true; unlisten?.() }
  }, [onOpen])
}

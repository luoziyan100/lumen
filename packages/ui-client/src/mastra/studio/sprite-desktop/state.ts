/**
 * [INPUT]: 原生缓存转发的未知状态
 * [OUTPUT]: isSpriteState 四态校验；协议仅传状态字符串
 * [POS]: 桌面入口的信任边界；不依赖服务、React 或 Tauri
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { SpriteState } from '../sprite-face'

const STATES: readonly SpriteState[] = ['idle', 'running', 'waiting', 'speaking']
export function isSpriteState(value: unknown): value is SpriteState {
  return typeof value === 'string' && STATES.includes(value as SpriteState)
}

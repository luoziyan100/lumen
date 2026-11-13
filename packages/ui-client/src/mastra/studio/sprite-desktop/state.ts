/**
 * [INPUT]: 原生缓存转发的未知四态负载与单调序号
 * [OUTPUT]: SpriteStatePayload 与严格校验，防止延迟快照覆盖较新事件
 * [POS]: 主窗和桌面窗共享协议；不依赖服务、React 或 Tauri
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { SpriteState } from '../sprite-face'

export type SpriteStatePayload = { state: SpriteState; sequence: number; sentAt: number }
const STATES: readonly SpriteState[] = ['idle', 'running', 'waiting', 'speaking']
export function isSpriteState(value: unknown): value is SpriteState {
  return typeof value === 'string' && STATES.includes(value as SpriteState)
}
export function isSpriteStatePayload(value: unknown): value is SpriteStatePayload {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<SpriteStatePayload>
  return isSpriteState(item.state) && Number.isSafeInteger(item.sequence) && item.sequence! >= 0 && Number.isSafeInteger(item.sentAt) && item.sentAt! >= 0
}

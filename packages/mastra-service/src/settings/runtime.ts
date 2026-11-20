/**
 * [INPUT]: 私有设置快照、现有模型网关的纯类型契约、providers.ts 的地址规整
 * [OUTPUT]: effectiveSettings / gatewaySettings，仅服务内部可读取的生效模型配置
 * [POS]: 设置领域到 SDK 网关的单向转换；不暴露为 HTTP 返回值
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { ModelSettings } from '../model.ts'
import { gatewayBaseUrl } from '../providers.ts'
import { SettingsError, type StoredSettings } from './schema.ts'
import type { Provider, VisionMode } from './types.ts'

export interface EffectiveSettings {
  profileId: string
  profileName: string
  provider: Provider
  baseUrl: string
  apiKey: string
  model: string
  contextWindow?: number
  pricing?: StoredSettings['profiles'][number]['pricing']
  vision: VisionMode
  userInstructions: string
  collectExecEvidence: boolean
}

export function effectiveSettings(data: StoredSettings): EffectiveSettings | null {
  const profile = data.profiles.find(profile => profile.id === data.activeProfileId)
  if (!profile) return null
  return { profileId: profile.id, profileName: profile.name, provider: profile.provider,
    baseUrl: profile.baseUrl, apiKey: profile.apiKey, model: profile.activeModel,
    contextWindow: profile.contextWindow, pricing: profile.pricing, vision: profile.vision,
    userInstructions: data.userInstructions, collectExecEvidence: data.collectExecEvidence }
}

export function gatewaySettings(data: StoredSettings): ModelSettings | null {
  const active = effectiveSettings(data)
  if (!active) return null
  if (!active.apiKey || !active.model) throw new SettingsError('Active model profile is incomplete', 409, 'settings.profile_incomplete')
  return { provider: active.provider, baseURL: gatewayBaseUrl(active.provider, active.baseUrl), apiKey: active.apiKey, model: active.model,
    contextWindow: active.contextWindow, pricing: active.pricing, vision: active.vision }
}

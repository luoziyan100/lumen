/**
 * [INPUT]: 无运行时依赖，模型设置的产品约定
 * [OUTPUT]: PROVIDER_IDS / Provider（接口协议名单）、PublicSettings / PublicModelProfile / SettingsPatch 及预算/模型价格纯 DTO
 * [POS]: 设置 UI 与服务的类型边界，公开读取类型不含真实凭证
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export const PROVIDER_IDS = ['openai', 'anthropic', 'google'] as const
export type Provider = typeof PROVIDER_IDS[number]
export type VisionMode = 'auto' | 'on' | 'off'

export interface ResearchBudget { maxPromptTokens?: number; maxCompletionTokens?: number; maxCostUsd?: number }
export interface ModelPricing { model: string; inputUsdPerMillion: number; outputUsdPerMillion: number }

export interface PublicModelProfile {
  id: string
  name: string
  provider: Provider
  baseUrl: string
  models: string[]
  activeModel: string
  contextWindow?: number
  pricing?: ModelPricing
  vision: VisionMode
  hasApiKey: boolean
  apiKeyMasked: string
}

export interface PublicSettings {
  profiles: PublicModelProfile[]
  activeProfileId: string | null
  userInstructions: string
  collectExecEvidence: boolean
  researchBudget: ResearchBudget
  /** Service-wide run state: a model pick may save while busy; a full profile edit stays behind the run lock. */
  busy?: boolean
}

export interface ProfileUpsert {
  id?: string
  name?: string
  provider?: Provider
  baseUrl?: string
  apiKey?: string
  clearApiKey?: boolean
  models?: string[]
  activeModel?: string
  contextWindow?: number | null
  pricing?: ModelPricing | null
  vision?: VisionMode
}

export interface SettingsPatch {
  upsertProfile?: ProfileUpsert
  deleteProfileId?: string
  activeProfileId?: string
  userInstructions?: string
  collectExecEvidence?: boolean
  researchBudget?: ResearchBudget
}

export type LegacySettingsSource = { path: string } | { data: unknown }

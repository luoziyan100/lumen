/**
 * [INPUT]: 已验证的设置更新与私有磁盘模型
 * [OUTPUT]: applyPatch / publicSettings：纯领域转换及无密钥的公开视图
 * [POS]: 统一模型选择、模型计价、预算替换、凭证更新和档案删除规则，不进行文件或网络操作
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { randomUUID } from 'node:crypto'
import { parseStored, SettingsError, type StoredProfile, type StoredSettings } from './schema.ts'
import type { ProfileUpsert, PublicSettings, SettingsPatch } from './types.ts'

const MASK = '••••••••'

export function isKeyMask(key: string): boolean {
  return ['已配置', '继承 .env', MASK].includes(key) || key.includes('…') || /^[*•●]+$/.test(key)
}

function updateProfile(current: StoredProfile | undefined, input: ProfileUpsert, count: number): StoredProfile {
  const profile = current ? { ...current } : { id: input.id ?? `mp-${randomUUID()}`, name: `模型 ${count + 1}`,
    provider: 'openai' as const, baseUrl: '', apiKey: '', models: [], activeModel: '', vision: 'auto' as const }
  for (const field of ['name', 'provider', 'baseUrl', 'vision'] as const)
    if (input[field] !== undefined) Object.assign(profile, { [field]: input[field] })
  if (input.clearApiKey) profile.apiKey = ''
  else if (input.apiKey && !isKeyMask(input.apiKey)) profile.apiKey = input.apiKey
  if (input.models) profile.models = input.models
  if (input.activeModel !== undefined) profile.activeModel = input.activeModel
  else if (!profile.models.includes(profile.activeModel)) profile.activeModel = profile.models[0] ?? ''
  if (input.pricing !== undefined) profile.pricing = input.pricing ?? undefined
  if (input.contextWindow !== undefined) profile.contextWindow = input.contextWindow || undefined
  return profile
}

export function applyPatch(previous: StoredSettings, patch: SettingsPatch): StoredSettings {
  const data = structuredClone(previous)
  if (patch.userInstructions !== undefined) data.userInstructions = patch.userInstructions
  if (patch.researchBudget !== undefined) data.researchBudget = { ...patch.researchBudget }
  if (patch.collectExecEvidence !== undefined) data.collectExecEvidence = patch.collectExecEvidence
  if (patch.upsertProfile) {
    const index = data.profiles.findIndex(profile => profile.id === patch.upsertProfile!.id)
    const profile = updateProfile(data.profiles[index], patch.upsertProfile, data.profiles.length)
    if (index < 0) data.profiles.push(profile)
    else data.profiles[index] = profile
    data.activeProfileId ??= profile.id
  }
  if (patch.deleteProfileId) {
    if (!data.profiles.some(profile => profile.id === patch.deleteProfileId)) throw new SettingsError('Profile not found', 404)
    data.profiles = data.profiles.filter(profile => profile.id !== patch.deleteProfileId)
    if (data.activeProfileId === patch.deleteProfileId) data.activeProfileId = data.profiles[0]?.id ?? null
  }
  if (patch.activeProfileId !== undefined) data.activeProfileId = patch.activeProfileId
  return parseStored(data)
}

export function publicSettings(data: StoredSettings): PublicSettings {
  return { profiles: data.profiles.map(({ apiKey, ...profile }) => ({ ...profile, models: [...profile.models],
    hasApiKey: !!apiKey, apiKeyMasked: apiKey ? MASK : '' })),
    activeProfileId: data.activeProfileId, userInstructions: data.userInstructions, collectExecEvidence: data.collectExecEvidence, researchBudget: { ...data.researchBudget } }
}

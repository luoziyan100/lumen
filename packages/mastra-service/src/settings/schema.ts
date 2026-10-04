/**
 * [INPUT]: Zod 校验、旧设置显式输入、公开设置 DTO
 * [OUTPUT]: 当前磁盘格式、预算正上限/模型非负价格及更新校验、旧格式规范化与 SettingsError
 * [POS]: 设置领域的数据边界；拒绝损坏当前文件，不隐式访问旧数据根
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { SettingsPatch } from './types.ts'

export class SettingsError extends Error {
  readonly status: 400 | 404 | 409 | 500
  constructor(message: string, status: 400 | 404 | 409 | 500 = 400) { super(message); this.status = status }
}

export const profileId = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/)
const provider = z.enum(['openai', 'anthropic'])
const vision = z.enum(['auto', 'on', 'off'])
const models = z.array(z.string().trim().max(256)).max(200).transform(list => [...new Set(list.filter(Boolean))])
const baseUrl = z.string().trim().max(2048).refine(value => {
  if (!value) return true
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash
  } catch { return false }
})

const pricing = z.object({ model: z.string().trim().min(1).max(256), inputUsdPerMillion: z.number().finite().nonnegative(), outputUsdPerMillion: z.number().finite().nonnegative() }).strict()
const researchBudget = z.object({ maxPromptTokens: z.number().int().positive().optional(), maxCompletionTokens: z.number().int().positive().optional(), maxCostUsd: z.number().finite().positive().optional() }).strict()

export const storedProfile = z.object({
  id: profileId, name: z.string().trim().min(1).max(120), provider,
  baseUrl: baseUrl.default(''), apiKey: z.string().trim().max(10000).default(''),
  models, activeModel: z.string().trim().max(256),
  pricing: pricing.optional(), contextWindow: z.number().int().positive().max(100_000_000).optional(), vision: vision.default('auto'),
}).strict().refine(profile => profile.models.length ? profile.models.includes(profile.activeModel) : profile.activeModel === '')

export const storedSettings = z.object({
  version: z.literal(1), profiles: z.array(storedProfile).max(100),
  activeProfileId: profileId.nullable(), userInstructions: z.string().max(100_000), collectExecEvidence: z.boolean(), researchBudget: researchBudget.default({}),
}).strict().refine(data => new Set(data.profiles.map(profile => profile.id)).size === data.profiles.length)
  .refine(data => data.profiles.length ? data.profiles.some(profile => profile.id === data.activeProfileId) : data.activeProfileId === null)

export type StoredProfile = z.infer<typeof storedProfile>
export type StoredSettings = z.infer<typeof storedSettings>
export const emptySettings = (): StoredSettings => ({ version: 1, profiles: [], activeProfileId: null, userInstructions: '', collectExecEvidence: true, researchBudget: {} })

const upsert = z.object({
  id: profileId.optional(), name: z.string().trim().min(1).max(120).optional(), provider: provider.optional(),
  baseUrl: baseUrl.optional(), apiKey: z.string().trim().max(10000).optional(), clearApiKey: z.boolean().optional(),
  models: models.optional(), activeModel: z.string().trim().max(256).optional(),
  pricing: pricing.nullable().optional(), contextWindow: z.number().int().min(0).max(100_000_000).nullable().optional(), vision: vision.optional(),
}).strict()

const patch = z.object({
  upsertProfile: upsert.optional(), deleteProfileId: profileId.optional(), activeProfileId: profileId.optional(),
  userInstructions: z.string().max(100_000).optional(), collectExecEvidence: z.boolean().optional(), researchBudget: researchBudget.optional(),
}).strict().refine(value => Object.keys(value).length > 0)

export function parsePatch(value: SettingsPatch): SettingsPatch {
  const result = patch.safeParse(value)
  if (!result.success) throw new SettingsError('Invalid settings update')
  return result.data
}

export function parseStored(value: unknown): StoredSettings {
  const result = storedSettings.safeParse(value)
  if (!result.success) throw new SettingsError('Invalid settings document')
  return result.data
}

const legacyProfile = z.object({
  id: profileId.optional(), name: z.string().optional(), provider: provider.optional(), baseUrl: baseUrl.optional(),
  apiKey: z.string().trim().max(10000).optional(), model: z.string().optional(), models: models.optional(),
  activeModel: z.string().optional(), contextWindow: z.number().optional(), vision: vision.optional(),
})
const legacyDocument = legacyProfile.extend({
  profiles: z.array(legacyProfile).max(100).optional(), activeProfileId: z.string().nullable().optional(),
  userInstructions: z.string().max(100_000).optional(), collectExecEvidence: z.boolean().optional(), researchBudget: researchBudget.optional(),
})

function importProfile(raw: z.infer<typeof legacyProfile>, fallbackId?: string): StoredProfile {
  const list = raw.models?.length ? raw.models : raw.model?.trim() ? [raw.model.trim()] : []
  const active = raw.activeModel?.trim() ?? ''
  return { id: raw.id ?? fallbackId ?? `mp-${randomUUID()}`, name: raw.name?.trim() || '模型',
    provider: raw.provider ?? 'openai', baseUrl: raw.baseUrl ?? '', apiKey: raw.apiKey ?? '', models: list,
    activeModel: list.includes(active) ? active : list[0] ?? '', vision: raw.vision ?? 'auto',
    ...(raw.contextWindow && raw.contextWindow > 0 ? { contextWindow: raw.contextWindow } : {}) }
}

export function importDocument(value: unknown): StoredSettings {
  const result = legacyDocument.safeParse(value)
  if (!result.success) throw new SettingsError('Invalid legacy settings document')
  const raw = result.data
  const hasFlatProfile = !!(raw.provider || raw.baseUrl || raw.apiKey || raw.model || raw.models)
  const profiles = raw.profiles?.map(profile => importProfile(profile)) ?? (hasFlatProfile ? [importProfile(raw, 'default')] : [])
  const activeProfileId = profiles.some(profile => profile.id === raw.activeProfileId) ? raw.activeProfileId! : profiles[0]?.id ?? null
  return parseStored({ version: 1, profiles, activeProfileId,
    userInstructions: raw.userInstructions ?? '', collectExecEvidence: raw.collectExecEvidence ?? true, researchBudget: raw.researchBudget ?? {} })
}

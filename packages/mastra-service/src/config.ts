/**
 * [INPUT]: 用户显式指定的模型档案 JSON
 * [OUTPUT]: readModelProfile：当前档案转换为新 SDK 配置
 * [POS]: 旧设置只读导入边界；不打印或复制凭证，不依赖旧 SettingsStore
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import type { ModelSettings } from './model.ts'
import { gatewayBaseUrl } from './providers.ts'
import { PROVIDER_IDS } from './settings/types.ts'

const profileSchema = z.object({
  provider: z.enum(PROVIDER_IDS), apiKey: z.string().min(1),
  baseUrl: z.string().url(), activeModel: z.string().min(1),
})

export async function readModelProfile(path: string): Promise<ModelSettings> {
  const document = z.object({ activeProfileId: z.string(), profiles: z.array(z.object({ id: z.string() }).passthrough()) })
    .safeParse(JSON.parse(await readFile(path, 'utf8')))
  if (!document.success) throw new Error('Invalid model settings document')
  const selected = document.data.profiles.find(profile => profile.id === document.data.activeProfileId)
  const result = profileSchema.safeParse(selected)
  if (!result.success) throw new Error('Active model profile is incomplete')
  const profile = result.data
  return { provider: profile.provider, model: profile.activeModel, apiKey: profile.apiKey, baseURL: gatewayBaseUrl(profile.provider, profile.baseUrl) }
}

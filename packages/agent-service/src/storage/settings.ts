/**
 * [INPUT]: node:fs / node:crypto
 * [OUTPUT]: SettingsStore —— 模型配置列表(多 profile,单启用)+ 自定义指令
 * [POS]: §存储层。~/.lumen/settings.json(0600);env/.env 是出厂默认,settings 是用户层
 *
 * 纪律:
 * - apiKey 落盘 0600,对外只给掩码,永不回传明文;update 传空 key = 保持不变。
 * - key 不跨 profile 继承:只有迁移/种子来的 'default' profile 允许继承 .env 的 key/baseUrl,
 *   用户新建的 profile 必须自带 key(否则模型层给出清晰报错),防止拿 A 家 key 请求 B 家。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

export type Provider = 'anthropic' | 'openai'

export interface ModelProfile {
  id: string
  name: string
  provider: Provider
  baseUrl?: string
  apiKey?: string
  model: string
}

interface SettingsData {
  profiles: ModelProfile[]
  activeProfileId?: string
  userInstructions?: string
}

/** 出厂默认(来自 env/.env,服务启动时定) */
export interface SettingsDefaults {
  provider: Provider
  baseUrl?: string
  apiKey?: string
  model: string
}

export interface PublicModelProfile {
  id: string
  name: string
  provider: Provider
  baseUrl: string
  model: string
  hasApiKey: boolean
  apiKeyMasked: string // 掩码或「继承 .env」,永不含明文
}

export interface PublicSettings {
  profiles: PublicModelProfile[]
  activeProfileId: string | null
  userInstructions: string
}

export interface ProfileUpsert {
  id?: string // 缺省 = 新建
  name?: string
  provider?: Provider
  baseUrl?: string
  apiKey?: string // 非空才替换
  model?: string
}

export interface SettingsPatch {
  userInstructions?: string
  upsertProfile?: ProfileUpsert
  deleteProfileId?: string
  activeProfileId?: string
}

const DEFAULT_PROFILE_ID = 'default'

function mask(key: string | undefined): string {
  if (!key) return ''
  return key.length <= 10 ? '已配置' : `${key.slice(0, 6)}…${key.slice(-4)}`
}

export class SettingsStore {
  private readonly file: string
  private readonly defaults: SettingsDefaults
  private data: SettingsData

  constructor(file: string, defaults: SettingsDefaults) {
    this.file = file
    this.defaults = defaults
    this.data = this.load()
    this.seedIfEmpty()
  }

  private load(): SettingsData {
    if (!existsSync(this.file)) return { profiles: [] }
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, unknown>
      if (Array.isArray(raw.profiles)) return raw as unknown as SettingsData
      // 迁移旧平铺格式 {provider,baseUrl,apiKey,model,userInstructions} → 单 profile
      const legacy = raw as { provider?: Provider; baseUrl?: string; apiKey?: string; model?: string; userInstructions?: string }
      const hasModelCfg = Boolean(legacy.provider || legacy.baseUrl || legacy.apiKey || legacy.model)
      return {
        profiles: hasModelCfg
          ? [{
              id: DEFAULT_PROFILE_ID,
              name: '默认',
              provider: legacy.provider ?? this.defaults.provider,
              baseUrl: legacy.baseUrl,
              apiKey: legacy.apiKey,
              model: legacy.model ?? this.defaults.model,
            }]
          : [],
        activeProfileId: hasModelCfg ? DEFAULT_PROFILE_ID : undefined,
        userInstructions: legacy.userInstructions,
      }
    } catch {
      return { profiles: [] } // 损坏不阻塞启动
    }
  }

  /** 首次启动:种一个继承 .env 的默认 profile(不把 env key 复制进文件) */
  private seedIfEmpty(): void {
    if (this.data.profiles.length) return
    this.data.profiles.push({
      id: DEFAULT_PROFILE_ID,
      name: '默认',
      provider: this.defaults.provider,
      baseUrl: this.defaults.baseUrl,
      model: this.defaults.model,
    })
    this.data.activeProfileId = DEFAULT_PROFILE_ID
  }

  private save(): void {
    writeFileSync(this.file, JSON.stringify(this.data, null, 2), { mode: 0o600 })
  }

  private active(): ModelProfile | undefined {
    return this.data.profiles.find((p) => p.id === this.data.activeProfileId) ?? this.data.profiles[0]
  }

  /** 该 profile 的生效 key/baseUrl(只有 default 允许继承 .env) */
  private resolved(p: ModelProfile): { apiKey?: string; baseUrl?: string } {
    const inherit = p.id === DEFAULT_PROFILE_ID
    return {
      apiKey: p.apiKey ?? (inherit ? this.defaults.apiKey : undefined),
      baseUrl: p.baseUrl ?? (inherit ? this.defaults.baseUrl : undefined),
    }
  }

  /** 生效配置(启用的 profile) */
  effective(): { provider: Provider; baseUrl?: string; apiKey?: string; model: string; userInstructions: string; profileName: string } {
    const p = this.active()
    const userInstructions = this.data.userInstructions ?? ''
    if (!p) {
      return { provider: this.defaults.provider, baseUrl: this.defaults.baseUrl, apiKey: this.defaults.apiKey, model: this.defaults.model, userInstructions, profileName: '默认' }
    }
    const r = this.resolved(p)
    return { provider: p.provider, baseUrl: r.baseUrl, apiKey: r.apiKey, model: p.model || this.defaults.model, userInstructions, profileName: p.name }
  }

  toPublic(): PublicSettings {
    return {
      profiles: this.data.profiles.map((p) => {
        const r = this.resolved(p)
        return {
          id: p.id,
          name: p.name,
          provider: p.provider,
          baseUrl: p.baseUrl ?? (p.id === DEFAULT_PROFILE_ID ? this.defaults.baseUrl ?? '' : ''),
          model: p.model,
          hasApiKey: Boolean(r.apiKey),
          apiKeyMasked: p.apiKey ? mask(p.apiKey) : (r.apiKey ? '继承 .env' : ''),
        }
      }),
      activeProfileId: this.active()?.id ?? null,
      userInstructions: this.data.userInstructions ?? '',
    }
  }

  update(patch: SettingsPatch): PublicSettings {
    if (typeof patch.userInstructions === 'string') this.data.userInstructions = patch.userInstructions

    if (patch.upsertProfile) {
      const u = patch.upsertProfile
      const existing = u.id ? this.data.profiles.find((p) => p.id === u.id) : undefined
      if (existing) {
        if (typeof u.name === 'string' && u.name.trim()) existing.name = u.name.trim()
        if (u.provider === 'anthropic' || u.provider === 'openai') existing.provider = u.provider
        if (typeof u.baseUrl === 'string') existing.baseUrl = u.baseUrl.trim() || undefined
        if (typeof u.model === 'string' && u.model.trim()) existing.model = u.model.trim()
        if (typeof u.apiKey === 'string' && u.apiKey.trim()) existing.apiKey = u.apiKey.trim()
      } else {
        const profile: ModelProfile = {
          id: u.id ?? `mp-${randomUUID().slice(0, 8)}`,
          name: u.name?.trim() || `模型 ${this.data.profiles.length + 1}`,
          provider: u.provider ?? 'openai',
          baseUrl: u.baseUrl?.trim() || undefined,
          apiKey: u.apiKey?.trim() || undefined,
          model: u.model?.trim() || this.defaults.model,
        }
        this.data.profiles.push(profile)
        if (!this.data.activeProfileId) this.data.activeProfileId = profile.id
      }
    }

    if (patch.deleteProfileId) {
      this.data.profiles = this.data.profiles.filter((p) => p.id !== patch.deleteProfileId)
      if (this.data.activeProfileId === patch.deleteProfileId) {
        this.data.activeProfileId = this.data.profiles[0]?.id
      }
    }

    if (typeof patch.activeProfileId === 'string' && this.data.profiles.some((p) => p.id === patch.activeProfileId)) {
      this.data.activeProfileId = patch.activeProfileId
    }

    this.save()
    return this.toPublic()
  }
}

/**
 * [INPUT]: node:fs / node:crypto
 * [OUTPUT]: SettingsStore —— 供应商 profile 列表(多配置单启用)+ 每卡 models[]/activeModel + 自定义指令
 * [POS]: §存储层。~/.lumen/settings.json(0600);env/.env 是出厂默认,settings 是用户层
 *
 * 纪律:
 * - apiKey 落盘 0600,对外只给掩码,永不回传明文;update 传空 key = 保持不变。
 * - key 不跨 profile 继承:只有迁移/种子来的 'default' profile 允许继承 .env 的 key/baseUrl,
 *   用户新建的 profile 必须自带 key(否则模型层给出清晰报错),防止拿 A 家 key 请求 B 家。
 * - 同厂商多模型:一张 profile 挂 models[],activeModel 为启用该卡时的生效 ID;旧字段 model 读盘迁移。
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
  /** 该供应商下可切换的模型 ID 列表 */
  models: string[]
  /** 启用本卡时生效的模型 ID(须在 models 内;空列表时为空串) */
  activeModel: string
  /** 上下文窗口(token);缺省按模型名保守推断(见 context-budget.ts) */
  contextWindow?: number
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
  models: string[]
  activeModel: string
  /** = activeModel,兼容旧客户端/芯片文案 */
  model: string
  contextWindow?: number
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
  /** 整表替换该卡的模型 ID 列表(空串过滤) */
  models?: string[]
  /** 指定启用 ID;须落在 models(或更新后的列表)内 */
  activeModel?: string
  /** 兼容旧单字段:无 models 时当作单模型写入 */
  model?: string
  contextWindow?: number // >0 设置;0 或负数清除(回到按模型名推断)
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

function cleanModels(list: unknown): string[] {
  if (!Array.isArray(list)) return []
  const out: string[] = []
  for (const item of list) {
    if (typeof item !== 'string') continue
    const t = item.trim()
    if (t && !out.includes(t)) out.push(t)
  }
  return out
}

/** 读盘规范化:旧 model → models/activeModel;写盘只保留新字段 */
function normalizeProfile(raw: Record<string, unknown>, fallbackModel: string): ModelProfile {
  const legacyModel = typeof raw.model === 'string' ? raw.model.trim() : ''
  let models = cleanModels(raw.models)
  if (!models.length && legacyModel) models = [legacyModel]
  let activeModel = typeof raw.activeModel === 'string' ? raw.activeModel.trim() : ''
  if (!activeModel || !models.includes(activeModel)) activeModel = models[0] ?? ''
  if (!models.length && fallbackModel) {
    models = [fallbackModel]
    activeModel = fallbackModel
  }
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `mp-${randomUUID().slice(0, 8)}`,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : '模型',
    provider: raw.provider === 'anthropic' ? 'anthropic' : 'openai',
    baseUrl: typeof raw.baseUrl === 'string' && raw.baseUrl.trim() ? raw.baseUrl.trim() : undefined,
    apiKey: typeof raw.apiKey === 'string' && raw.apiKey.trim() ? raw.apiKey.trim() : undefined,
    models,
    activeModel,
    contextWindow: typeof raw.contextWindow === 'number' && raw.contextWindow > 0 ? raw.contextWindow : undefined,
  }
}

function pickActive(models: string[], want: string | undefined, fallback: string): string {
  if (want && models.includes(want)) return want
  return models[0] ?? fallback
}

function applyModelFields(p: ModelProfile, u: ProfileUpsert, fallbackModel: string): void {
  if (Array.isArray(u.models)) {
    p.models = cleanModels(u.models)
    p.activeModel = pickActive(p.models, u.activeModel?.trim() || p.activeModel, fallbackModel)
    if (!p.models.length) p.activeModel = ''
    return
  }
  if (typeof u.model === 'string' && u.model.trim()) {
    const m = u.model.trim()
    if (p.models.includes(m)) {
      p.activeModel = m
    } else if (p.models.length <= 1) {
      p.models = [m]
      p.activeModel = m
    } else {
      const idx = p.models.indexOf(p.activeModel)
      if (idx >= 0) p.models[idx] = m
      else p.models.push(m)
      p.activeModel = m
    }
    return
  }
  if (typeof u.activeModel === 'string' && u.activeModel.trim()) {
    const m = u.activeModel.trim()
    if (p.models.includes(m)) p.activeModel = m
  }
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
      if (Array.isArray(raw.profiles)) {
        return {
          profiles: (raw.profiles as Record<string, unknown>[]).map((p) =>
            normalizeProfile(p, this.defaults.model)),
          activeProfileId: typeof raw.activeProfileId === 'string' ? raw.activeProfileId : undefined,
          userInstructions: typeof raw.userInstructions === 'string' ? raw.userInstructions : undefined,
        }
      }
      // 迁移旧平铺格式 {provider,baseUrl,apiKey,model,userInstructions} → 单 profile
      const legacy = raw as { provider?: Provider; baseUrl?: string; apiKey?: string; model?: string; userInstructions?: string }
      const hasModelCfg = Boolean(legacy.provider || legacy.baseUrl || legacy.apiKey || legacy.model)
      return {
        profiles: hasModelCfg
          ? [normalizeProfile({
              id: DEFAULT_PROFILE_ID,
              name: '默认',
              provider: legacy.provider ?? this.defaults.provider,
              baseUrl: legacy.baseUrl,
              apiKey: legacy.apiKey,
              model: legacy.model ?? this.defaults.model,
            }, this.defaults.model)]
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
      models: [this.defaults.model],
      activeModel: this.defaults.model,
    })
    this.data.activeProfileId = DEFAULT_PROFILE_ID
  }

  private save(): void {
    // 落盘只写 models/activeModel,不写遗留 model 字段
    const payload = {
      profiles: this.data.profiles.map(({ id, name, provider, baseUrl, apiKey, models, activeModel, contextWindow }) => ({
        id,
        name,
        provider,
        ...(baseUrl ? { baseUrl } : {}),
        ...(apiKey ? { apiKey } : {}),
        models,
        activeModel,
        ...(contextWindow ? { contextWindow } : {}),
      })),
      ...(this.data.activeProfileId ? { activeProfileId: this.data.activeProfileId } : {}),
      ...(this.data.userInstructions !== undefined ? { userInstructions: this.data.userInstructions } : {}),
    }
    writeFileSync(this.file, JSON.stringify(payload, null, 2), { mode: 0o600 })
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

  private resolvedModel(p: ModelProfile): string {
    return p.activeModel || p.models[0] || this.defaults.model
  }

  /** 生效配置(启用的 profile) */
  effective(): { provider: Provider; baseUrl?: string; apiKey?: string; model: string; contextWindow?: number; userInstructions: string; profileName: string } {
    const p = this.active()
    const userInstructions = this.data.userInstructions ?? ''
    if (!p) {
      return { provider: this.defaults.provider, baseUrl: this.defaults.baseUrl, apiKey: this.defaults.apiKey, model: this.defaults.model, userInstructions, profileName: '默认' }
    }
    const r = this.resolved(p)
    return {
      provider: p.provider,
      baseUrl: r.baseUrl,
      apiKey: r.apiKey,
      model: this.resolvedModel(p),
      contextWindow: p.contextWindow,
      userInstructions,
      profileName: p.name,
    }
  }

  toPublic(): PublicSettings {
    return {
      profiles: this.data.profiles.map((p) => {
        const r = this.resolved(p)
        const activeModel = this.resolvedModel(p)
        return {
          id: p.id,
          name: p.name,
          provider: p.provider,
          baseUrl: p.baseUrl ?? (p.id === DEFAULT_PROFILE_ID ? this.defaults.baseUrl ?? '' : ''),
          models: [...p.models],
          activeModel,
          model: activeModel,
          ...(p.contextWindow ? { contextWindow: p.contextWindow } : {}),
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
        if (typeof u.apiKey === 'string' && u.apiKey.trim()) existing.apiKey = u.apiKey.trim()
        if (typeof u.contextWindow === 'number') existing.contextWindow = u.contextWindow > 0 ? u.contextWindow : undefined
        applyModelFields(existing, u, this.defaults.model)
      } else {
        const models = Array.isArray(u.models)
          ? cleanModels(u.models)
          : (typeof u.model === 'string' && u.model.trim() ? [u.model.trim()] : [this.defaults.model])
        const activeModel = pickActive(models, u.activeModel?.trim(), this.defaults.model)
        const profile: ModelProfile = {
          id: u.id ?? `mp-${randomUUID().slice(0, 8)}`,
          name: u.name?.trim() || `模型 ${this.data.profiles.length + 1}`,
          provider: u.provider ?? 'openai',
          baseUrl: u.baseUrl?.trim() || undefined,
          apiKey: u.apiKey?.trim() || undefined,
          models: models.length ? models : [this.defaults.model],
          activeModel: models.length ? activeModel : this.defaults.model,
          contextWindow: typeof u.contextWindow === 'number' && u.contextWindow > 0 ? u.contextWindow : undefined,
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

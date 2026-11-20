/**
 * [INPUT]: providers.ts 的 languageModel、settings/types 的 Provider、Mastra gateway 公共接口
 * [OUTPUT]: ModelSettings（含模型计价快照）/ createModelGateway，将本地模型档案交给 SDK
 * [POS]: 模型唯一配置边界；不实现 SSE、不依赖旧 ModelPort
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { MastraModelGatewayInterface } from '@mastra/core/llm'
import { languageModel } from './providers.ts'
import type { ModelPricing, Provider } from './settings/types.ts'

export interface ModelSettings {
  provider?: Provider
  baseURL: string
  apiKey: string
  model: string
  contextWindow?: number
  /** Frozen with the model registration, so switching profiles mid-run never reprices an older conversation. */
  pricing?: ModelPricing
  vision?: 'auto' | 'on' | 'off'
  fetch?: typeof globalThis.fetch
}

export function createModelGateway(settings: ModelSettings): MastraModelGatewayInterface {
  return {
    id: 'lumen', name: 'Lumen configured provider',
    fetchProviders: async () => ({ configured: {
      name: 'Configured provider', models: [settings.model], gateway: 'lumen', apiKeyEnvVar: [],
    } }),
    buildUrl: () => settings.baseURL,
    getApiKey: async () => settings.apiKey,
    resolveLanguageModel: ({ modelId }) => languageModel(settings.provider, settings, modelId, 'lumen'),
  }
}

export function modelId(settings: ModelSettings): string {
  return `lumen/configured/${settings.model}`
}

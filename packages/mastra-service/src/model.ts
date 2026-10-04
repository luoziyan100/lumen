/**
 * [INPUT]: AI SDK OpenAI-compatible provider 与 Mastra gateway 公共接口
 * [OUTPUT]: ModelSettings（含模型计价快照）/ createModelGateway，将本地模型档案交给 SDK
 * [POS]: 模型唯一配置边界；不实现 SSE、不依赖旧 ModelPort
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { MastraModelGatewayInterface } from '@mastra/core/llm'
import type { ModelPricing } from './settings/types.ts'

export interface ModelSettings {
  provider?: 'openai' | 'anthropic'
  baseURL: string
  apiKey: string
  model: string
  contextWindow?: number
  /** 与模型注册一起冻结，避免运行中切换全局档案污染旧会话计价。 */
  pricing?: ModelPricing
  vision?: 'auto' | 'on' | 'off'
  fetch?: typeof globalThis.fetch
}

export function createModelGateway(settings: ModelSettings): MastraModelGatewayInterface {
  const provider = createOpenAICompatible({
    name: 'lumen', baseURL: settings.baseURL, apiKey: settings.apiKey,
    ...(settings.fetch ? { fetch: settings.fetch } : {}),
  })
  return {
    id: 'lumen', name: 'Lumen configured provider',
    fetchProviders: async () => ({ configured: {
      name: 'Configured provider', models: [settings.model], gateway: 'lumen', apiKeyEnvVar: [],
    } }),
    buildUrl: () => settings.baseURL,
    getApiKey: async () => settings.apiKey,
    resolveLanguageModel: ({ modelId }) => settings.provider === 'anthropic'
      ? createAnthropic({ baseURL: settings.baseURL, apiKey: settings.apiKey, ...(settings.fetch ? { fetch: settings.fetch } : {}) })(modelId)
      : provider.chatModel(modelId),
  }
}

export function modelId(settings: ModelSettings): string {
  return `lumen/configured/${settings.model}`
}

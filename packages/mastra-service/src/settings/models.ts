/**
 * [INPUT]: 已解析的模型配置、SDK 提供商和 Mastra Gateway 公共接口
 * [OUTPUT]: createConfiguredModels：不可变配置注册、稳定模型 ID 选择与流前上游错误有界重试
 * [POS]: 设置到模型网络的边界；相同有效配置复用注册版本，仅在模型尚未输出正文或工具增量时重试
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { MastraModelGatewayInterface } from '@mastra/core/llm'
import type { ModelSettings } from '../model.ts'
import { SettingsError } from './schema.ts'

const MAX_EARLY_RETRIES = 2
const MAX_PREFIX_BYTES = 64 * 1024

function frameState(frame: string): 'pending' | 'started' | 'retry' {
  const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
  if (!data) return 'pending'
  if (data === '[DONE]') return 'started'
  let value: unknown
  try { value = JSON.parse(data) } catch { return 'started' }
  if (!value || typeof value !== 'object') return 'started'
  const event = value as { error?: { type?: unknown }; choices?: Array<{ delta?: Record<string, unknown>; finish_reason?: unknown }> }
  if (event.error?.type === 'upstream_error') return 'retry'
  if (event.error || !Array.isArray(event.choices)) return 'started'
  return event.choices.some(choice => choice.finish_reason != null || Object.entries(choice.delta ?? {}).some(([key, part]) => key !== 'role' && part != null && part !== ''))
    ? 'started' : 'pending'
}

async function inspectPrefix(response: Response) {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let pending = '', bytes = 0
  for (;;) {
    const result = await reader.read()
    if (result.done) return { reader, retry: false }
    bytes += result.value.byteLength
    if (bytes >= MAX_PREFIX_BYTES) return { reader, retry: false }
    pending += decoder.decode(result.value, { stream: true })
    const frames = pending.split(/\r?\n\r?\n/)
    pending = frames.pop() ?? ''
    for (const frame of frames) {
      const state = frameState(frame)
      if (state !== 'pending') return { reader, retry: state === 'retry' }
    }
  }
}

function retryEarlyUpstreamError(requestFetch: typeof globalThis.fetch): typeof globalThis.fetch {
  return async (input, init) => {
    if (!(typeof input === 'string' || input instanceof URL) || (init?.body != null && typeof init.body !== 'string')) return requestFetch(input, init)
    for (let attempt = 0; ; attempt++) {
      const response = await requestFetch(input, init)
      if (response.status !== 200 || !response.body || !response.headers.get('content-type')?.includes('text/event-stream')) return response
      let prefix: Awaited<ReturnType<typeof inspectPrefix>>
      try { prefix = await inspectPrefix(response.clone()) }
      catch { return response }
      if (!prefix.retry || attempt >= MAX_EARLY_RETRIES) {
        void prefix.reader.cancel().catch(() => {})
        return response
      }
      await Promise.allSettled([prefix.reader.cancel(), response.body.cancel()])
      await delay(150 * (attempt + 1), undefined, { signal: init?.signal ?? undefined })
    }
  }
}

export function createConfiguredModels() {
  const configurations = new Map<string, Readonly<ModelSettings>>()
  let selected: { id: string; settings: Readonly<ModelSettings> } | undefined

  function sameSettings(left: Readonly<ModelSettings>, right: ModelSettings): boolean {
    return left.provider === right.provider && left.baseURL === right.baseURL && left.apiKey === right.apiKey
      && left.model === right.model && left.contextWindow === right.contextWindow && left.vision === right.vision
      && (left.fetch === undefined || right.fetch === undefined || Object.is(left.fetch, right.fetch))
      && left.pricing?.model === right.pricing?.model
      && left.pricing?.inputUsdPerMillion === right.pricing?.inputUsdPerMillion
      && left.pricing?.outputUsdPerMillion === right.pricing?.outputUsdPerMillion
  }

  function configured(providerId: string, model: string) {
    const settings = configurations.get(providerId)
    if (!settings || settings.model !== model) throw new SettingsError('Model configuration is unavailable', 409)
    return settings
  }

  function fromRouterId(routerId: string) {
    const [gatewayId, providerId, ...model] = routerId.split('/')
    if (gatewayId !== 'lumen' || !providerId) throw new SettingsError('Invalid configured model ID')
    return configured(providerId, model.join('/'))
  }

  const gateway: MastraModelGatewayInterface = {
    id: 'lumen', name: 'Lumen configured models',
    fetchProviders: async () => Object.fromEntries([...configurations].map(([id, settings]) => [id, {
      name: 'Configured provider', models: [settings.model], gateway: 'lumen', apiKeyEnvVar: [],
    }])),
    buildUrl: routerId => fromRouterId(routerId).baseURL,
    getApiKey: async routerId => fromRouterId(routerId).apiKey,
    resolveLanguageModel: ({ providerId, modelId }) => {
      const settings = configured(providerId, modelId)
      const options = { baseURL: settings.baseURL, apiKey: settings.apiKey,
        fetch: settings.provider === 'anthropic' ? settings.fetch : retryEarlyUpstreamError(settings.fetch ?? globalThis.fetch) }
      return settings.provider === 'anthropic'
        ? createAnthropic(options)(modelId)
        : createOpenAICompatible({ ...options, name: providerId }).chatModel(modelId)
    },
    serializeForSpan: () => ({ id: 'lumen', name: 'Lumen configured models' }),
  }

  return {
    gateway,
    settings(routerId: string): Readonly<ModelSettings> | undefined {
      const [gatewayId, providerId, ...model] = routerId.split('/')
      if (gatewayId !== 'lumen' || !providerId || model.length === 0) return undefined
      const value = configurations.get(providerId)
      return value?.model === model.join('/') ? value : undefined
    },
    select(settings: ModelSettings): string {
      if (selected && sameSettings(selected.settings, settings)) return selected.id
      const providerId = `configured-${randomUUID()}`
      const frozen = Object.freeze({ ...settings })
      const id = `lumen/${providerId}/${settings.model}`
      configurations.set(providerId, frozen)
      selected = { id, settings: frozen }
      return id
    },
  }
}

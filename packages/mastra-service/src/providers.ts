/**
 * [INPUT]: the Provider type from settings/types.ts (its PROVIDER_IDS is the list of names); the AI SDK provider factories; the Mastra gateway interface's model type
 * [OUTPUT]: PROVIDERS (one entry per API format), providerSpec, gatewayBaseUrl, languageModel
 * [POS]: the only place that knows how each API format is reached: default address, which pasted endpoint suffix to strip, which SDK builds the model, whether its stream is OpenAI SSE. model.ts, settings/models.ts, settings/runtime.ts and config.ts read it and never branch on a provider themselves
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { MastraModelGatewayInterface } from '@mastra/core/llm'
import type { Provider } from './settings/types.ts'

type LanguageModel = Awaited<ReturnType<MastraModelGatewayInterface['resolveLanguageModel']>>
interface Connection { baseURL: string; apiKey: string; fetch?: typeof globalThis.fetch }

interface ProviderSpec {
  defaultBaseUrl: string
  endpointSuffix: RegExp
  openAiSse: boolean
  model: (connection: Connection, modelId: string, name: string) => LanguageModel
}

export const PROVIDERS: Record<Provider, ProviderSpec> = {
  openai: {
    defaultBaseUrl: 'https://api.openai.com/v1',
    endpointSuffix: /\/(chat\/completions|messages)\/?$/,
    openAiSse: true,
    model: (connection, modelId, name) => createOpenAICompatible({ ...connection, name }).chatModel(modelId),
  },
  anthropic: {
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    endpointSuffix: /\/(chat\/completions|messages)\/?$/,
    openAiSse: false,
    model: (connection, modelId) => createAnthropic(connection)(modelId),
  },
  google: {
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    endpointSuffix: /\/openai(\/chat\/completions)?\/?$/,
    openAiSse: false,
    model: (connection, modelId) => createGoogleGenerativeAI(connection)(modelId),
  },
}

export function gatewayBaseUrl(provider: Provider, baseUrl: string): string {
  const spec = PROVIDERS[provider]
  const url = new URL(baseUrl || spec.defaultBaseUrl)
  url.pathname = url.pathname.replace(spec.endpointSuffix, '').replace(/\/$/, '') || new URL(spec.defaultBaseUrl).pathname
  return url.toString().replace(/\/$/, '')
}

export function providerSpec(provider: Provider | undefined): ProviderSpec {
  return PROVIDERS[provider ?? 'openai']
}

export function languageModel(provider: Provider | undefined, { baseURL, apiKey, fetch }: Connection, modelId: string, name: string): LanguageModel {
  return providerSpec(provider).model({ baseURL, apiKey, ...(fetch ? { fetch } : {}) }, modelId, name)
}

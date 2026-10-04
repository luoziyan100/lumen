/**
 * [INPUT]: 官方 Observability/MastraStorageExporter、动态采集开关与凭证 resolver
 * [OUTPUT]: createTelemetry：仅本机原生存储的 trace 采集
 * [POS]: 官方扩展点内脱敏，不包装模型传输或建立第二条 trace 管线
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { Observability, MastraStorageExporter, SamplingStrategyType } from '@mastra/observability'
import type { SpanOutputProcessor, AnySpan, ObservabilityExporter } from '@mastra/core/observability'
import { redactPayload } from './redact.ts'

export function createTelemetry(enabled: () => boolean, secrets: () => readonly string[]) {
  const storage = new MastraStorageExporter({ maxBatchSize: 64, maxBufferSize: 2000, maxBatchWaitMs: 1000, maxRetries: 2, logLevel: 'error' })
  // --- 官方总线以可选 handler 声明信号能力；LibSQL 只接收 trace ---
  const exporter: ObservabilityExporter = { name: storage.name,
    init: options => storage.init(options), __setLogger: logger => storage.__setLogger(logger),
    onTracingEvent: event => storage.onTracingEvent(event), exportTracingEvent: event => storage.exportTracingEvent(event),
    flush: () => storage.flush(), shutdown: () => storage.shutdown(),
  }
  const processor: SpanOutputProcessor = {
    name: 'lumen-local-diagnostics', shutdown: async () => {},
    process(span?: AnySpan) {
      if (!span) return undefined
      try {
        if (!enabled()) return undefined
        const prior = span.metadata?.lumenDiagnostics
        const input = redactPayload(span.input, secrets()), output = redactPayload(span.output, secrets())
        const clean = redactPayload({ name: span.name, input: span.input, output: span.output, attributes: span.attributes, metadata: span.metadata, errorInfo: span.errorInfo, requestContext: span.requestContext }, secrets())
        if (!clean.value || typeof clean.value !== 'object' || Array.isArray(clean.value)) return undefined
        const value = clean.value as Record<string, unknown>
        span.name = String(value.name)
        span.input = input.value; span.output = output.value
        span.attributes = value.attributes as AnySpan['attributes']; span.errorInfo = value.errorInfo as AnySpan['errorInfo']
        span.requestContext = value.requestContext as AnySpan['requestContext']
        span.metadata = { ...(value.metadata && typeof value.metadata === 'object' ? value.metadata : {}), lumenDiagnostics: {
          redacted: clean.redacted || prior?.redacted === true, truncated: clean.truncated || prior?.truncated === true,
          inputTruncated: input.truncated || prior?.inputTruncated === true, outputTruncated: output.truncated || prior?.outputTruncated === true,
        } }
        return span
      } catch { return undefined }
    },
  }
  return new Observability({
    configs: { lumen: {
      serviceName: 'lumen', exporters: [exporter],
      sampling: { type: SamplingStrategyType.CUSTOM, sampler: () => { try { return enabled() } catch { return false } } },
      spanOutputProcessors: [processor], spanFilter: () => { try { return enabled() } catch { return false } },
      requestContextKeys: ['controller.resourceId', 'controller.threadId'],
      serializationOptions: { maxStringLength: 65536, maxDepth: 16, maxArrayLength: 250, maxObjectKeys: 250 },
      logging: { enabled: false },
    } },
  })
}

/**
 * [INPUT]: 原生 LibSQL observability、可信会话授权、用户标注与脱敏规则
 * [OUTPUT]: createDiagnostics：采集、授权 trace、问题标注、隔离评估和本地导出
 * [POS]: 产品诊断组合；仅按原生身份查询，既不猜测最后一轮，也不把 trace 等同完整审计
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { LibSQLStore } from '@mastra/libsql'
import type { GetTraceResponse } from '@mastra/core/storage'
import { z } from 'zod'
import { CaseStore } from './notes.ts'
import { createTelemetry } from './telemetry.ts'
import { redactPayload } from './redact.ts'
import { encodeDiagnosticPack, readRecorded } from './export.ts'
import { runEvaluation, type LiveModel } from './evaluation/run.ts'
import type { EvaluationMode, EvaluationResult } from './evaluation/types.ts'
import { DiagnosticsError, UNTRACKED, markCaseSchema, updateCaseSchema, type BadCase, type DiagnosticSpan, type DiagnosticTrace, type DiagnosticPack, type MarkCaseInput, type UpdateCaseInput, type Coverage, type TraceSummary } from './types.ts'

interface Options {
  dataRoot: string; storage: Pick<LibSQLStore, 'getStore'>
  authorize: (resourceId: string) => Promise<{ resourceId: string; threadId: string }>
  enabled?: () => boolean; secrets?: () => readonly string[]
  liveModel?: LiveModel
}
const resourceSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}:[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/)
const pageSchema = z.object({ page: z.number().int().min(0).max(100000).default(0), perPage: z.number().int().min(1).max(100).default(50) })
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

export function createDiagnostics(options: Options) {
  const enabled = options.enabled ?? (() => true), secrets = options.secrets ?? (() => [])
  const observability = createTelemetry(enabled, secrets), cases = new CaseStore(options.dataRoot)
  let closed = false
  const evaluations = new Map<string, { abort: AbortController; result: Promise<EvaluationResult> }>()
  async function authorized(resourceId: string) {
    if (closed) throw new DiagnosticsError('诊断已关闭', 503)
    if (!resourceSchema.safeParse(resourceId).success) throw new DiagnosticsError('会话身份无效', 400)
    const identity = await options.authorize(resourceId)
    if (identity.resourceId !== resourceId || !identity.threadId) throw new DiagnosticsError('会话不存在', 404)
    return identity
  }
  async function domain() {
    const storage = await options.storage.getStore('observability')
    if (!storage) throw new DiagnosticsError('原生 trace 存储不可用', 503)
    return storage
  }
  function safeCase(item: BadCase): BadCase {
    const clean = redactPayload({ actual: item.actual, expected: item.expected, note: item.note }, secrets()), value = record(clean.value)
    return { ...item, actual: String(value.actual ?? '[OMITTED]'), expected: String(value.expected ?? '[OMITTED]'), note: String(value.note ?? '[OMITTED]'), redacted: item.redacted || clean.redacted || clean.truncated,
      ...(item.lastEvaluation ? { lastEvaluation: safeEvaluation(item.lastEvaluation) } : {}) }
  }
  function safeEvaluation(result: EvaluationResult): EvaluationResult {
    const clean = redactPayload(result, secrets()), value = record(clean.value)
    return { ...result, ...value, reply: String(value.reply ?? '[OMITTED]'), detail: String(value.detail ?? '[OMITTED]'), gaps: Array.isArray(value.gaps) ? value.gaps.map(String) : [],
      ...(clean.redacted || clean.truncated ? { judgment: 'not_evaluated' as const } : {}) }
  }
  function safeSpan(span: GetTraceResponse['spans'][number]): DiagnosticSpan {
    const clean = redactPayload({ name: span.name, input: span.input, output: span.output, attributes: span.attributes, metadata: span.metadata, error: span.error }, secrets())
    const value = record(clean.value), prior = record(span.metadata?.lumenDiagnostics)
    return { spanId: span.spanId, parentSpanId: span.parentSpanId ?? null, type: span.spanType, name: String(value.name ?? '[OMITTED]'), resourceId: span.resourceId ?? null,
      threadId: span.threadId ?? null, runId: span.runId ?? null, startedAt: span.startedAt.toISOString(), endedAt: span.endedAt?.toISOString() ?? null,
      input: value.input ?? null, output: value.output ?? null, attributes: value.attributes ?? null, metadata: value.metadata ?? null, error: value.error ?? null,
      redacted: clean.redacted || prior.redacted === true, truncated: clean.truncated || prior.truncated === true }
  }
  async function traceFor(resourceId: string, traceId: string): Promise<DiagnosticTrace> {
    if (!traceId || traceId.length > 128) throw new DiagnosticsError('Trace 身份无效', 400)
    const trace = await (await domain()).getTrace({ traceId })
    const root = trace?.spans.find(span => !span.parentSpanId)
    if (!trace || !root || root.resourceId !== resourceId) throw new DiagnosticsError('Trace 不存在', 404)
    const byId = new Map(trace.spans.map(span => [span.spanId, span]))
    const attributable = trace.spans.filter(span => {
      let current = span, visited = new Set<string>()
      for (;;) {
        if (visited.has(current.spanId) || current.resourceId && current.resourceId !== resourceId) return false
        visited.add(current.spanId)
        if (!current.parentSpanId) return current === root
        const parent = byId.get(current.parentSpanId)
        if (!parent) return false
        current = parent
      }
    })
    return { traceId: trace.traceId, spans: attributable.slice(0, 1000).map(safeSpan), nativeSpanCount: trace.spans.length,
      omittedUnattributedSpans: trace.spans.length - attributable.length, truncated: attributable.length > 1000 }
  }
  async function listTraces(resourceId: string, query: { page?: number; perPage?: number } = {}) {
    await authorized(resourceId)
    const parsed = pageSchema.safeParse(query)
    if (!parsed.success) throw new DiagnosticsError('分页无效', 400)
    const result = await (await domain()).listTraces({ filters: { resourceId }, pagination: parsed.data, orderBy: { field: 'startedAt', direction: 'DESC' } })
    if (result.spans.some(span => span.resourceId !== resourceId)) throw new DiagnosticsError('原生 trace 范围校验失败', 503)
    const items: TraceSummary[] = result.spans.map(span => ({ traceId: span.traceId, name: String(redactPayload(span.name, secrets()).value), resourceId,
      threadId: span.threadId ?? null, runId: span.runId ?? null, startedAt: span.startedAt.toISOString(), endedAt: span.endedAt?.toISOString() ?? null, status: span.status }))
    return { items, ...parsed.data, total: result.pagination?.total ?? items.length, hasMore: result.pagination?.hasMore ?? false, collectionEnabled: enabled() }
  }
  async function readTrace(resourceId: string, traceId: string) { await authorized(resourceId); return traceFor(resourceId, traceId) }
  function coverage(traces: DiagnosticTrace[], omitted: number, casesOmitted: boolean): Coverage {
    const gaps = ['framework_trace_is_not_complete_audit']
    if (!enabled()) gaps.push('collection_currently_disabled')
    if (!traces.length) gaps.push('no_collected_trace')
    if (omitted) gaps.push('trace_selection_limited')
    if (casesOmitted) gaps.push('case_selection_limited')
    if (traces.some(trace => trace.truncated || trace.spans.some(span => span.truncated))) gaps.push('payload_truncated')
    if (traces.some(trace => trace.omittedUnattributedSpans)) gaps.push('unattributed_child_spans_omitted')
    if (traces.some(trace => trace.spans.some(span => span.redacted))) gaps.push('payload_redacted')
    if (traces.some(trace => trace.spans.some(span => !span.endedAt))) gaps.push('open_or_incomplete_span')
    return { level: 'framework-trace', completeAudit: false, collectionEnabledNow: enabled(), gaps, untracked: UNTRACKED, recordedInspectionOnly: true, recordedReplayAvailable: true, liveEvaluationAvailable: !!options.liveModel }
  }
  return {
    observability, listTraces, readTrace, isEnabled: enabled,
    flush: () => observability.flush(),
    async markBadCase(resourceId: string, input: MarkCaseInput) {
      await authorized(resourceId)
      const parsed = markCaseSchema.safeParse(input)
      if (!parsed.success || (parsed.data.spanId && !parsed.data.traceId)) throw new DiagnosticsError('问题标注无效', 400)
      if (parsed.data.traceId) {
        const trace = await traceFor(resourceId, parsed.data.traceId)
        if (parsed.data.spanId && !trace.spans.some(span => span.spanId === parsed.data.spanId)) throw new DiagnosticsError('Span 不存在或不在可读范围', 404)
      }
      const clean = redactPayload(parsed.data, secrets())
      const value = markCaseSchema.safeParse(clean.value)
      if (!value.success) throw new DiagnosticsError('问题标注无法安全保存', 400)
      return safeCase(cases.mark(resourceId, value.data, clean.redacted))
    },
    async updateBadCase(resourceId: string, id: string, input: UpdateCaseInput) {
      await authorized(resourceId)
      const parsed = updateCaseSchema.safeParse(input)
      if (!parsed.success) throw new DiagnosticsError('问题标注无效', 400)
      const clean = redactPayload(parsed.data, secrets()), value = updateCaseSchema.safeParse(clean.value)
      if (!value.success) throw new DiagnosticsError('问题标注无法安全保存', 400)
      return safeCase(cases.update(resourceId, id, value.data, clean.redacted))
    },
    async listBadCases(resourceId: string, query: { page?: number; perPage?: number } = {}) {
      await authorized(resourceId)
      const parsed = pageSchema.safeParse(query)
      if (!parsed.success) throw new DiagnosticsError('分页无效', 400)
      const result = cases.list(resourceId, parsed.data.page, parsed.data.perPage)
      return { ...result, items: result.items.map(safeCase) }
    },
    async getBadCase(resourceId: string, id: string) { await authorized(resourceId); return safeCase(cases.get(resourceId, id)) },
    async evaluate(resourceId: string, id: string, mode: EvaluationMode, requestSignal?: AbortSignal) {
      await authorized(resourceId)
      if (mode !== 'recorded' && mode !== 'live') throw new DiagnosticsError('评估模式无效', 400)
      const key = `${resourceId}/${id}`, item = safeCase(cases.get(resourceId, id))
      if (evaluations.has(key)) throw new DiagnosticsError('该问题正在评估', 409)
      const abort = new AbortController(), signal = AbortSignal.any([abort.signal, AbortSignal.timeout(60000), ...(requestSignal ? [requestSignal] : [])])
      const result = Promise.resolve().then(async () => {
        let trace: DiagnosticTrace | undefined
        if (item.traceId) {
          try { trace = await traceFor(resourceId, item.traceId) }
          catch (error) { if (!(error instanceof DiagnosticsError && error.status === 404)) throw error }
        }
        const evaluated = safeEvaluation(await runEvaluation({ mode, item, trace, liveModel: options.liveModel, signal }))
        cases.saveEvaluation(item, evaluated)
        return evaluated
      }).finally(() => { evaluations.delete(key) })
      evaluations.set(key, { abort, result })
      return result
    },
    async exportSession(resourceId: string, traceId?: string) {
      await authorized(resourceId); await observability.flush()
      const selected = await listTraces(resourceId, { perPage: 50 })
      const traces: DiagnosticTrace[] = []
      for (const id of traceId ? [traceId] : selected.items.map(item => item.traceId)) traces.push(await traceFor(resourceId, id))
      const notes = cases.list(resourceId, 0, 500), omitted = Math.max(0, selected.total - traces.length)
      const pack: DiagnosticPack = { schemaVersion: 1, engine: 'mastra', exportedAt: new Date().toISOString(), resourceId, traces, badCases: notes.items.map(safeCase),
        omittedTraces: omitted, coverage: coverage(traces, omitted, notes.hasMore) }
      return encodeDiagnosticPack(pack)
    },
    readRecorded: (content: string) => readRecorded(content, secrets()),
    async close() {
      if (closed) return
      closed = true
      for (const pending of evaluations.values()) pending.abort.abort(new Error('Diagnostics closed'))
      await Promise.allSettled([...evaluations.values()].map(pending => pending.result))
      cases.close()
    },
  }
}

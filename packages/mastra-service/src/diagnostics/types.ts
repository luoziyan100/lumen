/**
 * [INPUT]: zod 边界、原生 trace 字段与隔离评估结果合同
 * [OUTPUT]: 标注、最近评估、脱敏 trace、覆盖缺口与导出包 DTO
 * [POS]: 诊断语义合同；区分观察记录、用户评语和真正执行验证
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { z } from 'zod'
import type { EvaluationResult } from './evaluation/types.ts'
export type { EvaluationMode, EvaluationResult } from './evaluation/types.ts'

export const caseFields = z.object({
  kind: z.enum(['answer_quality', 'tool_failure', 'evidence_missing']),
  actual: z.string().trim().min(1).max(10000), expected: z.string().trim().min(1).max(10000), note: z.string().max(10000),
})
export const markCaseSchema = caseFields.extend({ kind: caseFields.shape.kind.default('answer_quality'), note: caseFields.shape.note.default(''), traceId: z.string().min(1).max(128).optional(), spanId: z.string().min(1).max(128).optional() })
export const updateCaseSchema = caseFields.partial()
export type MarkCaseInput = z.input<typeof markCaseSchema>
export type UpdateCaseInput = z.input<typeof updateCaseSchema>
export interface BadCase extends z.output<typeof caseFields> {
  id: string; resourceId: string; traceId: string | null; spanId: string | null; createdAt: string; updatedAt: string; redacted: boolean
  lastEvaluation?: EvaluationResult
}
export interface DiagnosticSpan {
  spanId: string; parentSpanId: string | null; type: string; name: string; resourceId: string | null; threadId: string | null; runId: string | null
  startedAt: string; endedAt: string | null; input: unknown; output: unknown; attributes: unknown; metadata: unknown; error: unknown
  redacted: boolean; truncated: boolean
}
export interface DiagnosticTrace { traceId: string; spans: DiagnosticSpan[]; nativeSpanCount: number; omittedUnattributedSpans: number; truncated: boolean }
export interface TraceSummary { traceId: string; name: string; resourceId: string; threadId: string | null; runId: string | null; startedAt: string; endedAt: string | null; status: string }
export interface Coverage {
  level: 'framework-trace'; completeAudit: false; collectionEnabledNow: boolean; gaps: string[]
  untracked: readonly string[]; recordedInspectionOnly: true; recordedReplayAvailable: boolean; liveEvaluationAvailable: boolean
}
export const UNTRACKED = [
  'raw_provider_http_request_response', 'exact_provider_request_after_sdk_transform', 'complete_network_and_filesystem_side_effects',
  'historical_file_versions', 'original_binary_payloads', 'bit_exact_replay', 'legacy_evidence_mapping', 'exporter_delivery_guarantee',
] as const
export interface DiagnosticPack {
  schemaVersion: 1; engine: 'mastra'; exportedAt: string; resourceId: string; coverage: Coverage
  traces: DiagnosticTrace[]; badCases: BadCase[]; omittedTraces: number
}
export interface DiagnosticExport { fileName: string; content: string; bytes: number; sha256: string }
export interface RecordedInspection {
  mode: 'recorded-inspection'; executionPerformed: false; checksumVerified: true; sourceAuthenticated: false
  redacted: boolean; truncated: boolean; record: unknown
}
export class DiagnosticsError extends Error {
  readonly status: 400 | 404 | 409 | 413 | 503
  constructor(message: string, status: 400 | 404 | 409 | 413 | 503) { super(message); this.status = status }
}

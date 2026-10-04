/**
 * [INPUT]: 本地诊断组合和公开 DTO
 * [OUTPUT]: createDiagnostics、DiagnosticsError、诊断数据类型
 * [POS]: 应用唯一诊断组合入口，执行与原始模型传输仍归 Mastra
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export { createDiagnostics } from './service.ts'
export { DiagnosticsError } from './types.ts'
export type { BadCase, MarkCaseInput, UpdateCaseInput, DiagnosticTrace, DiagnosticSpan, TraceSummary, DiagnosticPack, DiagnosticExport, RecordedInspection, Coverage, EvaluationMode, EvaluationResult } from './types.ts'

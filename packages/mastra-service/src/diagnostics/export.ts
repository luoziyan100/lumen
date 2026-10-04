/**
 * [INPUT]: 已脱敏的诊断包与用户显式选择的离线 JSON
 * [OUTPUT]: encodeDiagnosticPack/readRecorded：有界本地导出、完整性校验与记录回看
 * [POS]: 纯数据边界；不创建执行、调用模型/工具/网络，校验摘要不代表执行成功或来源认证
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { DiagnosticsError, type DiagnosticPack } from './types.ts'
import { redactPayload } from './redact.ts'

const MAX_PACK_BYTES = 8 * 1024 * 1024
const digest = (text: string) => createHash('sha256').update(text).digest('hex')
const recordSchema = z.object({
  schemaVersion: z.literal(1), engine: z.literal('mastra'), exportedAt: z.string(), resourceId: z.string(),
  coverage: z.object({ completeAudit: z.literal(false), recordedInspectionOnly: z.literal(true), recordedReplayAvailable: z.boolean().default(false), liveEvaluationAvailable: z.boolean(), gaps: z.array(z.string()), untracked: z.array(z.string()), collectionEnabledNow: z.boolean(), level: z.literal('framework-trace') }),
  traces: z.array(z.object({ traceId: z.string(), spans: z.array(z.record(z.string(), z.unknown())).max(1000), nativeSpanCount: z.number(), omittedUnattributedSpans: z.number().nonnegative().default(0), truncated: z.boolean() })).max(50),
  badCases: z.array(z.record(z.string(), z.unknown())).max(500), omittedTraces: z.number().nonnegative(),
})

export function encodeDiagnosticPack(pack: DiagnosticPack) {
  const payload = JSON.stringify(pack)
  if (Buffer.byteLength(payload) > MAX_PACK_BYTES - 256) throw new DiagnosticsError('诊断包超过 8 MiB，请缩小所选 trace 范围', 413)
  const content = JSON.stringify({ sha256: digest(payload), payload: pack }, null, 2)
  if (Buffer.byteLength(content) > MAX_PACK_BYTES) throw new DiagnosticsError('诊断包超过 8 MiB，请缩小所选 trace 范围', 413)
  return { fileName: `lumen-diagnostic-${Date.now()}.json`, content, bytes: Buffer.byteLength(content), sha256: digest(content) }
}

export function readRecorded(content: string, secrets: readonly string[] = []) {
  if (Buffer.byteLength(content) > MAX_PACK_BYTES) throw new DiagnosticsError('诊断包超过 8 MiB', 413)
  let parsed: unknown
  try { parsed = JSON.parse(content) } catch { throw new DiagnosticsError('无效诊断 JSON', 400) }
  const result = z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/), payload: recordSchema }).safeParse(parsed)
  if (!result.success) throw new DiagnosticsError('诊断包结构或版本无效', 400)
  const raw = parsed as { payload: unknown }
  if (digest(JSON.stringify(raw.payload)) !== result.data.sha256) throw new DiagnosticsError('诊断包完整性校验失败', 400)
  const safe = redactPayload(result.data.payload, secrets)
  return { mode: 'recorded-inspection' as const, executionPerformed: false as const, checksumVerified: true as const, sourceAuthenticated: false as const,
    redacted: safe.redacted, truncated: safe.truncated, record: safe.value }
}

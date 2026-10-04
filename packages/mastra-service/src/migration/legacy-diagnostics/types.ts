/**
 * [INPUT]: 旧 exec_records 已保存字段与哈希内容状态
 * [OUTPUT]: LegacyRecord / LegacyRecordPage / LegacyRecordDetail
 * [POS]: 只读历史浏览合同，不将旧证据混入原生 trace 或新运行状态
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export type LegacyIntegrity = 'verified' | 'missing' | 'hash_mismatch' | 'too_large' | 'not_collected' | 'unavailable'
export interface LegacyRecord {
  id: string; createdAt: string; kind: string; sourceTaskId: string
  agentId: string | null; turnId: string | null; operationId: string | null
  contentStatus: string; contentSha256: string | null; integrity: LegacyIntegrity
  meta: unknown; redacted: boolean; truncated: boolean
}
export interface LegacyRecordPage {
  source: 'legacy-v1'; readOnly: true; available: boolean; reason?: string
  items: LegacyRecord[]; page: number; perPage: number; total: number; hasMore: boolean
}
export interface LegacyRecordDetail { source: 'legacy-v1'; readOnly: true; record: LegacyRecord; content: unknown | null }

/**
 * [INPUT]: 已保存问题的预期文字与隔离 Agent 的实际结果
 * [OUTPUT]: EvaluationResult / EvaluationMode；执行与文本匹配独立表达
 * [POS]: 诊断 HTTP、标注存储、导出和 UI 共用的评估合同
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export type EvaluationMode = 'recorded' | 'live'
export interface EvaluationResult {
  mode: EvaluationMode
  execution: 'completed' | 'failed' | 'unavailable'
  executionPerformed: boolean
  judgment: 'matched' | 'mismatched' | 'not_evaluated'
  comparison: 'expected-text-inclusion'
  reply: string
  gaps: string[]
  detail: string
  startedAt: string
  finishedAt: string
  model?: string
}
export class EvidenceUnavailable extends Error {
  readonly gaps: string[]
  constructor(gap: string) { super(gap); this.gaps = [gap] }
}

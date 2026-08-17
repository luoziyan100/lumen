/**
 * [INPUT]: ProcStep[]
 * [OUTPUT]: 长工具轨迹窗口化(默认只露最近 N 步)
 * [POS]: ProcessRow;子代理一轮可堆几十步,不得整表铺开
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { ProcStep } from '../useAgent'

export const PROCESS_RECENT_KEEP = 6

export function partitionProcessSteps(
  steps: ProcStep[],
  showAll: boolean,
  keep = PROCESS_RECENT_KEEP,
): { hidden: number; visible: ProcStep[] } {
  if (showAll || steps.length <= keep) return { hidden: 0, visible: steps }
  return { hidden: steps.length - keep, visible: steps.slice(-keep) }
}

export function stepChip(step: ProcStep): string | undefined {
  if (!step.path) return undefined
  const parts = step.path.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] || step.path
}

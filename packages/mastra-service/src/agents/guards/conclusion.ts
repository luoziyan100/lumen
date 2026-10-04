/**
 * [INPUT]: 受信委派钩子保存的步骤上限、原生输入步骤编号
 * [OUTPUT]: specialistConclusion：最后一步禁用工具，给专家保留证据总结机会
 * [POS]: 专家输入链的收尾策略；沿用原生循环和原有总步数，不额外启动模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { InputProcessor } from '@mastra/core/processors'

export const SPECIALIST_MAX_STEPS = 'lumen.specialist-max-steps'

export const specialistConclusion: InputProcessor = {
  id: 'lumen-specialist-conclusion',
  processInputStep({ requestContext, stepNumber }) {
    const maxSteps = requestContext?.get<typeof SPECIALIST_MAX_STEPS, number>(SPECIALIST_MAX_STEPS)
    if (maxSteps !== undefined && stepNumber >= maxSteps - 1) return { toolChoice: 'none' }
  },
}

/**
 * [INPUT]: 原生 processOutputStep 的正文、工具调用、终止原因与重试次数
 * [OUTPUT]: createEmptyActionProcessor，一次反馈纠正后明确终止空行动
 * [POS]: 输出行为守卫；由 Mastra 续原循环，不自动重放工具或另开对话
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { OutputProcessor } from '@mastra/core/processors'

export function createEmptyActionProcessor(): OutputProcessor {
  return { id: 'lumen-empty-action', processOutputStep(args) {
    if (!['stop', 'end-turn'].includes(args.finishReason ?? '') || args.text?.trim() || args.toolCalls?.length) return args.messageList
    const retry = args.retryCount < 1
    const message = retry
      ? '上一轮没有可见正文，也没有工具调用。请给出对用户可见的答复，或调用必要工具；不要只在思考通道结束。'
      : '模型连续两轮没有可见正文或工具调用，研究已停止。请重试或切换模型。'
    if (!retry) throw new Error(message)
    return args.abort(message, { retry: true, metadata: { code: 'empty_action' } })
  } }
}

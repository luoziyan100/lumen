/**
 * [INPUT]: 原生 processOutputStream 收到的终止错误分片；Mastra 1.85 为「输出额度耗尽且没有正文或工具调用」合成 AGENT_STREAM_ERROR（details.finishReason=length）
 * [OUTPUT]: createOutputLimitProcessor：把该框架英文错误换成中文产品错误，带错误码 run.output_limit；OUTPUT_LIMIT_MESSAGE
 * [POS]: 输出终态翻译（台账 A1 的一员）；不判断空行动、不请求重试、不发模型请求。empty-action.ts 只管 stop/end-turn 的空行动，length 的空输出由框架报错、本处只换文案，两者不会作用于同一步。
 *        错误码经错误对象的 code 字段进入 SSE 错误身份的 codes，界面据此取本地化文案；截断后仍有正文的 length 由 Controller 另报，不经过这里
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { MastraError } from '@mastra/core/error'
import type { OutputProcessor } from '@mastra/core/processors'
import type { ErrorCode } from '../../http/error-codes.ts'

export const OUTPUT_LIMIT_MESSAGE = '模型这一步用完了输出额度，还没写出正文或调用工具，研究已停止。请调大模型的最大输出 token，或换一个模型后重试。'
const CODE: ErrorCode = 'run.output_limit'

export function createOutputLimitProcessor(): OutputProcessor {
  return { id: 'lumen-output-limit', async processOutputStream({ part }) {
    if (part.type !== 'error') return part
    const error = part.payload.error
    if (!(error instanceof MastraError) || error.id !== 'AGENT_STREAM_ERROR' || error.details?.finishReason !== 'length') return part
    return { ...part, payload: { ...part.payload, error: Object.assign(new Error(OUTPUT_LIMIT_MESSAGE), { code: CODE }) } }
  } }
}

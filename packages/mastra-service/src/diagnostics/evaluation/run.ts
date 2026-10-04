/**
 * [INPUT]: 受信问题标注、脱敏 trace、宿主当前模型 getter 与取消信号
 * [OUTPUT]: runEvaluation；执行结果与简单预期文本比较分开返回
 * [POS]: 诊断只创建临时原生 Agent；不接 Memory、Controller、Workspace 或生产工具
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { Agent } from '@mastra/core/agent'
import { randomUUID } from 'node:crypto'
import type { BadCase, DiagnosticTrace } from '../types.ts'
import { createModelGateway, type ModelSettings } from '../../model.ts'
import { evaluationPrompt, recordedEvidence } from './evidence.ts'
import { recordedAgentParts } from './recorded.ts'
import { EvidenceUnavailable, type EvaluationMode, type EvaluationResult } from './types.ts'

export type LiveModel = () => ModelSettings | null | Promise<ModelSettings | null>

export async function runEvaluation(input: { mode: EvaluationMode; item: BadCase; trace?: DiagnosticTrace; liveModel?: LiveModel; signal: AbortSignal }): Promise<EvaluationResult> {
  const startedAt = new Date().toISOString()
  const base = { mode: input.mode, comparison: 'expected-text-inclusion' as const, startedAt }
  let performed = false, model: string | undefined
  try {
    if (!input.trace) throw new EvidenceUnavailable('missing_source_trace')
    const prompt = evaluationPrompt(input.trace)
    const recorded = input.mode === 'recorded' ? recordedAgentParts(recordedEvidence(input.trace)) : undefined
    const settings = input.mode === 'live' ? await input.liveModel?.() : undefined
    if (input.mode === 'live' && (!settings?.apiKey || !settings.model)) throw new EvidenceUnavailable('live_model_not_configured')
    const languageModel = recorded?.model ?? await createModelGateway({ ...settings! }).resolveLanguageModel({ modelId: settings!.model, providerId: 'configured', apiKey: settings!.apiKey })
    model = recorded ? 'lumen-recorded/trace-recording' : `${settings!.provider ?? 'openai'}/${settings!.model}`
    const agent = new Agent({ id: `diagnostic-${randomUUID()}`, name: 'Isolated diagnostic evaluation', model: languageModel,
      instructions: 'Respond to the captured user request. This is an isolated diagnostic evaluation. No production tools, files, memory or subagents are available.',
      tools: recorded?.tools ?? {}, defaultOptions: { maxSteps: recorded ? 33 : 1 } })
    input.signal.throwIfAborted(); performed = true
    const response = await agent.generate(prompt, { abortSignal: input.signal, maxSteps: recorded ? 33 : 1, modelSettings: { maxRetries: 0, maxOutputTokens: 4096 } })
    input.signal.throwIfAborted(); recorded?.verify()
    const reply = response.text
    if (!reply.trim()) throw new Error('evaluation_empty_response')
    const expected = input.item.expected.trim()
    return { ...base, execution: 'completed', executionPerformed: true, judgment: expected && reply.includes(expected) ? 'matched' : 'mismatched', reply, gaps: [],
      detail: '仅比较预期文本是否出现在输出中；录制失败/取消按错误事实回灌；回放完成不表示原工具成功，文本匹配也不代表语义质量已通过。', finishedAt: new Date().toISOString(), model }
  } catch (error) {
    return { ...base, execution: error instanceof EvidenceUnavailable ? 'unavailable' : 'failed', executionPerformed: performed, judgment: 'not_evaluated', reply: '',
      gaps: error instanceof EvidenceUnavailable ? error.gaps : [], detail: input.signal.aborted ? 'evaluation_cancelled_or_timed_out' : error instanceof Error ? error.message : 'evaluation_failed',
      finishedAt: new Date().toISOString(), ...(model ? { model } : {}) }
  }
}

/**
 * [INPUT]: service 已授权、脱敏且限定父会话的 DiagnosticTrace
 * [OUTPUT]: evaluationPrompt / recordedEvidence，将原生观察与审批恢复证据转换为含真实错误语义的有限回放输入
 * [POS]: 仅解码框架记录，不从当前工作区推测旧文件、不按工具名称猜配结果
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { z } from 'zod'
import { isDeepStrictEqual } from 'node:util'
import type { DiagnosticSpan, DiagnosticTrace } from '../types.ts'
import { EvidenceUnavailable } from './types.ts'

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const toolCall = z.object({ toolCallId: z.string().min(1), toolName: z.string().min(1), args: z.record(z.string(), z.unknown()) })
const stepOutput = z.object({ text: z.string(), toolCalls: z.array(toolCall) })
const altered = (value: unknown) => /\[(?:REDACTED|OMITTED)\]/.test(JSON.stringify(value) ?? '')
function outputTruncated(span: DiagnosticSpan) {
  const flag = object(object(span.metadata).lumenDiagnostics).outputTruncated
  return typeof flag === 'boolean' ? flag : span.truncated
}
export type RecordedStep = z.infer<typeof stepOutput>
export type RecordedResult = { kind: 'output'; value: unknown } | { kind: 'error'; message: string; name: string }
export interface RecordedTool { id: string; name: string; args: Record<string, unknown>; result: RecordedResult }
export interface RecordedEvidence { prompt: string; steps: RecordedStep[]; tools: RecordedTool[] }

function textual(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) throw new EvidenceUnavailable('unsupported_source_prompt')
  return content.map(part => {
    const item = object(part)
    if (item.type !== 'text' || typeof item.text !== 'string') throw new EvidenceUnavailable('non_text_source_prompt')
    return item.text
  }).join('\n')
}

export function evaluationPrompt(trace: DiagnosticTrace): string {
  const generations = trace.spans.filter(span => span.type === 'model_generation').sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  for (const span of generations) {
    const messages = object(span.input).messages
    if (!Array.isArray(messages)) continue
    // --- 整个跨度的工具定义可能被裁剪；只判断实际输入，不误判完整用户文字 ---
    if (object(object(span.metadata).lumenDiagnostics).inputTruncated === true || messages.length >= 200) throw new EvidenceUnavailable('source_prompt_truncated')
    const user = [...messages].reverse().map(object).find(message => message.role === 'user')
    if (!user) continue
    if (Array.isArray(user.content) && user.content.length >= 200) throw new EvidenceUnavailable('source_prompt_truncated')
    if (altered(user.content)) throw new EvidenceUnavailable('source_prompt_redacted')
    const prompt = textual(user.content).trim()
    if (prompt && prompt.length <= 32000) return prompt
  }
  throw new EvidenceUnavailable('missing_source_prompt')
}

// --- 审批暂停时原生 model_step 未结束；仅凭同一推理下完整 chunk 与明确恢复关系还原 ---
function recordedStep(span: DiagnosticSpan, trace: DiagnosticTrace): RecordedStep {
  if (span.output != null) {
    if (!span.endedAt || span.error || outputTruncated(span) || altered(span.output)) throw new EvidenceUnavailable('model_step_incomplete')
    const parsed = stepOutput.safeParse(span.output)
    if (!parsed.success) throw new EvidenceUnavailable('model_step_output_unavailable')
    return parsed.data
  }
  const parent = trace.spans.find(item => item.spanId === span.parentSpanId)
  if (span.error || span.truncated || parent?.type !== 'model_generation' || object(parent.attributes).finishReason !== 'suspended'
    || !trace.spans.some(item => object(item.metadata).resumedFromSpanId === parent.spanId)) throw new EvidenceUnavailable('model_step_incomplete')
  const inferences = new Set(trace.spans.filter(item => item.type === 'model_inference' && item.parentSpanId === span.spanId).map(item => item.spanId))
  const chunks = trace.spans.filter(item => item.type === 'model_chunk' && inferences.has(item.parentSpanId ?? '')
    && ['tool-call', 'text'].includes(String(object(item.attributes).chunkType))).sort((a, b) => Number(object(a.attributes).sequenceNumber) - Number(object(b.attributes).sequenceNumber))
  const step: RecordedStep = { text: '', toolCalls: [] }
  for (const chunk of chunks) {
    if (!chunk.endedAt || chunk.error || outputTruncated(chunk) || altered(chunk.output)) throw new EvidenceUnavailable('model_step_incomplete')
    const output = object(chunk.output)
    if (object(chunk.attributes).chunkType === 'text') {
      if (typeof output.text !== 'string') throw new EvidenceUnavailable('model_step_output_unavailable')
      step.text += output.text
    } else {
      const call = toolCall.safeParse({ ...output, args: output.toolInput })
      if (!call.success) throw new EvidenceUnavailable('model_step_output_unavailable')
      step.toolCalls.push(call.data)
    }
  }
  if (!step.toolCalls.length) throw new EvidenceUnavailable('model_step_output_unavailable')
  return step
}

function recordedResult(span: DiagnosticSpan): RecordedResult {
  const success = object(span.attributes).success
  if (!span.endedAt || outputTruncated(span) || altered(span.output) || altered(span.error)) throw new EvidenceUnavailable('tool_result_incomplete')
  if (success === true && !span.error && span.output != null) return { kind: 'output', value: span.output }
  // --- 原生抛错与校验失败都必须进入错误通道，不能把错误对象当成功工具值 ---
  if (success !== false || span.truncated) throw new EvidenceUnavailable('tool_result_incomplete')
  const error = object(span.error), output = object(span.output)
  const detail = span.error ? error : output.error === true ? output : null
  if (!detail || typeof detail.message !== 'string' || !detail.message.trim()) throw new EvidenceUnavailable('tool_result_incomplete')
  return { kind: 'error', message: detail.message, name: typeof detail.name === 'string' ? detail.name : 'Error' }
}

export function recordedEvidence(trace: DiagnosticTrace): RecordedEvidence {
  if (trace.truncated || trace.omittedUnattributedSpans) throw new EvidenceUnavailable('trace_incomplete_or_child_scope_omitted')
  const sourceSteps = trace.spans.filter(span => span.type === 'model_step').sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  const steps: RecordedStep[] = [], tools: RecordedTool[] = [], seen = new Set<string>()
  for (const span of sourceSteps) {
    const step = recordedStep(span, trace)
    if (span.output == null && sourceSteps.some(restored => object(restored.metadata).resumedFromSpanId === span.parentSpanId
      && isDeepStrictEqual(stepOutput.safeParse(restored.output).data, step))) continue
    steps.push(step)
    for (const call of step.toolCalls) {
      if (seen.has(call.toolCallId)) throw new EvidenceUnavailable('duplicate_tool_call_identity')
      seen.add(call.toolCallId)
      const matches = trace.spans.filter(item => item.type === 'tool_call' && object(item.attributes).toolCallId === call.toolCallId)
      if (matches.length !== 1) throw new EvidenceUnavailable('missing_or_ambiguous_tool_result')
      const result = matches[0]!
      const outcome = recordedResult(result)
      const args = z.record(z.string(), z.unknown()).safeParse(result.input)
      if (object(object(result.metadata).lumenDiagnostics).inputTruncated === true || altered(result.input) || !args.success || !isDeepStrictEqual(args.data, call.args) || result.name !== `tool: '${call.toolName}'`) throw new EvidenceUnavailable('tool_result_identity_mismatch')
      tools.push({ id: call.toolCallId, name: call.toolName, args: call.args, result: outcome })
    }
  }
  if (!steps.length || steps.length > 32 || steps.at(-1)!.toolCalls.length) throw new EvidenceUnavailable('missing_terminal_model_step')
  return { prompt: evaluationPrompt(trace), steps, tools }
}

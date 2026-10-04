/**
 * [INPUT]: 已校验的原生模型步骤、toolCallId 与成功/错误结果事实
 * [OUTPUT]: recordedAgentParts；V2 内存模型与只读录制工具桩
 * [POS]: 由真正 Mastra Agent 调度的隔离替身，无网络/文件/子 Agent 入口
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { MastraModelConfig } from '@mastra/core/llm'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { isDeepStrictEqual } from 'node:util'
import type { RecordedEvidence } from './evidence.ts'

type NativeV2 = Extract<MastraModelConfig, { specificationVersion: 'v2' }>
type CallOptions = Parameters<NativeV2['doStream']>[0]

export function recordedAgentParts(evidence: RecordedEvidence) {
  let cursor = 0
  const used = new Set<string>(), errors: string[] = []
  function next(options: CallOptions) {
    options.abortSignal?.throwIfAborted()
    const step = evidence.steps[cursor++]
    if (!step) throw new Error('recorded_model_exhausted')
    return step
  }
  const model = {
    specificationVersion: 'v2' as const, provider: 'lumen-recorded', modelId: 'trace-recording', supportedUrls: {},
    async doGenerate(options: CallOptions) {
      const step = next(options)
      return { content: [ ...(step.text ? [{ type: 'text' as const, text: step.text }] : []),
        ...step.toolCalls.map(call => ({ type: 'tool-call' as const, toolCallId: call.toolCallId, toolName: call.toolName, input: JSON.stringify(call.args) })) ],
      finishReason: step.toolCalls.length ? 'tool-calls' as const : 'stop' as const, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, warnings: [] }
    },
    async doStream(options: CallOptions) {
      const step = next(options)
      return { stream: new ReadableStream({ start(controller) {
        controller.enqueue({ type: 'stream-start', warnings: [] })
        if (step.text) {
          controller.enqueue({ type: 'text-start', id: 'text' }); controller.enqueue({ type: 'text-delta', id: 'text', delta: step.text }); controller.enqueue({ type: 'text-end', id: 'text' })
        }
        for (const call of step.toolCalls) controller.enqueue({ type: 'tool-call', toolCallId: call.toolCallId, toolName: call.toolName, input: JSON.stringify(call.args) })
        controller.enqueue({ type: 'finish', finishReason: step.toolCalls.length ? 'tool-calls' : 'stop', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } })
        controller.close()
      } }) }
    },
  } satisfies MastraModelConfig
  const tools = Object.fromEntries([...new Set(evidence.tools.map(item => item.name))].map(name => [name, createTool({
    id: name, description: 'Return only the captured result for this exact recorded call.', inputSchema: z.record(z.string(), z.unknown()),
    execute: async (args, context) => {
      const id = context?.agent?.toolCallId, item = evidence.tools.find(result => result.id === id && result.name === name)
      if (!item || used.has(item.id) || !isDeepStrictEqual(item.args, args)) {
        errors.push('recorded_tool_identity_or_arguments_mismatch'); throw new Error(errors.at(-1))
      }
      used.add(item.id)
      if (item.result.kind === 'error') {
        const error = new Error(item.result.message); error.name = item.result.name
        throw error
      }
      return structuredClone(item.result.value)
    },
  })]))
  return { model, tools, verify() {
    if (errors.length || cursor !== evidence.steps.length || used.size !== evidence.tools.length) throw new Error(errors[0] ?? 'recorded_sequence_incomplete')
  } }
}

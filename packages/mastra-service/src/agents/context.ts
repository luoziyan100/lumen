/**
 * [INPUT]: 当前模型上下文/视觉配置与已有原生图像请求处理器
 * [OUTPUT]: createInputProcessors / modelTools：输入裁剪策略与视觉工具可见性
 * [POS]: 只使用 Mastra TokenLimiter 裁剪当次输入；不截断输出，不维护第二套记忆或摘要
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { TokenLimiterProcessor, type InputProcessor } from '@mastra/core/processors'
import { TripWire, type ToolsInput } from '@mastra/core/agent'
import type { ModelSettings } from '../model.ts'

export type ContextSettings = Pick<ModelSettings, 'contextWindow' | 'vision'>

class ControllerTokenLimiter extends TokenLimiterProcessor {
  override async processInputStep(args: Parameters<TokenLimiterProcessor['processInputStep']>[0]) {
    try { return await super.processInputStep(args) }
    catch (error) {
      if (error instanceof TripWire && error.options.retry !== true) {
        throw new Error('当前系统指令或最近一条消息超过模型可用上下文；请缩短输入或增大模型窗口后重新发送。已保存的历史保持不变。', { cause: error })
      }
      throw error
    }
  }
}

export function createInputProcessors(settings?: ContextSettings, imageProcessor?: InputProcessor): InputProcessor[] {
  const configured = settings?.contextWindow
  const window = typeof configured === 'number' && Number.isFinite(configured) && configured > 0 ? configured : 128_000
  const processors: InputProcessor[] = [new ControllerTokenLimiter({ limit: Math.max(1, Math.floor(window * 0.8)), trimMode: 'contiguous' })]
  if (settings?.vision !== 'off' && imageProcessor) processors.push(imageProcessor)
  return processors
}

export function modelTools(settings: ContextSettings | undefined, tools: ToolsInput): ToolsInput {
  if (settings?.vision !== 'off') return tools
  return Object.fromEntries(Object.entries(tools).filter(([name]) => name !== 'look_at_image'))
}

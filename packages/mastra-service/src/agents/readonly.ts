/**
 * [INPUT]: 研究与摄取原生工具（fetch_url/extract_pdf/extract_docx 等）
 * [OUTPUT]: readOnlyTools：去掉 save_as 与 to_library 参数及其说明的只读变体
 * [POS]: 只读专家看到的 schema 只暴露实际能力（不写工作区，也不往资料库收东西），不靠委派提示词补丁；执行复用原工具，不复制领域逻辑
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { ToolsInput } from '@mastra/core/agent'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

interface SchemaTool {
  id: string
  description: string
  inputSchema?: unknown
  execute?: (input: unknown, context: never) => Promise<unknown>
}

const WRITE_KEYS = ['save_as', 'to_library'] as const
const writeClause = /(save_as|to_library)[^，；。]*[，；。]/g

function withoutWrites(tool: ToolsInput[string]): ToolsInput[string] {
  const source = tool as unknown as SchemaTool
  const schema = source.inputSchema
  if (!(schema instanceof z.ZodObject) || !WRITE_KEYS.some(key => key in schema.shape) || !source.execute) return tool
  const execute = source.execute.bind(source)
  return createTool({
    id: source.id,
    description: source.description.replace(writeClause, '').replace(/[，；]$/, '。'),
    inputSchema: schema.omit(Object.fromEntries(WRITE_KEYS.filter(key => key in schema.shape).map(key => [key, true])) as { save_as: true }),
    execute: (input, context) => execute(input, context as never),
  }) as ToolsInput[string]
}

export function readOnlyTools(tools: ToolsInput): ToolsInput {
  return Object.fromEntries(Object.entries(tools).map(([name, tool]) => [name, withoutWrites(tool)]))
}

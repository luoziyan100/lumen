/**
 * [INPUT]: Mastra createTool、Zod 与调用方解析的当前任务执行环境
 * [OUTPUT]: createExecutionTools：run_code 沙箱自动执行、取消和失败反馈
 * [POS]: 主研究与可执行专家共用；权限来自受信工作区与 Seatbelt，reader 无执行工具
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createTool, type ToolExecutionContext } from '@mastra/core/tools'
import { z } from 'zod'
import { runCode, type ExecutionEnvironment } from './process.ts'

export type ExecutionEnvironmentResolver = (context: ToolExecutionContext | undefined) => ExecutionEnvironment | Promise<ExecutionEnvironment>

export function createExecutionTools(resolveEnvironment: ExecutionEnvironmentResolver) {
  return { run_code: createTool({
    id: 'run_code',
    description: '在当前任务沙箱自动执行 Node.js 或 Python 代码，无需逐次确认。可只读访问当前项目已安装的技能脚本和资源；产物使用相对路径写入当前任务。默认断网，network=true 仍受服务配置的域名白名单约束。执行最长120秒，返回有限输出与日志路径。',
    inputSchema: z.object({ language: z.enum(['node', 'python']), code: z.string().min(1).max(200_000), timeoutSeconds: z.number().int().min(1).max(120).default(60), network: z.boolean().default(false) }),
    execute: async (input, context) => {
      const result = await runCode(await resolveEnvironment(context), input, context?.abortSignal)
      if (result.cancelled || result.timedOut || result.exitCode !== 0) {
        const reason = result.cancelled ? '执行已取消' : result.timedOut ? '执行超时' : `执行失败，退出码 ${result.exitCode}，信号 ${result.signal ?? '无'}`
        throw new Error(`${reason}\n${result.stdout}\n${result.stderr}\n${result.networkDenials.join('\n')}\n日志：${result.runPath}/stdout.log、stderr.log${result.truncated ? '（输出已截断）' : ''}`)
      }
      return result
    },
  }) }
}

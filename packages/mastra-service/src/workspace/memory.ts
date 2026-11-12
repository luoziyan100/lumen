/**
 * [INPUT]: 原生工具上下文中按受信主题解析的两层 memory 挂载（topic / you）
 * [OUTPUT]: createMemoryTools/readMemoryIndex/MEMORY_INDEX_LIMIT：跨会话事实读写与提示词索引
 * [POS]: 事实是文件；「这个主题」与「关于用户」分开存，模型用 scope 选择。Unicode 文件名在本地验证，不把需正则标志的规则发送给模型；会话历史仍归 Mastra Memory
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createTool, type ToolExecutionContext } from '@mastra/core/tools'
import type { WorkspaceFilesystem } from '@mastra/core/workspace'
import { z } from 'zod'
import type { MemoryScope } from './workspace.ts'

/** 两层索引各自的上限：注入提示词时不让一边挤掉另一边。 */
export const MEMORY_INDEX_LIMIT = { chars: 12000, lines: 100 }

const name = z.string().describe('单个文件名，1–120 个字符，仅含文字、数字、下划线、点或短横线；不能含路径分隔符或连续两个点。索引为 MEMORY.md。')
  .refine(value => /^[\p{L}\p{N}_][\p{L}\p{N}_.-]{0,119}$/u.test(value) && !value.includes('..'), '记忆名称必须是合法的单个文件名')
const scope = z.enum(['topic', 'you']).describe('topic：只关于当前主题的事实；you：关于用户本人、跨主题都成立的偏好与约定')

export function createMemoryTools(resolve: (context: ToolExecutionContext | undefined, scope: MemoryScope) => Promise<WorkspaceFilesystem>) {
  return {
    read_memory: createTool({ id: 'read_memory', description: '读取跨会话事实记忆，索引是 MEMORY.md。scope=topic 读当前主题的，scope=you 读关于用户本人的。需要时再读具体文件。',
      inputSchema: z.object({ name, scope }), execute: async ({ name, scope }, context) => {
        const content = await (await resolve(context, scope)).readFile(name, { encoding: 'utf8' })
        return { scope, name, content: String(content).slice(0, 30000), truncated: String(content).length > 30000 }
      },
    }),
    write_memory: createTool({ id: 'write_memory', description: '记录长期成立的事实，一条事实一个文件，不存对话转录。用户的偏好、纠正和约定写 scope=you；只对当前主题成立的结论或约定写 scope=topic。写完同步维护同一 scope 的 MEMORY.md 索引。',
      inputSchema: z.object({ name, scope, content: z.string().max(64000) }), execute: async ({ name, scope, content }, context) => {
        await (await resolve(context, scope)).writeFile(name, content)
        return { scope, savedAs: `${scope === 'you' ? 'memory' : 'topic memory'}/${name}`, characters: content.length }
      },
    }),
  }
}

export async function readMemoryIndex(filesystem?: WorkspaceFilesystem): Promise<string> {
  if (!filesystem || !await filesystem.exists('MEMORY.md')) return ''
  const content = await filesystem.readFile('MEMORY.md', { encoding: 'utf8' })
  return String(content).slice(0, MEMORY_INDEX_LIMIT.chars).split('\n').slice(0, MEMORY_INDEX_LIMIT.lines).join('\n')
}

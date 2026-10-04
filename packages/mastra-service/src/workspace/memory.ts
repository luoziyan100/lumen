/**
 * [INPUT]: 原生工具上下文中的受限项目 memory 挂载
 * [OUTPUT]: createMemoryTools/readMemoryIndex：跨会话事实读写与提示词索引
 * [POS]: 事实是项目文件；Unicode 文件名在本地验证，不把需正则标志的规则发送给模型；会话历史仍归 Mastra Memory
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createTool, type ToolExecutionContext } from '@mastra/core/tools'
import type { WorkspaceFilesystem } from '@mastra/core/workspace'
import { z } from 'zod'

const name = z.string().describe('单个文件名，1–120 个字符，仅含文字、数字、下划线、点或短横线；不能含路径分隔符或连续两个点。索引为 MEMORY.md。')
  .refine(value => /^[\p{L}\p{N}_][\p{L}\p{N}_.-]{0,119}$/u.test(value) && !value.includes('..'), '记忆名称必须是合法的单个文件名')
export function createMemoryTools(resolve: (context?: ToolExecutionContext) => Promise<WorkspaceFilesystem>) {
  return {
    read_memory: createTool({ id: 'read_memory', description: '读取项目的跨会话事实记忆，索引是 MEMORY.md。需要时再读具体文件。',
      inputSchema: z.object({ name }), execute: async ({ name }, context) => {
        const content = await (await resolve(context)).readFile(name, { encoding: 'utf8' })
        return { name, content: String(content).slice(0, 30000), truncated: String(content).length > 30000 }
      },
    }),
    write_memory: createTool({ id: 'write_memory', description: '记录用户长期偏好、纠正或项目约定，一条事实一个文件。不要存对话转录。写完同步维护 MEMORY.md 索引；用户可以在 memory/ 阅读这些文件。',
      inputSchema: z.object({ name, content: z.string().max(64000) }), execute: async ({ name, content }, context) => {
        await (await resolve(context)).writeFile(name, content)
        return { savedAs: `memory/${name}`, characters: content.length }
      },
    }),
  }
}

export async function readMemoryIndex(filesystem?: WorkspaceFilesystem): Promise<string> {
  if (!filesystem || !await filesystem.exists('MEMORY.md')) return ''
  const content = await filesystem.readFile('MEMORY.md', { encoding: 'utf8' })
  return String(content).slice(0, 25000).split('\n').slice(0, 200).join('\n')
}

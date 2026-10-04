/**
 * [INPUT]: 按当前项目解析的只读资料文件系统
 * [OUTPUT]: createSharedTools：列举和有界读取跨会话资料
 * [POS]: 共享资料通过显式工具进入任务，模型没有写入项目原料的权限
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createTool, type ToolExecutionContext } from '@mastra/core/tools'
import type { WorkspaceFilesystem } from '@mastra/core/workspace'
import { z } from 'zod'

const scopeSchema = z.enum(['shared', 'source']).default('shared')
export function createSharedTools(resolve: (context: ToolExecutionContext | undefined, scope: 'shared' | 'source') => Promise<WorkspaceFilesystem>) {
  return {
    list_project_files: createTool({ id: 'list_project_files', description: '列举当前项目的共享资料，供所有研究会话使用。',
      inputSchema: z.object({ path: z.string().default('.'), scope: scopeSchema }), execute: async ({ path, scope }, context) => ({ scope, entries: await (await resolve(context, scope)).readdir(path) }),
    }),
    read_project_file: createTool({ id: 'read_project_file', description: '分段读取项目共享的文本资料；二进制原件应复制到任务后用对应解析工具读取。',
      inputSchema: z.object({ path: z.string().min(1), scope: scopeSchema, offset: z.number().int().min(0).default(0), limit: z.number().int().positive().max(30000).default(20000) }),
      execute: async ({ path, scope, offset, limit }, context) => {
        const filesystem = await resolve(context, scope)
        const stat = await filesystem.stat(path)
        if (stat.size > 25 * 1024 * 1024) throw new Error('Project file exceeds 25 MB')
        const content = String(await filesystem.readFile(path, { encoding: 'utf8' }))
        return { source: `${scope}/${path}`, content: content.slice(offset, offset + limit), totalChars: content.length, offset, truncated: offset + limit < content.length }
      },
    }),
    copy_project_file: createTool({ id: 'copy_project_file', description: '把只读项目资料复制到当前任务，用于 PDF、DOCX 或图片解析；不修改原件。',
      inputSchema: z.object({ source: z.string().min(1), destination: z.string().min(1), scope: scopeSchema }),
      execute: async ({ source, destination, scope }, context) => {
        const filesystem = await resolve(context, scope)
        if ((await filesystem.stat(source)).size > 25 * 1024 * 1024) throw new Error('Project file exceeds 25 MB')
        if (!context?.workspace?.filesystem) throw new Error('Task workspace is required')
        await context.workspace.filesystem.writeFile(destination, await filesystem.readFile(source), { overwrite: false })
        return { source: `${scope}/${source}`, savedAs: destination }
      },
    }),
  }
}

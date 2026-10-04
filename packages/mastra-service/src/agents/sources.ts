/**
 * [INPUT]: 委派上下文对应的父任务只读文件系统
 * [OUTPUT]: createTaskSourceTools：可写专家读取/复制主任务材料，但只能写自身 Workspace
 * [POS]: 跨专家协作的显式材料边界，避免把父目录挂成子专家可写根
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createTool, type ToolExecutionContext } from '@mastra/core/tools'
import type { LocalFilesystem } from '@mastra/core/workspace'
import { z } from 'zod'

export function createTaskSourceTools(resolve: (context: ToolExecutionContext | undefined) => Promise<LocalFilesystem>) {
  return {
    list_task_files: createTool({ id: 'list_task_files', description: '只读列举主任务材料和其他专家产物；自身读写工具以独立工作目录为根。',
      inputSchema: z.object({ path: z.string().default('.') }),
      execute: async ({ path }, context) => ({ entries: await (await resolve(context)).readdir(path) }),
    }),
    read_task_file: createTool({ id: 'read_task_file', description: '分段只读主任务的文本文件。二进制材料用 copy_task_file 复制后在自身目录解析。',
      inputSchema: z.object({ path: z.string().min(1), offset: z.number().int().min(0).default(0), limit: z.number().int().positive().max(30000).default(20000) }),
      execute: async ({ path, offset, limit }, context) => {
        const filesystem = await resolve(context)
        if ((await filesystem.stat(path)).size > 25 * 1024 * 1024) throw new Error('Task source file exceeds 25 MB')
        const content = String(await filesystem.readFile(path, { encoding: 'utf8' }))
        return { source: path, content: content.slice(offset, offset + limit), totalChars: content.length, offset, truncated: offset + limit < content.length }
      },
    }),
    copy_task_file: createTool({ id: 'copy_task_file', description: '把主任务材料复制到本专家独立目录用于解析，不修改原件。',
      inputSchema: z.object({ source: z.string().min(1), destination: z.string().min(1) }),
      execute: async ({ source, destination }, context) => {
        const filesystem = await resolve(context)
        if ((await filesystem.stat(source)).size > 25 * 1024 * 1024) throw new Error('Task source file exceeds 25 MB')
        if (!context?.workspace?.filesystem) throw new Error('Specialist workspace is required')
        await context.workspace.filesystem.writeFile(destination, await filesystem.readFile(source), { overwrite: false })
        return { source, savedAs: destination }
      },
    }),
  }
}

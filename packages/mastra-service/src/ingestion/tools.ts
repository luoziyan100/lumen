/**
 * [INPUT]: Mastra createTool、可信 Workspace resolver、DOCX/图像纯解析
 * [OUTPUT]: createIngestionTools：extract_docx/look_at_image
 * [POS]: 摄取原生工具组合；图片只保存带内容指纹的引用，像素由请求处理器加载
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createTool, type ToolExecutionContext } from '@mastra/core/tools'
import type { Workspace } from '@mastra/core/workspace'
import { z } from 'zod'
import { extractDocxText } from './docx.ts'
import { imageInfo, imageDigest, imageReferenceSchema, MAX_IMAGE_BYTES } from './images.ts'
import { readWorkspaceBytes, relativeFile, saveWorkspaceText } from './files.ts'

export type IngestionWorkspaceResolver = (context: { requestContext?: ToolExecutionContext['requestContext'] } | undefined) => Workspace | Promise<Workspace>
const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024

export function createIngestionTools(resolveWorkspace: IngestionWorkspaceResolver) {
  return {
    extract_docx: createTool({
      id: 'extract_docx', description: '抽取工作区 DOCX 主文档正文，保留段落与表格文字；不解析图片、独立脚注或版式。offset/limit 分段读取，save_as 可将完整正文保存到新文件。',
      inputSchema: z.object({ source: z.string().min(1), save_as: z.string().min(1).optional(), offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(20000).default(20000) }),
      execute: async ({ source, save_as, offset, limit }, context) => {
        context?.abortSignal?.throwIfAborted()
        const workspace = await resolveWorkspace(context)
        if (save_as && relativeFile(save_as) === relativeFile(source)) throw new Error('抽取输出不得覆盖原始 DOCX')
        const bytes = await readWorkspaceBytes(workspace, source, MAX_DOCUMENT_BYTES, context?.abortSignal)
        const text = await extractDocxText(bytes, context?.abortSignal)
        if (save_as) await saveWorkspaceText(workspace, save_as, text, context?.abortSignal)
        return { source, content: text.slice(offset, offset + limit), totalChars: text.length, offset, truncated: offset + limit < text.length, savedAs: save_as }
      },
    }),
    look_at_image: createTool({
      id: 'look_at_image', description: '查看工作区 PNG/JPEG/GIF/WebP 图片，将真实像素送给当前模型；当前模型需支持视觉。限制 5 MiB 和 3200 万像素。可给出要观察的 focus。',
      inputSchema: z.object({ path: z.string().min(1), focus: z.string().max(2000).optional() }),
      outputSchema: imageReferenceSchema,
      execute: async ({ path, focus }, context) => {
        context?.abortSignal?.throwIfAborted()
        const workspace = await resolveWorkspace(context)
        const bytes = await readWorkspaceBytes(workspace, path, MAX_IMAGE_BYTES, context?.abortSignal)
        const info = imageInfo(bytes)
        context?.abortSignal?.throwIfAborted()
        return { path: relativeFile(path), focus, ...info, bytes: bytes.length, sha256: imageDigest(bytes) }
      },
    }),
  }
}

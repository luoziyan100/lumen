/**
 * [INPUT]: Mastra provider prompt、可信 Workspace resolver 与带 SHA256 的图像引用
 * [OUTPUT]: createImageToolResultProcessor：为当前模型请求加载工作区图像
 * [POS]: 请求独有的多模态边界；持久消息与展示事件只含引用，文件变化时显式要求重读
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { ProcessLLMRequestArgs, InputProcessor } from '@mastra/core/processors'
import type { IngestionWorkspaceResolver } from './tools.ts'
import { readWorkspaceBytes } from './files.ts'
import { imageDigest, imageReferenceSchema, MAX_IMAGE_BYTES, type ImageReference } from './images.ts'

type Prompt = ProcessLLMRequestArgs['prompt']
type UserMessage = Extract<Prompt[number], { role: 'user' }>

async function imageParts(reference: ImageReference, resolveWorkspace: IngestionWorkspaceResolver, context: ProcessLLMRequestArgs): Promise<UserMessage['content']> {
  const source = `图像来源：${reference.path}（${reference.width}×${reference.height}）。${reference.focus ? `观察重点：${reference.focus}` : ''}`
  try {
    const workspace = await resolveWorkspace(context)
    const bytes = await readWorkspaceBytes(workspace, reference.path, MAX_IMAGE_BYTES, context.abortSignal)
    if (imageDigest(bytes) !== reference.sha256) throw new Error('Image changed')
    return [{ type: 'text', text: source }, { type: 'file', data: new Uint8Array(bytes), mediaType: reference.mediaType }]
  } catch {
    context.abortSignal?.throwIfAborted()
    return [{ type: 'text', text: `${source}文件已变化或无法读取，当前没有提供像素。需要重新调用 look_at_image。` }]
  }
}

export function createImageToolResultProcessor(resolveWorkspace: IngestionWorkspaceResolver) {
  return {
    id: 'lumen-image-tool-results',
    async processLLMRequest(context: ProcessLLMRequestArgs) {
      const { prompt, abortSignal } = context
      const output: Prompt = []
      let images: UserMessage['content'] = [], changed = false
      for (let index = 0; index < prompt.length; index++) {
        abortSignal?.throwIfAborted()
        const message = prompt[index]
        output.push(message)
        if (message.role !== 'tool') continue
        for (const part of message.content) {
          if (part.type !== 'tool-result' || part.toolName !== 'look_at_image' || part.output.type !== 'json') continue
          const reference = imageReferenceSchema.safeParse(part.output.value)
          if (!reference.success) continue
          changed = true
          images.push(...await imageParts(reference.data, resolveWorkspace, context))
        }
        if (prompt[index + 1]?.role !== 'tool' && images.length) {
          output.push({ role: 'user', content: images })
          images = []
        }
      }
      return changed ? { prompt: output } : undefined
    },
  } satisfies InputProcessor
}

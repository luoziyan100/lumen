/**
 * [INPUT]: Mastra's processLLMRequest and createTool; the canvas store's glance (studio/canvas); a resolver from the request to the run's target sheet
 * [OUTPUT]: createGlanceProcessor: puts the target sheet's latest glance into the current provider request as one user file part;
 *           createLookTools: board_look, which waits up to about 5 seconds for a glance showing the AI's latest writes
 * [POS]: the board's way to the model's eyes (Q6), registered only when the model sees (vision ≠ off; context.ts and application.ts decide). The PNG never
 *        enters persisted messages, the library or the transcript: it lives in one overwritten row per sheet, so a request carries at most one board image
 *        and history never accumulates old ones. Without vision the model reads board_view's structure only
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import type { InputProcessor, ProcessLLMRequestArgs } from '@mastra/core/processors'
import { createTool, type ToolExecutionContext } from '@mastra/core/tools'
import { z } from 'zod'
import type { Studio } from './studio.ts'

type Prompt = ProcessLLMRequestArgs['prompt']
type UserContent = Extract<Prompt[number], { role: 'user' }>['content']
/** The run's target sheet for a request or tool call (R16), null outside a topic's main session; never captures a new target. */
export type GlanceTarget = (context: { requestContext?: ToolExecutionContext['requestContext'] } | undefined) => string | null

const LOOK_MS = 5000, POLL_MS = 250

export function createGlanceProcessor(studio: Studio, targetOf: GlanceTarget) {
  return {
    id: 'lumen-board-glance',
    processLLMRequest(context: ProcessLLMRequestArgs) {
      const sheetId = targetOf(context)
      const glance = sheetId ? studio.board.canvas.glance(sheetId) : null
      if (!sheetId || !glance) return undefined
      const sheet = studio.board.sheet(sheetId), current = studio.board.canvas.glanceCurrent(sheetId)
      const parts: UserContent = [
        { type: 'text', text: `白板「${sheet.title}」此刻的画面（${glance.width}×${glance.height}${current ? '' : '；画面还没跟上最新的写入，以 board_view 为准'}）：` },
        { type: 'file', data: glance.png, mediaType: 'image/png' },
      ]
      // Only this request sees it; the persisted conversation is never touched
      const prompt = [...context.prompt]
      const last = prompt.at(-1)
      if (last?.role === 'user') prompt[prompt.length - 1] = { ...last, content: [...last.content, ...parts] }
      else prompt.push({ role: 'user', content: parts })
      return { prompt }
    },
  } satisfies InputProcessor
}

export function createLookTools(studio: Studio, targetOf: GlanceTarget) {
  return {
    board_look: createTool({ id: 'board_look',
      description: '画完或擦完想看看效果时用：等桌面把白板的最新画面送来（最多约 5 秒）。拿到了，下一步你就能看到画面；拿不到（用户没开着这张白板），就读 board_view 的结构。',
      inputSchema: z.object({}),
      execute: async (_input, context) => {
        const sheetId = targetOf(context)
        if (!sheetId) return { updated: false, note: '这一轮没有白板，读不到画面' }
        const signal = (context as { abortSignal?: AbortSignal } | undefined)?.abortSignal
        for (const end = Date.now() + LOOK_MS; ;) {
          if (studio.board.canvas.glanceCurrent(sheetId)) return { updated: true, note: '画面已更新，下一步可见' }
          if (Date.now() >= end || signal?.aborted) return { updated: false, note: '拿不到新画面（用户可能没开着这张白板），请读 board_view 的结构' }
          await new Promise(resolve => setTimeout(resolve, POLL_MS))
        }
      },
    }),
  }
}

/**
 * [INPUT]: the studio stores (sediment/board), board-tools' trusted writer (the run target, R16), a trusted channel reading a thread's user messages
 * [OUTPUT]: createSedimentTools: sediment_invite (ask one anchor question, optionally pointing at live elements of the target sheet; latest replaces) and sediment_quote (hand the user's words
 *           back: the service scans this thread's user messages newest first for the first one passing the delete-only check, binding its id, full text and deleted fragments to an offer — nothing more);
 *           both exist for the main agent only (the specialist list leaves them out) and only while a run target exists
 * [POS]: the AI's only contact surface with sediment (S4): not one character of entry text — invites and offers both wait for the user's hand in the UI; message originals come only from trusted memory, never from the model.
 *        The scan runs newest first and the model never sees message ids (S4 as amended). Since Mastra 1.84 an allowed tool runs without an approval pause, so this turn's user message
 *        may still sit in the save queue: the tool flushes the parent stream's pending messages (official flushMessages) before it reads memory
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { StudioError } from './errors.ts'
import { ENTRY_TEXT_LIMIT, quotePlan } from './sediment.ts'
import type { Studio } from './studio.ts'
import type { BoardWriter } from './board-tools.ts'

/** Trusted read: threadId → that thread's user messages as plain text (newest first, empty when none); assembled by the application from memory. */
export type UserMessages = (threadId: string) => Promise<{ id: string; text: string }[]>

/** Elements an invite points at must be live elements of the run's target sheet (R16); pointing at none is fine. */
function targetElements(studio: Studio, sheetId: string, elementIds: string[]): void {
  const live = new Set(studio.board.canvas.liveElements(sheetId).map(row => row.element.id))
  for (const id of elementIds) if (!live.has(id))
    throw new StudioError(`元素 ${id} 不在这一轮的白板上（或已被删）；邀请只指这张上还在的元素，也可以不指`, 400, 'sediment.invite_blocks', { blockId: id })
}

/** Plain text: content is a string, a parts array, or { parts: [{ text }] } (memory stores user messages as signals with parts). */
export function plainText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map(part => typeof part === 'string' ? part : typeof part === 'object' && part !== null && 'text' in part ? String((part as { text?: unknown }).text ?? '') : '').join('')
  if (typeof content === 'object' && content !== null && 'parts' in content) return plainText((content as { parts: unknown }).parts)
  return ''
}

export function createSedimentTools(studio: Studio, writer: BoardWriter, userMessages: UserMessages) {
  return {
    sediment_invite: createTool({ id: 'sediment_invite',
      description: '一件事在白板上已经想清楚时用：配一句锚点问题（问用户「用自己的话会怎么说」，不是替用户总结），可以指出白板上相关的几个元素（elementIds，可不给）。问题会摆在用户的沉淀输入上方；它不写任何沉淀正文。同一张白板再邀一次会覆盖早前的。',
      inputSchema: z.object({ elementIds: z.array(z.string().max(64)).max(8).optional(), question: z.string().trim().min(1).max(200) }),
      execute: async ({ elementIds = [], question }, context) => {
        const { sheetId, threadId, runId } = await writer(context)
        if (sheetId === null) throw new StudioError('这一轮没有写入目标（没有进行中的白板），先在对话里和用户确认写哪张', 409, 'board.no_live_sheet')
        targetElements(studio, sheetId, elementIds)
        const sheet = studio.board.sheet(sheetId)
        studio.sediment.invite(sheetId, { elementIds, question, threadId, runId })
        return { sheet: sheet.title, pointed: elementIds.length, question, note: '已把问题摆到用户的沉淀输入上方；等用户用自己的话写，不代写' }
      },
    }),
    sediment_quote: createTool({ id: 'sediment_quote',
      description: `把用户在这段对话里说过的一句话递回去，请用户确认留作沉淀。text 只能由那句话删字得到——不改字、不补字、不调顺序；什么算口癖由你判断（参考现状里附的用户说话习惯），删错了用户会划回来。elementIds 可选，指白板上相关的元素（要在这一轮的白板上且没被删）。服务端逐字校验并绑定原话。它不直接建条目：用户在界面上点「留下」才算。`,
      inputSchema: z.object({ text: z.string().max(ENTRY_TEXT_LIMIT * 2), elementIds: z.array(z.string().max(64)).max(8).optional() }),
      execute: async ({ text, elementIds = [] }, context) => {
        const { topicId, threadId, sheetId } = await writer(context)
        if (sheetId === null) throw new StudioError('这一轮没有写入目标（没有进行中的白板），先在对话里和用户确认写哪张', 409, 'board.no_live_sheet')
        if (threadId === null) throw new StudioError('当前主会话身份缺失，递不回原话', 400, 'sediment.quote_source')
        await context?.agent?.flushMessages?.()
        const messages = await userMessages(threadId)
        for (const message of messages) {
          const plan = quotePlan(message.text, text)
          if (plan === 'empty' || plan === 'span') continue
          targetElements(studio, sheetId, elementIds)
          const offer = studio.sediment.offerAdd(topicId, { threadId, messageId: message.id, text, original: message.text,
            fragments: plan.filter(fragment => fragment.text.trim()), elementIds })
          return { offered: offer.text, from: message.id, note: '已摆在用户的沉淀输入上方（删掉的字划了线，用户可放回），等用户确认；用户不认就放下' }
        }
        throw new StudioError('递回的不是原话：text 必须能由这段对话里某句用户原话只删字得到，不能改字、补字或调顺序', 400, 'sediment.quote_invalid')
      },
    }),
  }
}

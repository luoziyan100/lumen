/**
 * [INPUT]: the studio stores (sediment/board), board-tools' trusted writer (the run target, R16), a trusted channel reading a thread's user messages
 * [OUTPUT]: createSedimentTools: sediment_invite (point at blocks of the target sheet worth keeping and ask one question, latest replaces) and sediment_quote (hand the user's words
 *           back: the service scans this thread's user messages newest first for the first one passing the delete-only check, binding its id, full text and deleted fragments to an offer — nothing more);
 *           both exist for the main agent only (the specialist list leaves them out) and only while a run target exists
 * [POS]: the AI's only contact surface with sediment (S4): not one character of entry text — invites and offers both wait for the user's hand in the UI; message originals come only from trusted memory, never from the model
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

/** Blocks attached to an invite or offer must be current blocks of the run's target sheet (R16). */
function targetBlocks(studio: Studio, topicId: string, sheetId: string, blockIds: string[]): void {
  if (!blockIds.length) throw new StudioError('至少指出一块值得留下的区块', 400, 'sediment.invite_blocks')
  for (const blockId of blockIds) {
    const row = studio.db.prepare(`SELECT b.state FROM blocks b WHERE b.id = ? AND b.sheet_id = ?`).get(blockId, sheetId)
    if (!row) throw new StudioError(`区块 ${blockId} 不在这一轮写入的白板上；邀请只指这张上的块`, 400, 'sediment.invite_blocks', { blockId })
    if (row.state !== 'current') throw new StudioError(`区块 ${blockId} 不是当前区块（${row.state}），不值得邀用户留它`, 400, 'sediment.invite_blocks', { blockId })
  }
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
      description: '白板写满、或一块内容已经想清楚时用：指出这张白板上值得留下的几块，配一句锚点问题（问用户「用自己的话会怎么说」，不是替用户总结）。问题会摆在用户的沉淀输入上方；它不写任何沉淀正文。同一张白板再邀一次会覆盖早前的。',
      inputSchema: z.object({ blockIds: z.array(z.string().max(64)).min(1).max(8), question: z.string().trim().min(1).max(200) }),
      execute: async ({ blockIds, question }, context) => {
        const { topicId, sheetId, threadId, runId } = await writer(context)
        if (sheetId === null) throw new StudioError('这一轮没有写入目标（没有进行中的白板），先在对话里和用户确认写哪张', 409, 'board.no_live_sheet')
        targetBlocks(studio, topicId, sheetId, blockIds)
        const sheet = studio.board.sheet(sheetId)
        studio.sediment.invite(sheetId, { blockIds, question, threadId, runId })
        return { sheet: sheet.title, invited: blockIds.length, question, note: '已把问题摆到用户的沉淀输入上方；等用户用自己的话写，不代写' }
      },
    }),
    sediment_quote: createTool({ id: 'sediment_quote',
      description: `把用户在这段对话里说过的一句话递回去，请用户确认留作沉淀。text 只能由那句话删字得到——不改字、不补字、不调顺序；什么算口癖由你判断（参考现状里附的用户说话习惯），删错了他会划回来。服务端逐字校验并绑定原话。它不直接建条目：用户在界面上点「留下」才算。`,
      inputSchema: z.object({ text: z.string().max(ENTRY_TEXT_LIMIT * 2), blockIds: z.array(z.string().max(64)).max(8).optional() }),
      execute: async ({ text, blockIds }, context) => {
        const { topicId, threadId, sheetId } = await writer(context)
        if (sheetId === null) throw new StudioError('这一轮没有写入目标（没有进行中的白板），先在对话里和用户确认写哪张', 409, 'board.no_live_sheet')
        if (threadId === null) throw new StudioError('当前主会话身份缺失，递不回原话', 400, 'sediment.quote_source')
        // Scan newest first for the first user message the delete-only check accepts and bind to it (the model never sees message ids, S4 as amended)
        const messages = await userMessages(threadId)
        for (const message of messages) {
          const plan = quotePlan(message.text, text)
          if (plan === 'empty' || plan === 'span') continue
          if (blockIds?.length) targetBlocks(studio, topicId, sheetId, blockIds)
          const offer = studio.sediment.offerAdd(topicId, { threadId, messageId: message.id, text, original: message.text,
            fragments: plan.filter(fragment => fragment.text.trim()), blockIds })
          return { offered: offer.text, from: message.id, note: '已摆在用户的沉淀输入上方（删掉的字划了线，用户可放回），等用户确认；用户不认就放下' }
        }
        throw new StudioError('递回的不是原话：text 必须能由这段对话里某句用户原话只删字得到，不能改字、补字或调顺序', 400, 'sediment.quote_invalid')
      },
    }),
  }
}

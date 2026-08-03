/**
 * [INPUT]: useAgent 的 ChatItem 流
 * [OUTPUT]: buildTurnRailItems / clipTurnText —— 用户轮次索引(一问+随后助手答)
 * [POS]: TurnPreviewRail 的纯数据层;过程行/计划卡/compaction/error 不占刻度
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { ChatItem } from '../useAgent'

export interface TurnRailItem {
  /** 与锚点一致 = 用户消息 id */
  id: string
  userMsgId: string
  label: string
  description: string
}

const LABEL_MAX = 40
const DESC_MAX = 80

/** 压成单行摘要,超长截断 */
export function clipTurnText(raw: string, max: number): string {
  const one = raw.replace(/\s+/g, ' ').trim()
  if (one.length <= max) return one
  return `${one.slice(0, Math.max(1, max - 1))}…`
}

/**
 * 一轮 = 用户气泡 + 其后直到下一用户之前的最后一条 assistant。
 * process / compaction / error 跳过,不占刻度。
 */
export function buildTurnRailItems(items: ChatItem[]): TurnRailItem[] {
  const turns: TurnRailItem[] = []
  let pending: { userMsgId: string; label: string; lastAssistant?: string } | null = null

  function flush(hasMoreAfter: boolean): void {
    if (!pending) return
    let description: string
    if (pending.lastAssistant) {
      description = clipTurnText(pending.lastAssistant, DESC_MAX)
    } else if (hasMoreAfter) {
      description = '暂无回复'
    } else {
      description = '思考中…'
    }
    turns.push({
      id: pending.userMsgId,
      userMsgId: pending.userMsgId,
      label: pending.label,
      description,
    })
    pending = null
  }

  for (const it of items) {
    if (it.kind !== 'msg') continue
    if (it.role === 'user') {
      flush(true)
      pending = {
        userMsgId: it.id,
        label: clipTurnText(it.content, LABEL_MAX) || '（空消息）',
      }
      continue
    }
    if (it.role === 'assistant' && pending) {
      pending.lastAssistant = it.content
    }
  }
  flush(false)
  return turns
}

/** 消息 DOM 锚点 id */
export function msgAnchorId(msgId: string): string {
  return `msg-${msgId}`
}

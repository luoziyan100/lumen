/**
 * [INPUT]: types.ts 的 Message
 * [OUTPUT]: Thread —— 一条只增不减的消息线程
 * [POS]: agent-core 的状态载体；append 是唯一写入口，forModel 给模型的视图
 *
 * 铁律相关：forModel 超窗时可折叠老 tool_result 的内容，但绝不抹掉其"存在事实"
 * （保留同一条 role=tool_result + toolCallId 的消息），否则模型会以为某次动作没发生过。
 */
import type { Message } from './types.ts'

export interface ForModelOptions {
  /** 超过此字符数的 tool_result 会被折叠（仍保留存在）；不填则不折叠 */
  maxToolResultChars?: number
  /**
   * 最近 N 条 tool_result 豁免折叠。刚返回的结果模型还没消化（写笔记/引用），
   * 立刻折叠会违反铁律的实质——模型必须先真正看到后果，老化后才允许折叠。
   */
  keepRecentToolResults?: number
}

export class Thread {
  private readonly _messages: Message[]

  constructor(initial: Message[] = []) {
    this._messages = [...initial]
  }

  get messages(): readonly Message[] {
    return this._messages
  }

  /** 唯一写入口：只增不减 */
  append(message: Message): void {
    this._messages.push(message)
  }

  /** 给模型的视图：返回副本，超窗折叠老 tool_result 内容但保留其存在（最近 N 条豁免） */
  forModel(options: ForModelOptions = {}): Message[] {
    const limit = options.maxToolResultChars
    if (limit == null) return this._messages.map((m) => ({ ...m }))

    const keepRecent = options.keepRecentToolResults ?? 0
    const exempt = new Set<number>()
    if (keepRecent > 0) {
      let kept = 0
      for (let i = this._messages.length - 1; i >= 0 && kept < keepRecent; i -= 1) {
        if (this._messages[i].role === 'tool_result') {
          exempt.add(i)
          kept += 1
        }
      }
    }

    return this._messages.map((message, index) => {
      if (message.role !== 'tool_result' || message.content.length <= limit || exempt.has(index)) {
        return { ...message }
      }
      return {
        ...message,
        content:
          `<collapsed tool_call_id="${message.toolCallId ?? ''}" original_chars="${message.content.length}">\n` +
          '内容已折叠以省上下文。该工具确实执行过。如需原文：若已写入工作区文件请重读该文件，否则重新调用该工具。\n' +
          '</collapsed>',
      }
    })
  }
}

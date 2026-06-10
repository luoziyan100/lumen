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

  /** 给模型的视图：返回副本，超窗折叠老 tool_result 内容但保留其存在 */
  forModel(options: ForModelOptions = {}): Message[] {
    const limit = options.maxToolResultChars
    if (limit == null) return this._messages.map((m) => ({ ...m }))
    return this._messages.map((message) => {
      if (message.role !== 'tool_result' || message.content.length <= limit) {
        return { ...message }
      }
      return {
        ...message,
        content:
          `<collapsed tool_call_id="${message.toolCallId ?? ''}" original_chars="${message.content.length}">\n` +
          '内容已折叠以省上下文。该工具确实执行过，原始结果仍在线程历史中，可经工作区按需取回。\n' +
          '</collapsed>',
      }
    })
  }
}

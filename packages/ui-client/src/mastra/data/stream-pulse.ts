/**
 * [INPUT]: 只依赖注入的 {set, clear} 计时器；不碰 DOM、不订阅会话
 * [OUTPUT]: createStreamPulse：把「当前助手消息的字数」折成「正在说话」的开关——只有字数真的增长才开，停 600ms 就关，同一消息内连续增长不重复上报
 * [POS]: useSpeaking 与精灵之间的文字投影；首个快照只建立基线，新消息和后续增量才触发说话
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

/** 字数停这么久就认为「说完了」：调工具、想事情的静默都长于它。 */
export const STREAM_IDLE_MS = 600

export interface PulseClock {
  set(callback: () => void, ms: number): number
  clear(handle: number): void
}

export interface StreamPulse {
  /** 助手消息 id 与它当前可见文字长度；id 为空表示没有在跑的助手消息 */
  update(messageId: string | null, textLength: number): void
  dispose(): void
}

/**
 * 说话判定器：字数增长即开；静默 idleMs 即关。
 * 首次加载不把已存在的正文当增量；后续换消息从零计数，不能漏掉单次到达的短回复。
 */
export function createStreamPulse(emit: (talking: boolean) => void, clock: PulseClock, idleMs = STREAM_IDLE_MS): StreamPulse {
  let id: string | null = null
  let length = 0
  let talking = false
  let disposed = false
  let handle: number | null = null
  let initialized = false

  const report = (next: boolean) => {
    if (next === talking) return
    talking = next
    emit(next)
  }
  const cancel = () => {
    if (handle !== null) clock.clear(handle)
    handle = null
  }
  const silence = () => {
    cancel()
    id = null
    length = 0
    report(false)
  }

  return {
    update(messageId, textLength) {
      if (disposed) return
      if (!initialized) { initialized = true; id = messageId; length = textLength; return }
      if (messageId !== id) {
        cancel()
        report(false)
        id = messageId
        length = 0
      }
      if (!messageId) return
      if (textLength <= length) { length = textLength; return }
      length = textLength
      report(true)
      cancel()
      handle = clock.set(() => { handle = null; report(false) }, idleMs)
    },
    dispose() { disposed = true; silence() },
  }
}

/**
 * [INPUT]: ChatHandlers.onTextDelta
 * [OUTPUT]: createTextDeltaCoalescer —— 按字数/时延合并再回调
 * [POS]: adapters 流式共用;压 WS 洪水,保持感知连续
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { ChatHandlers } from '../core/model-port.ts'

export interface CoalesceOptions {
  /** 缓冲达到此字数即刷出。默认 20 */
  minChars?: number
  /** 距上次刷出超过此毫秒即刷出。默认 32 */
  maxWaitMs?: number
}

/** 返回 push(text) / flush();结束时务必 flush */
export function createTextDeltaCoalescer(
  handlers: ChatHandlers | undefined,
  options: CoalesceOptions = {},
): { push: (text: string) => void; flush: () => void } {
  const minChars = options.minChars ?? 20
  const maxWaitMs = options.maxWaitMs ?? 32
  const onDelta = handlers?.onTextDelta
  if (!onDelta) {
    return { push: () => {}, flush: () => {} }
  }

  let buf = ''
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastFlush = Date.now()

  const flush = (): void => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (!buf) return
    const out = buf
    buf = ''
    lastFlush = Date.now()
    onDelta(out)
  }

  const schedule = (): void => {
    if (timer) return
    const wait = Math.max(0, maxWaitMs - (Date.now() - lastFlush))
    timer = setTimeout(() => {
      timer = null
      flush()
    }, wait)
  }

  return {
    push(text: string) {
      if (!text) return
      buf += text
      if (buf.length >= minChars || Date.now() - lastFlush >= maxWaitMs) flush()
      else schedule()
    },
    flush,
  }
}

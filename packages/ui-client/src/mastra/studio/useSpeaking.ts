/**
 * [INPUT]: React effect、原生会话当前助手消息、stream-pulse 判定器与 browserClock
 * [OUTPUT]: useSpeaking：只有新增非空文字才说话，停字 600ms 或运行结束即回落
 * [POS]: 精灵的文字流投影；不把工具、思考或运行状态冒充说话，不创建事件协议
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useRef, useState } from 'react'
import { createStreamPulse, type StreamPulse } from '../data/stream-pulse.ts'
import { browserClock } from './sprite-face.ts'

export function useSpeaking(id: string | null, text: string): boolean {
  const latest = useRef({ id, length: text.trimEnd().length })
  latest.current = { id, length: text.trimEnd().length }
  const pulse = useRef<StreamPulse | null>(null)
  const [speaking, setSpeaking] = useState(false)
  useEffect(() => {
    const next = createStreamPulse(setSpeaking, browserClock)
    pulse.current = next
    next.update(latest.current.id, latest.current.length)
    return () => { next.dispose(); pulse.current = null }
  }, [])
  useEffect(() => { pulse.current?.update(id, text.trimEnd().length) }, [id, text])
  return !!id && speaking
}

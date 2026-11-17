/**
 * [INPUT]: React 外部订阅、固定身份 SessionFeed
 * [OUTPUT]: useSessionFeed：按任务生命周期接入原生流，断开后重新发现与退避重连，只在身份变化时改变；
 *           useFeedView：一帧最多一次的完整视图；useFeedSelect：一帧最多一次、结果相等不重渲染的局部视图；
 *           useSession：前两者的组合（自己持有订阅的对话用它）
 * [POS]: 组件与网络生命周期边界。流事件一秒上百次，React 只按帧取最新快照；订阅的持有者不必跟着每个字重渲染，
 *        谁要完整视图谁自己读（精灵），外壳只选它关心的值。React StrictMode 重挂载创建独立连接，切任务取消恢复计时器
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { LumenApi, type Identity } from './client.ts'
import { SessionFeed, type SessionView } from './feed.ts'
import { refreshConnection, retryConnection } from './connection.ts'

const empty: SessionView = { messages: [], display: null, connected: false, error: null, connectionError: null, model: '', lastStoredMessageId: null }
/** A hidden window gets no animation frames; the timer still delivers its updates, at a slower pace */
const HIDDEN_FRAME_MS = 100

export function useSessionFeed(api: LumenApi, identity: Identity | null): SessionFeed | null {
  const [feed, setFeed] = useState<SessionFeed | null>(null)
  useEffect(() => {
    if (!identity) { setFeed(null); return }
    let cancelRecovery: (() => void) | undefined
    const next = new SessionFeed(api, identity, () => {
      cancelRecovery ??= retryConnection(async () => { await refreshConnection(); await next.start() })
    })
    const unsubscribe = next.subscribe(() => {
      if (next.getSnapshot().connected) { cancelRecovery?.(); cancelRecovery = undefined }
    })
    setFeed(next)
    void next.start()
    return () => { cancelRecovery?.(); unsubscribe(); next.close() }
  }, [api, identity?.topicId, identity?.taskId])
  const current = feed?.identity
  return current?.topicId === identity?.topicId && current?.taskId === identity?.taskId ? feed : null
}

// ---- Coalesce the feed's events into at most one notification per frame ----
function framed(feed: SessionFeed | null) {
  return (listener: () => void) => {
    if (!feed) return () => {}
    let frame = 0, timer: ReturnType<typeof setTimeout> | undefined
    const fire = () => { cancelAnimationFrame(frame); clearTimeout(timer); frame = 0; timer = undefined; listener() }
    const off = feed.subscribe(() => {
      if (timer !== undefined) return
      frame = requestAnimationFrame(fire); timer = setTimeout(fire, HIDDEN_FRAME_MS)
    })
    return () => { off(); cancelAnimationFrame(frame); clearTimeout(timer) }
  }
}

export function useFeedView(feed: SessionFeed | null): SessionView {
  const subscribe = useMemo(() => framed(feed), [feed])
  return useSyncExternalStore(subscribe, () => feed?.getSnapshot() ?? empty)
}

/** A value derived from the view; the caller re-renders only when `equal` says it changed */
export function useFeedSelect<T>(feed: SessionFeed | null, select: (view: SessionView) => T, equal: (a: T, b: T) => boolean = Object.is): T {
  const subscribe = useMemo(() => framed(feed), [feed])
  const memo = useRef<{ view: SessionView; value: T } | null>(null)
  const pick = useRef(select); pick.current = select
  return useSyncExternalStore(subscribe, () => {
    const view = feed?.getSnapshot() ?? empty
    const last = memo.current
    if (last?.view === view) return last.value
    const value = pick.current(view)
    memo.current = { view, value: last && equal(last.value, value) ? last.value : value }
    return memo.current.value
  })
}

export function useSession(api: LumenApi, identity: Identity | null) {
  const feed = useSessionFeed(api, identity)
  return { feed, view: useFeedView(feed) }
}

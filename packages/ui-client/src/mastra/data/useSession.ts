/**
 * [INPUT]: React 外部订阅、固定身份 SessionFeed
 * [OUTPUT]: useSession：按任务生命周期接入原生流，断开后重新发现与退避重连
 * [POS]: 组件与网络生命周期边界，React StrictMode 重挂载创建独立连接，切任务取消恢复计时器
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useState } from 'react'
import { LumenApi, type Identity } from './client.ts'
import { SessionFeed, type SessionView } from './feed.ts'
import { refreshConnection, retryConnection } from './connection.ts'

const empty: SessionView = { messages: [], display: null, connected: false, error: null, connectionError: null, model: '', lastStoredMessageId: null }
export function useSession(api: LumenApi, identity: Identity | null) {
  const [state, setState] = useState<{ feed: SessionFeed | null; view: SessionView }>({ feed: null, view: empty })
  useEffect(() => {
    if (!identity) { setState({ feed: null, view: empty }); return }
    let cancelRecovery: (() => void) | undefined
    const feed = new SessionFeed(api, identity, () => {
      cancelRecovery ??= retryConnection(async () => { await refreshConnection(); await feed.start() })
    })
    const unsubscribe = feed.subscribe(() => {
      const view = feed.getSnapshot()
      if (view.connected) { cancelRecovery?.(); cancelRecovery = undefined }
      setState({ feed, view })
    })
    setState({ feed, view: feed.getSnapshot() })
    void feed.start()
    return () => { cancelRecovery?.(); unsubscribe(); feed.close() }
  }, [api, identity?.projectId, identity?.taskId])
  const current = state.feed?.identity
  if (current?.projectId !== identity?.projectId || current?.taskId !== identity?.taskId) return { feed: null, view: empty }
  return state
}

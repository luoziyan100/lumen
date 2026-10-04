/**
 * [INPUT]: 原时段问候、完整Composer、产品会话创建API与固定身份SessionFeed
 * [OUTPUT]: Welcome：完整欢迎输入卡；发送或技能入口才准备真实会话
 * [POS]: 欢迎态到原生会话的窄桥接；按服务端点/项目预分配身份直接沿用conversationDraft，准备失败保留材料，迟到发送不切换新项目
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { getTimeGreeting } from '../../../../copy/greeting.ts'
import type { Identity, LumenApi } from '../../../data/client.ts'
import { SessionFeed } from '../../../data/feed.ts'
import { Composer } from '../Composer.tsx'

const identities = new Map<string, Identity>()
function reserveIdentity(scope: string, projectId: string): Identity {
  const existing = identities.get(scope)
  if (existing) return existing
  const key = `lumen:mastra:welcome:v2:${scope}`
  let taskId: string | null = null
  try { taskId = localStorage.getItem(key) } catch { /* 无存储权限时仍保留进程内草稿身份。 */ }
  const identity = Object.freeze({ projectId, taskId: taskId || crypto.randomUUID() })
  identities.set(scope, identity)
  try { localStorage.setItem(key, identity.taskId) } catch { /* 不阻断输入。 */ }
  return identity
}
function releaseIdentity(scope: string, identity: Identity) {
  if (identities.get(scope)?.taskId !== identity.taskId) return
  identities.delete(scope)
  try { localStorage.removeItem(`lumen:mastra:welcome:v2:${scope}`) } catch { /* 已发送草稿由真实会话持有。 */ }
}

export function Welcome({ api, projectId, onSession, onSettings }: {
  api: LumenApi
  projectId: string
  onSession: (identity: Identity) => void
  onSettings: () => void
}) {
  const scope = JSON.stringify([api.connection.baseUrl, projectId])
  const [identity] = useState(() => reserveIdentity(scope, projectId))
  const pending = useRef<Promise<SessionFeed> | null>(null), feed = useRef<SessionFeed | null>(null), alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false; feed.current?.close() } }, [])
  const prepareSession = useCallback((): Promise<SessionFeed> => {
    if (pending.current) return pending.current
    pending.current = api.open(identity).then(() => {
      const session = new SessionFeed(api, identity)
      feed.current = session
      if (!alive.current) session.close()
      return session
    }).catch(error => { pending.current = null; throw error })
    return pending.current
  }, [api, identity])
  function sent() {
    releaseIdentity(scope, identity)
    if (alive.current) onSession(identity)
  }
  return <><div className="chat-stage"><div className="messages messages-empty"><div className="messages-content"><div className="empty"><div className="empty-mark">{getTimeGreeting()}</div></div></div></div></div><Composer api={api} identity={identity} feed={null} connected canStop={false} queued={0} onActivity={sent} onSettings={onSettings} prepareSession={prepareSession} /></>
}

/**
 * [INPUT]: LumenApi 的主题会话目录、Welcome/Conversation/Specialists/Diagnostics 复用件、主题运行投影（R1）
 * [OUTPUT]: Sprite：对话精灵——收起是右下角的球（运行时亮灯），点开是可拖动的浮窗或停靠右侧的栏；切换本主题的对话、开新对话（主题忙时禁用并说明）、专家目录与诊断入口；位置与形态存 localStorage
 * [POS]: 对话从主角退成精灵：白板是主题的共同草稿，对话只是说话的记录。所有消息、审批、追问仍走原生 Conversation
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import { BackIcon, ChatIcon, CloseIcon, PanelIcon, PlusIcon } from '../../components/icons'
import { STUDIO_COPY as S } from '../../copy/studioCopy'
import type { LumenApi, Identity, SessionInfo, Topic } from '../data/client.ts'
import type { FileTarget } from '../data/file-links'
import { Conversation, type BoardSignal } from '../views/Conversation'
import { Welcome } from '../views/conversation/welcome/Welcome'
import { Specialists } from '../views/conversation/Specialists'
import { Diagnostics } from '../diagnostics/Diagnostics'
import { Light } from './TopicPanel'

const KEY = 'lumen.studio.sprite'
interface Shape { open: boolean; docked: boolean; x: number; y: number; w: number; h: number }
const DEFAULT: Shape = { open: false, docked: false, x: -1, y: -1, w: 420, h: 560 }

export function loadShape(): Shape {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Shape> } } catch { return DEFAULT }
}
/** 浮窗必须留在窗口里：上次的位置在小窗口下可能已经出界。 */
export function clampShape(shape: Shape, width: number, height: number): Shape {
  const w = Math.min(shape.w, Math.max(320, width - 24)), h = Math.min(shape.h, Math.max(360, height - 24))
  const x = shape.x < 0 ? width - w - 24 : Math.max(8, Math.min(shape.x, width - w - 8))
  const y = shape.y < 0 ? height - h - 24 : Math.max(8, Math.min(shape.y, height - h - 8))
  return { ...shape, w, h, x, y }
}

export function useSessions(api: LumenApi, topicId: string | null, signal: number) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]), [error, setError] = useState('')
  useEffect(() => { setSessions([]); setError('') }, [api, topicId])
  useEffect(() => {
    if (!topicId) return
    let active = true, pending = false
    const read = () => {
      if (pending) return
      pending = true
      void api.sessions(topicId).then(result => { if (active) { setSessions(result.items); setError('') } })
        .catch(error => { if (active) setError(error instanceof Error ? error.message : String(error)) })
        .finally(() => { pending = false })
    }
    read()
    const timer = window.setInterval(read, 3000)
    return () => { active = false; clearInterval(timer) }
  }, [api, topicId, signal])
  return { sessions, error }
}

export function Sprite({ api, topic, identity, sessions, onIdentity, onActivity, onOpenFile, onFocusBlock, onBoard, onSettings, onDocked }: {
  api: LumenApi
  topic: Topic
  identity: Identity | null
  sessions: SessionInfo[]
  onIdentity: (identity: Identity | null) => void
  onActivity: () => void
  onOpenFile: (target: FileTarget) => void
  onFocusBlock: (blockId: string) => void
  onBoard: (signal: BoardSignal) => void
  onSettings: () => void
  /** 停靠时外壳给右侧让出位置 */
  onDocked?: (docked: boolean) => void
}) {
  const [shape, setShape] = useState<Shape>(() => clampShape(loadShape(), window.innerWidth, window.innerHeight))
  const [listing, setListing] = useState(false), [diagnostics, setDiagnostics] = useState(false)
  const drag = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null)
  const busy = !!(topic.running || topic.waiting)
  const current = identity ? sessions.find(session => session.taskId === identity.taskId) : undefined
  const idle = !current?.running && !current?.waiting

  const update = useCallback((patch: Partial<Shape>) => setShape(previous => {
    const next = clampShape({ ...previous, ...patch }, window.innerWidth, window.innerHeight)
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* 存不下就只在本次有效 */ }
    return next
  }), [])
  useEffect(() => {
    const resize = () => setShape(previous => clampShape(previous, window.innerWidth, window.innerHeight))
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  useEffect(() => { setListing(false); setDiagnostics(false) }, [topic.id])
  useEffect(() => { onDocked?.(shape.open && shape.docked) }, [shape.open, shape.docked, onDocked])

  function startDrag(event: ReactPointerEvent) {
    if (shape.docked || (event.target as Element).closest('button, input, textarea')) return
    drag.current = { x: event.clientX, y: event.clientY, sx: shape.x, sy: shape.y }
    ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  }
  function moveDrag(event: ReactPointerEvent) {
    const start = drag.current
    if (start) setShape(previous => clampShape({ ...previous, x: start.sx + event.clientX - start.x, y: start.sy + event.clientY - start.y }, window.innerWidth, window.innerHeight))
  }
  function endDrag() {
    if (!drag.current) return
    drag.current = null
    update({})
  }

  if (!shape.open) return <button type="button" className="sprite-orb" aria-label={S.sprite.open} title={S.sprite.open} onClick={() => update({ open: true })}>
    <ChatIcon />{busy && <Light topic={topic} />}
  </button>

  const style = shape.docked ? undefined : { left: shape.x, top: shape.y, width: shape.w, height: shape.h }
  return <section className={`sprite${shape.docked ? ' sprite-docked' : ' sprite-floating'}`} style={style} aria-label="对话">
    <header className="sprite-head" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
      <button type="button" className="sprite-title" aria-expanded={listing} onClick={() => setListing(value => !value)} title={S.sprite.conversations}>
        {listing ? <BackIcon /> : null}<span>{listing ? S.sprite.conversations : current?.title ?? S.sprite.untitled}</span><Light topic={topic} />
      </button>
      <div className="sprite-actions">
        <button type="button" className="icon-btn" aria-label={S.sprite.newConversation} title={busy ? S.sprite.busy : S.sprite.newConversation} disabled={busy && !!identity} onClick={() => { onIdentity(null); setListing(false) }}><PlusIcon /></button>
        <button type="button" className="icon-btn" aria-label={shape.docked ? S.sprite.float : S.sprite.dock} title={shape.docked ? S.sprite.float : S.sprite.dock} aria-pressed={shape.docked} onClick={() => update({ docked: !shape.docked })}><PanelIcon /></button>
        <button type="button" className="icon-btn" aria-label={S.sprite.collapse} title={S.sprite.collapse} onClick={() => update({ open: false })}><CloseIcon /></button>
      </div>
    </header>
    {busy && !identity && <p className="sprite-busy" role="status">{S.sprite.busy}</p>}
    {listing ? <div className="sprite-list">
      <p className="sprite-hint">{S.sprite.hint}</p>
      <Button variant="secondary" disabled={busy} title={busy ? S.sprite.busy : undefined} onClick={() => { onIdentity(null); setListing(false) }}>{S.sprite.newConversation}</Button>
      {busy && <p className="sprite-busy">{S.sprite.busy}</p>}
      <ul>{sessions.map(session => <li key={session.taskId}><button type="button" className={`sprite-session${session.taskId === identity?.taskId ? ' on' : ''}`} onClick={() => { onIdentity({ topicId: session.topicId, taskId: session.taskId }); setListing(false) }}>
        <span>{session.title}</span>{session.unread && <span className="sprite-unread" aria-label="未读" />}<Light topic={session} />
      </button></li>)}</ul>
      {identity && <div className="sprite-tools">
        <Specialists className="sprite-specialists" api={api} identity={identity} idle={idle} onActivity={onActivity} />
        <Button variant="ghost" onClick={() => setDiagnostics(true)}>{S.sprite.diagnostics}</Button>
      </div>}
    </div>
      : identity ? <Conversation key={`${identity.topicId}:${identity.taskId}`} api={api} identity={identity} onActivity={onActivity} onSettings={onSettings} onOpenFile={onOpenFile} onFocusBlock={onFocusBlock} onBoard={onBoard} />
      : busy ? null
      : <div className="sprite-welcome"><Welcome key={`${api.connection.baseUrl}:${topic.id}`} api={api} topicId={topic.id} onSettings={onSettings} onSession={next => { onIdentity(next); onActivity() }} /></div>}
    {diagnostics && identity && <Diagnostics api={api} identity={identity} onClose={() => setDiagnostics(false)} />}
  </section>
}

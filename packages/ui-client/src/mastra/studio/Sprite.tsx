/**
 * [INPUT]: LumenApi 的主题会话目录、Welcome/Conversation/Specialists/Diagnostics、主题运行投影（R1）、useSession 的唯一订阅与 useSpeaking 的文字增量、sprite-face 的状态映射与 SpriteFace
 * [OUTPUT]: Sprite：对话精灵——收起是 52px 头像（主题/会话的 running、waiting 与说话折成 idle/running/waiting/speaking 一个状态，表情与光环跟它走，状态写进 aria-label），
 *           可拖到整个窗口任意位置、放哪停哪；展开时浮窗从头像中心柔和长出、收起缩回头像（useSpriteMove），浮窗贴着头像那一侧、拖标题栏带着锚点走，或停靠右侧的栏；
 *           展开头部同脸；收起仍观察文字流，展开复用同一订阅；切换本主题的对话、开新对话（主题忙时禁用并说明）、专家目录与诊断入口；锚点、大小与形态存 localStorage（sprite-place）
 * [POS]: 对话从主角退成精灵：白板是主题的共同草稿，对话只是说话的记录。所有消息、审批、追问仍走原生 Conversation
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import { BackIcon, CloseIcon, PanelIcon, PlusIcon } from '../../components/icons'
import { STUDIO_COPY as S } from '../../copy/studioCopy'
import type { LumenApi, Identity, SessionInfo, Topic } from '../data/client.ts'
import type { FileTarget } from '../data/file-links'
import { Conversation, type BoardSignal } from '../views/Conversation'
import { Welcome } from '../views/conversation/welcome/Welcome'
import { Specialists } from '../views/conversation/Specialists'
import { Diagnostics } from '../diagnostics/Diagnostics'
import { Light } from './TopicPanel'
import { SpriteFace } from './SpriteFace'
import { spriteState, useReducedMotion } from './sprite-face'
import { loadShape, saveShape, type Shape } from './sprite-place'
import { useSpriteMove } from './useSpriteMove'
import { useSession } from '../data/useSession.ts'
import { messageText } from '../data/feed.ts'
import { useSpeaking } from './useSpeaking'

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
  const [shape, setShape] = useState<Shape>(loadShape)
  const [listing, setListing] = useState(false), [diagnostics, setDiagnostics] = useState(false)
  // ---- 收起也保留同一条原生订阅；展开时交给 Conversation，不重复连流 ----
  const session = useSession(api, identity)
  const activeMessage = session.view.display?.currentMessage
  const message = activeMessage ? session.view.messages.find(item => item.id === activeMessage.id) : undefined
  const streaming = useSpeaking(session.view.display?.isRunning ? activeMessage?.id ?? null : null, message ? messageText(message) : '')
  const busy = !!(topic.running || topic.waiting)
  const current = identity ? sessions.find(session => session.taskId === identity.taskId) : undefined
  const idle = !current?.running && !current?.waiting
  // 表情只认这四个状态；等你优先于运行（审批挂起时 running 仍为真）
  const state = spriteState({ waiting: !!(current?.waiting || topic.waiting), running: !!(current?.running || topic.running), streaming: streaming && !!identity })

  // ---- 锚点只在松手、键盘移动、开合时写回；窗口缩放不改它，只在显示时夹取 ----
  const update = useCallback((patch: Partial<Shape>) => setShape(previous => { const next = { ...previous, ...patch }; saveShape(next); return next }), [])
  const move = useSpriteMove(shape, update, useReducedMotion())
  useEffect(() => { setListing(false); setDiagnostics(false) }, [topic.id])
  useEffect(() => { onDocked?.(shape.open && shape.docked) }, [shape.open, shape.docked, onDocked])

  // ---- 停靠且展开时只有右侧一栏；否则头像在锚点上（展开动画期间与浮窗同在，交叉淡出淡入） ----
  const docked = shape.docked && shape.open
  const showOrb = !docked && move.phase !== 'open', showWindow = docked || move.phase !== 'closed'
  const orb = showOrb && <button ref={move.orbRef} type="button" className="sprite-orb" data-state={state} data-phase={move.phase} aria-label={S.sprite.openWith[state]} title={S.sprite.openWith[state]}
    style={{ left: move.orb.x, top: move.orb.y }} {...move.orbHandlers}>
    <SpriteFace state={state} breathe />
    {sessions.some(item => item.unread) && <span className="sprite-unread" aria-label="未读" />}
  </button>
  // 同一个片段结构：开合时头像按钮不重挂（焦点与动画目标不丢）
  if (!showWindow) return <>{orb}{null}</>

  const style = docked ? undefined : { left: move.frame.x, top: move.frame.y, width: move.frame.w, height: move.frame.h }
  return <>{orb}<section ref={move.winRef} className={`sprite${docked ? ' sprite-docked studio-panel' : ' sprite-floating'}`} data-phase={docked ? 'open' : move.phase} style={style} aria-label="对话">
    <header className="studio-head sprite-head" {...move.headHandlers}>
      <SpriteFace state={state} className="sprite-face-head" />
      <button type="button" className="sprite-title" aria-expanded={listing} onClick={() => setListing(value => !value)} title={S.sprite.conversations}>
        {listing ? <BackIcon /> : null}<span>{listing ? S.sprite.conversations : current?.title ?? S.sprite.untitled}</span><Light topic={topic} />
      </button>
      <div className="sprite-actions">
        <button type="button" className="icon-btn" aria-label={S.sprite.newConversation} title={busy ? S.sprite.busy : S.sprite.newConversation} disabled={busy && !!identity} onClick={() => { onIdentity(null); setListing(false) }}><PlusIcon /></button>
        <button type="button" className="icon-btn" aria-label={shape.docked ? S.sprite.float : S.sprite.dock} title={shape.docked ? S.sprite.float : S.sprite.dock} aria-pressed={shape.docked} onClick={() => update({ docked: !shape.docked })}><PanelIcon /></button>
        <button type="button" className="icon-btn" aria-label={S.sprite.collapse} title={S.sprite.collapse} onClick={() => move.setOpen(false)}><CloseIcon /></button>
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
      : identity ? <Conversation key={`${identity.topicId}:${identity.taskId}`} api={api} identity={identity} onActivity={onActivity} onSettings={onSettings} onOpenFile={onOpenFile} onFocusBlock={onFocusBlock} onBoard={onBoard} session={session} />
      : busy ? null
      : <div className="sprite-welcome"><Welcome key={`${api.connection.baseUrl}:${topic.id}`} api={api} topicId={topic.id} onSettings={onSettings} onSession={next => { onIdentity(next); onActivity() }} /></div>}
    {diagnostics && identity && <Diagnostics api={api} identity={identity} onClose={() => setDiagnostics(false)} />}
  </section></>
}

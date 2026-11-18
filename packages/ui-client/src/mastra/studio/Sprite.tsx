/**
 * [INPUT]: LumenApi's topic conversation list, Welcome/Conversation/Specialists/Diagnostics, the topic's run projection (R1), the shared conversation feed (lent by StudioApp; the sprite reads its full view, once per frame)
 *          and useSpeaking's text increments, SpriteFigure and SpriteFace sharing one useSpriteExpression snapshot
 * [OUTPUT]: Sprite: the conversation sprite. Collapsed it is the 60×92px full-body miniature (the topic's and conversation's running, waiting and speaking fold into one state of
 *           idle/running/waiting/speaking; motion and glow follow it, and the state is in aria-label); it can be dragged anywhere in the window and stays where dropped. Opening grows
 *           the window softly from the figure's centre and closing shrinks it back (useSpriteMove); the window keeps to the figure's side and the title bar drags the anchor, or it docks
 *           as the right column. The open header shows the same face; collapsed it still watches the text stream, and opening reuses the same subscription. It switches this topic's
 *           conversations, starts a new one (disabled while the topic is busy; the reason is a tooltip on the span around the list's button, never a visible line), and opens the specialist list and diagnostics; anchor, size and shape live in localStorage
 *           (sprite-place); it reports the figure's box (onFigure) so the Reading view keeps text clear of it. useSessions: the topic's conversation list, polled every 3s
 * [POS]: projects the four states straight to the desktop and takes open requests back; visibility only gates local drawing. The conversation stepped back into a sprite: the board is
 *        the topic's shared draft and the conversation is only the record of talk. Messages, approvals and questions still go through the native Conversation; the subscription
 *        itself belongs to StudioApp, so the Reading view's window shows the same stream without opening a second one; the full view is read here, so a streamed token
 *        re-renders the sprite and not the workbench
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import { Tooltip } from '@cloudflare/kumo/components/tooltip'
import { BackIcon, CloseIcon, PanelIcon, PlusIcon } from '../../components/icons'
import { useT } from '../../i18n/index.ts'
import type { LumenApi, Identity, SessionInfo, Topic } from '../data/client.ts'
import { useFeedView } from '../data/useSession.ts'
import type { SessionFeed } from '../data/feed.ts'
import type { FileTarget } from '../data/file-links'
import { Conversation, type BoardSignal } from '../views/Conversation'
import { Welcome } from '../views/conversation/welcome/Welcome'
import { Specialists } from '../views/conversation/Specialists'
import { Diagnostics } from '../diagnostics/Diagnostics'
import { Light } from './TopicPanel'
import { SpriteFigure } from './SpriteFigure'
import { useDesktopSprite, useSpriteDesktopOpenBridge } from './sprite-desktop/bridge'
import { SpriteFace } from './SpriteFace'
import { spriteState, useReducedMotion, useSpriteExpression } from './sprite-face'
import { loadShape, saveShape, SPRITE_H, SPRITE_W, type Shape } from './sprite-place'
import { useSpriteMove } from './useSpriteMove'
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

/** Where the figure sits in the viewport, so content can keep its text out from under it */
export interface SpriteBox { left: number; top: number; right: number; bottom: number }

export function Sprite({ api, topic, identity, feed, sessions, onIdentity, onActivity, onOpenFile, onFocusBlock, onBoard, onSettings, onDocked, onFigure }: {
  api: LumenApi
  topic: Topic
  identity: Identity | null
  /** The one subscription of `identity`, owned by StudioApp */
  feed: SessionFeed | null
  sessions: SessionInfo[]
  onIdentity: (identity: Identity | null) => void
  onActivity: () => void
  onOpenFile: (target: FileTarget) => void
  onFocusBlock: (blockId: string) => void
  onBoard: (signal: BoardSignal) => void
  onSettings: () => void
  /** When docked, the shell yields the right side */
  onDocked?: (docked: boolean) => void
  /** The figure's box (open or closed, since the anchor is the same), null when docked in its own column */
  onFigure?: (box: SpriteBox | null) => void
}) {
  const S = useT().studio
  const [shape, setShape] = useState<Shape>(loadShape)
  const [listing, setListing] = useState(false), [diagnostics, setDiagnostics] = useState(false)
  const session = { feed, view: useFeedView(feed) }
  const activeMessage = session.view.display?.currentMessage
  const message = activeMessage ? session.view.messages.find(item => item.id === activeMessage.id) : undefined
  const streaming = useSpeaking(session.view.display?.isRunning ? activeMessage?.id ?? null : null, message ? messageText(message) : '')
  const busy = !!(topic.running || topic.waiting)
  const current = identity ? sessions.find(session => session.taskId === identity.taskId) : undefined
  const idle = !current?.running && !current?.waiting
  // The face knows only these four states; waiting wins over running (running stays true while an approval is pending)
  const state = spriteState({ waiting: !!(current?.waiting || topic.waiting), running: !!(current?.running || topic.running), streaming: streaming && !!identity })

  // ---- The anchor is written only on release, keyboard moves and open/close; resizing the window never changes it, only clamps the display ----
  const update = useCallback((patch: Partial<Shape>) => setShape(previous => { const next = { ...previous, ...patch }; saveShape(next); return next }), [])
  const reduced = useReducedMotion()
  const move = useSpriteMove(shape, update, reduced)
  useEffect(() => { setListing(false); setDiagnostics(false) }, [topic.id])
  useEffect(() => { onDocked?.(shape.open && shape.docked) }, [shape.open, shape.docked, onDocked])
  const figureDocked = shape.open && shape.docked
  useEffect(() => {
    onFigure?.(figureDocked ? null : { left: move.orb.x, top: move.orb.y, right: move.orb.x + SPRITE_W, bottom: move.orb.y + SPRITE_H })
  }, [move.orb.x, move.orb.y, figureDocked, onFigure])
  useEffect(() => () => onFigure?.(null), [onFigure])
  const mainVisible = useDesktopSprite(state)
  const expression = useSpriteExpression(state, reduced, mainVisible)
  const openFromDesktop = useCallback(() => move.setOpen(true), [move.setOpen])
  useSpriteDesktopOpenBridge(openFromDesktop)

  // ---- Docked and open, there is only the right column; otherwise the figure sits on the anchor (during the opening animation it coexists with the window and they cross-fade).
  //      While opening the figure is inert, while closing the window is: no computed style changes (M8), and clicking the other reverses from the current progress (M7) ----
  const docked = shape.docked && shape.open
  const showOrb = !docked && move.phase !== 'open', showWindow = docked || move.phase !== 'closed'
  const orb = showOrb && <button ref={move.orbRef} type="button" className="sprite-orb" data-visible={mainVisible} data-state={state} data-phase={move.phase} inert={move.phase === 'opening'} aria-label={S.sprite.openWith[state]} title={S.sprite.openWith[state]}
    style={{ left: move.orb.x, top: move.orb.y }} {...move.orbHandlers}>
    <SpriteFigure state={state} size="compact" expression={expression} />
    {sessions.some(item => item.unread) && <span className="sprite-unread" aria-label={S.sprite.unread} />}
  </button>
  // One fragment shape: the figure button never remounts across open/close (focus and the animation target survive)
  if (!showWindow) return <>{orb}{null}</>

  const style = docked ? undefined : { left: move.frame.x, top: move.frame.y, width: move.frame.w, height: move.frame.h }
  return <>{orb}<section ref={move.winRef} className={`sprite${docked ? ' sprite-docked studio-panel' : ' sprite-floating'}`} data-phase={docked ? 'open' : move.phase} inert={!docked && move.phase === 'closing'} style={style} aria-label={S.sprite.chat}>
    <header className="studio-head sprite-head" {...move.headHandlers}>
      <SpriteFace state={state} expression={expression} className="sprite-face-head" />
      <button type="button" className="sprite-title" aria-expanded={listing} onClick={() => setListing(value => !value)} title={S.sprite.conversations}>
        {listing ? <BackIcon /> : null}<span>{listing ? S.sprite.conversations : current?.title ?? S.sprite.untitled}</span><Light topic={topic} />
      </button>
      <div className="sprite-actions">
        <button type="button" className="icon-btn" aria-label={S.sprite.newConversation} title={busy ? S.sprite.busy : S.sprite.newConversation} disabled={busy && !!identity} onClick={() => { onIdentity(null); setListing(false) }}><PlusIcon /></button>
        <button type="button" className="icon-btn" aria-label={shape.docked ? S.sprite.float : S.sprite.dock} title={shape.docked ? S.sprite.float : S.sprite.dock} aria-pressed={shape.docked} onClick={() => update({ docked: !shape.docked })}><PanelIcon /></button>
        <button type="button" className="icon-btn" aria-label={S.sprite.collapse} title={S.sprite.collapse} onClick={() => move.setOpen(false)}><CloseIcon /></button>
      </div>
    </header>
    {listing ? <div className="sprite-list">
      {/* While the topic runs, why 新对话 is off is a tooltip, not a line: a disabled button gets no pointer or focus, so the span around it carries
          the tooltip and joins the Tab order only then. The tooltip stays mounted and is switched off instead */}
      <Tooltip content={S.sprite.busy} disabled={!busy} render={<span className="sprite-new-why" tabIndex={busy ? 0 : undefined} />}>
        <Button variant="secondary" disabled={busy} aria-description={busy ? S.sprite.busy : undefined} onClick={() => { onIdentity(null); setListing(false) }}>{S.sprite.newConversation}</Button>
      </Tooltip>
      <ul>{sessions.map(session => <li key={session.taskId}><button type="button" className={`sprite-session${session.taskId === identity?.taskId ? ' on' : ''}`} onClick={() => { onIdentity({ topicId: session.topicId, taskId: session.taskId }); setListing(false) }}>
        <span>{session.title}</span>{session.unread && <span className="sprite-unread" aria-label={S.sprite.unread} />}<Light topic={session} />
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

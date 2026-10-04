/**
 * [INPUT]: 原生 SessionFeed/DisplayState、原生reasoning/工具轮次投影与真实用户消息计时、子任务轮询、当前会话稿件路径与已有 AssistantContent 沙箱
 * [OUTPUT]: Conversation：原消息舞台与输入坞、折叠思考和轮次导航；运行错误保留，连接错误可重试；审批/追问固定在输入卡上方，消息按坞高度让位；子任务轮询同一世代串行；滚动只在用户停留底部时追新；widget 回调稳定以保留历史消息 memo
 * [POS]: 新会话组合，不依赖旧 chat reducer；按身份 key 挂载以隔离草稿和迟到结果
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import { AssistantContent } from '../../components/widget/AssistantContent'
import { MASTRA_COPY as C } from '../../copy/mastraCopy'
import { LumenApi, type ChildTask, type Identity, type DisplayState } from '../data/client.ts'
import { useSession } from '../data/useSession.ts'
import { messageRole, messageText } from '../data/feed.ts'
import { refreshConnection } from '../data/connection.ts'
import { UserMessage, MessageCopy } from './conversation/transcript/Message'
import { TurnRail } from './conversation/transcript/TurnRail'
import { messageAnchor, userContent } from './conversation/transcript/content'
import './conversation/transcript/transcript.css'
import { Composer } from './conversation/Composer'
import { createConversationProjection, turnStartedAt } from './conversation/process/project'
import { ProcessRow, ThoughtRow, Waiting } from './conversation/process/Rows'
import { getTimeGreeting } from '../../copy/greeting'
import { Specialists } from './conversation/Specialists'
import { Question } from './conversation/question/Question'
import { workspaceLink, type FileTarget } from '../data/file-links'
import { useTranscriptStick } from './conversation/stick'

function stringify(value: unknown) { return typeof value === 'string' ? value : JSON.stringify(value, null, 2) }
function Approval({ approval, onReply }: { approval: NonNullable<DisplayState['pendingApproval']>; onReply: (approved: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  return <section className="mw-question"><strong>{C.approval}: {approval.toolName}</strong><pre>{stringify(approval.args)}</pre>{[true, false].map(approved => <Button disabled={busy} key={String(approved)} variant={approved ? 'primary' : 'ghost'} onClick={() => { setBusy(true); setError(''); void onReply(approved).catch(error => { setError(String(error)); setBusy(false) }) }}>{approved ? C.allow : C.deny}</Button>)}{error && <p role="alert">{error}</p>}</section>
}
export function Conversation({ api, identity, onActivity, onOpenFile, onSettings, activePath, onClearActivePath }: { api: LumenApi; identity: Identity; onActivity: () => void; onOpenFile: (target: FileTarget) => void; onSettings?: () => void; activePath?: string | null; onClearActivePath?: () => void }) {
  const { feed, view } = useSession(api, identity)
  const [error, setError] = useState(''), [children, setChildren] = useState<ChildTask[]>([])
  const alive = useRef(true), priorRunning = useRef(false)
  const readAttempt = useRef<string | null>(null)
  const display = view.display, running = display?.isRunning ?? false
  const connected = view.connected && feed?.api === api
  const project = useMemo(createConversationProjection, [])
  const { timeline, turns } = useMemo(() => project(view.messages, display), [project, view.messages, display])
  const suspended = Boolean(display?.pendingApproval || Object.keys(display?.pendingSuspensions ?? {}).length)
  const empty = !view.messages.length && !running
  const canStop = running || suspended || Boolean(display?.queuedFollowUps) || children.some(child => ['pending', 'running', 'suspended'].includes(child.status))
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    let cancelled = false, pending = false
    const update = () => {
      if (cancelled || pending) return
      pending = true
      void api.children(identity).then(result => {
        if (cancelled) return
        setChildren(result.tasks)
        if (result.childTokenUsage !== undefined) feed?.setChildUsage(result.childTokenUsage)
      }).catch(() => {}).finally(() => { pending = false })
    }
    update(); const timer = window.setInterval(update, 2000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [api, identity.projectId, identity.taskId, feed])
  const stick = useTranscriptStick(empty)
  useEffect(() => { if (priorRunning.current && !running) onActivity(); priorRunning.current = running }, [running, onActivity])
  const markVisibleRead = useCallback(() => {
    const id = view.lastStoredMessageId
    if (!id || id === readAttempt.current || !stick.followingNow.current || document.visibilityState !== 'visible' || !document.hasFocus()) return
    readAttempt.current = id
    void api.markSessionRead(identity, id).then(result => { if (alive.current && result.changed) onActivity() }).catch(() => { if (readAttempt.current === id) readAttempt.current = null })
  }, [api, identity.projectId, identity.taskId, view.lastStoredMessageId, onActivity, stick.followingNow])
  useEffect(() => {
    markVisibleRead(); window.addEventListener('focus', markVisibleRead); document.addEventListener('visibilitychange', markVisibleRead)
    return () => { window.removeEventListener('focus', markVisibleRead); document.removeEventListener('visibilitychange', markVisibleRead) }
  }, [markVisibleRead])
  const showError = useCallback((error: unknown) => { if (alive.current) setError(error instanceof Error ? error.message : String(error)) }, [])
  const sendWidgetMessage = useCallback((text: string) => {
    if (connected && feed) void feed.send(text).catch(showError)
  }, [connected, feed, showError])
  return <section className={`mw-conversation${empty ? ' chat-empty' : ''}`}>
    {!connected && !view.connectionError && <div className="mw-connection" role="status">{C.connecting}…</div>}
    {view.error && <div className="mw-error" role="alert">{view.error}</div>}
    {(view.connectionError || error) && <div className="mw-error" role="alert">{view.connectionError || error}<Button variant="ghost" onClick={() => { setError(''); void refreshConnection().then(() => feed?.start()).catch(showError) }}>{C.retry}</Button></div>}
    <div className="chat-stage">
    <div className={`messages mw-transcript${empty ? ' messages-empty' : ''}`} ref={stick.transcript} onWheel={stick.onWheel} onPointerDown={stick.onPointerDown} onClickCapture={event => {
      const link = (event.target as Element).closest('a[href]'), target = workspaceLink(link?.getAttribute('href') ?? '')
      if (target) { event.preventDefault(); event.stopPropagation(); onOpenFile(target) }
    }} onScroll={event => { stick.onScroll(event); markVisibleRead() }}>
      <div className="messages-content">
      {empty && <div className="empty"><div className="empty-mark">{getTimeGreeting()}</div></div>}
      {timeline.map(row => {
        if (row.kind === 'thought') return <ThoughtRow key={row.id} row={row} />
        if (row.kind === 'process') return <ProcessRow key={row.id} row={row} />
        const message = row.message
        return <article className={`msg-group msg-group-${messageRole(message)} mw-message mw-${messageRole(message)}`} key={row.id} id={messageAnchor(message.id)}>
        <div className={`bubble bubble-${messageRole(message)}`}>
        {messageRole(message) === 'assistant' ? <AssistantContent content={messageText(message)} isStreaming={running && display?.currentMessage?.id === message.id} onSendMessage={sendWidgetMessage} /> : <UserMessage message={message} onOpenFile={onOpenFile} />}
        </div><MessageCopy user={messageRole(message) === 'user'} text={messageRole(message) === 'user' ? userContent(message).text : messageText(message)} />
      </article>})}
      {running && !suspended && !timeline.some(row => row.kind !== 'message' && row.running) && !display?.currentMessage?.content.parts.some(part => part.type === 'text' && part.text.trim()) && <Waiting startedAt={turnStartedAt(view.messages)} />}
      <Specialists api={api} identity={identity} idle={!canStop && connected} onActivity={onActivity} />
      {children.length > 0 && <section className="mw-children"><h3>{C.children}</h3>{children.map(child => <div key={child.id}><span>{child.toolName} · {C.childStatus[child.status as keyof typeof C.childStatus] ?? child.status}{child.error ? `：${child.error.message}` : ''}</span>{['pending', 'running', 'suspended'].includes(child.status) && <Button variant="ghost" onClick={() => { void api.cancelChild(identity, child.id).catch(showError) }}>{C.stopChild}</Button>}</div>)}</section>}
      </div>
    </div>
    <TurnRail turns={turns} scroller={stick.transcript} onSelect={id => {
      const node = document.getElementById(messageAnchor(id)), root = stick.transcript.current
      if (!node || !root?.contains(node)) return
      stick.scrollToOffset(root.scrollTop + node.getBoundingClientRect().top - root.getBoundingClientRect().top - 24)
    }} />
    </div>
    <Composer prompt={<>
      {display?.pendingApproval && <Approval key={display.pendingApproval.toolCallId} approval={display.pendingApproval} onReply={async approved => { if (!feed) throw new Error(C.connecting); await feed.session.approveTool(display.pendingApproval!.toolCallId, approved); await feed.refresh() }} />}
      {display && Object.values(display.pendingSuspensions).map(suspension => <Question key={suspension.toolCallId} payload={suspension.suspendPayload} onAnswer={async answer => { if (!feed) throw new Error(C.connecting); await feed.session.respondToToolSuspension(suspension.toolCallId, answer); await feed.refresh() }} />)}
    </>} activePath={activePath} onClearActivePath={onClearActivePath} onJumpToLatest={stick.following ? undefined : () => { stick.jumpToLatest(); markVisibleRead() }} model={view.model} onSettings={onSettings} api={api} identity={identity} feed={feed} connected={connected} canStop={canStop} queued={display?.queuedFollowUps ?? 0} onActivity={onActivity} />
  </section>
}

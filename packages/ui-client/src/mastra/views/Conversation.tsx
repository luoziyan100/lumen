/**
 * [INPUT]: 原生 SessionFeed/DisplayState、原生reasoning/工具轮次投影与真实用户消息计时、子任务轮询、当前会话稿件路径与已有 AssistantContent 沙箱
 * [OUTPUT]: Conversation：原消息舞台与输入坞、折叠思考和轮次导航；白板写入只显示卡片（R6，点卡把元素交给白板；擦除卡没有可跳的元素；BoardCardRow 导出给新旧历史卡片的测试）并把「正在画/已写完」通过 onBoard 交给外壳；可复用精灵持有的原生 session，收起不确认已读、展开不重复订阅；运行错误保留，连接错误可重试；审批/追问与进行中的专家任务固定在输入卡上方(专家目录在右轨，对话底部始终是最新消息)，消息按坞高度让位；子任务轮询同一世代串行；滚动只在用户停留底部时追新；widget 回调稳定以保留历史消息 memo
 * [POS]: 新会话组合，不依赖旧 chat reducer；按身份 key 挂载以隔离草稿和迟到结果
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { errorText, useT } from '../../i18n/index.ts'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import { AssistantContent } from '../../components/widget/AssistantContent'
import { LumenApi, type ChildTask, type Identity, type DisplayState } from '../data/client.ts'
import { useSession } from '../data/useSession.ts'
import { messageRole, messageText } from '../data/feed.ts'
import { refreshConnection } from '../data/connection.ts'
import { UserMessage, MessageCopy } from './conversation/transcript/Message'
import { TurnRail } from './conversation/transcript/TurnRail'
import { messageAnchor, userContent } from './conversation/transcript/content'
import './conversation/transcript/transcript.css'
import { Composer } from './conversation/Composer'
import { createConversationProjection, turnStartedAt, type BoardCard } from './conversation/process/project'
import { ProcessRow, ThoughtRow, Waiting } from './conversation/process/Rows'
import { Question } from './conversation/question/Question'
import { workspaceLink, type FileTarget } from '../data/file-links'
import { useTranscriptStick } from './conversation/stick'

// --- 1.82 命令以 ack 返回未被认领的原因，不再静默成功 ---
function acknowledged(ack: { ok: boolean; reason?: string }) { if (!ack.ok) throw new Error(ack.reason ?? 'rejected') }
function stringify(value: unknown) { return typeof value === 'string' ? value : JSON.stringify(value, null, 2) }
function Approval({ approval, onReply }: { approval: DisplayState['pendingApprovals'][string]; onReply: (approved: boolean) => Promise<void> }) {
  const C = useT().chat
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  return <section className="mw-question"><strong>{C.approval}: {approval.toolName}</strong><pre>{stringify(approval.args)}</pre>{[true, false].map(approved => <Button disabled={busy} key={String(approved)} variant={approved ? 'primary' : 'ghost'} onClick={() => { setBusy(true); setError(''); void onReply(approved).catch(error => { setError(errorText(error)); setBusy(false) }) }}>{approved ? C.allow : C.deny}</Button>)}{error && <p role="alert">{error}</p>}</section>
}
/** 白板动态：哪块正在画（新块为 'new'），以及已完成写入的签名——变了就该重新取白板。 */
export interface BoardSignal { drawing: string | null; done: string }
export function BoardCardRow({ card, onFocus }: { card: BoardCard; onFocus?: (blockId: string) => void }) {
  const S = useT().studio
  const verb = card.status === 'failed' ? S.card.failed : card.running ? S.card.running[card.action] : S.card.done[card.action]
  const body = <><span className="board-card-verb">{verb}</span>{card.title && <> · <b>{card.title}</b></>}{card.error && <span className="board-card-error">{S.card.error(card.error)}</span>}</>
  return <div className={`board-card board-card-${card.status}`}>{card.blockId && onFocus && card.status !== 'failed' ? <button type="button" onClick={() => onFocus(card.blockId!)}>{body}</button> : <span>{body}</span>}</div>
}
export function Conversation({ api, identity, onActivity, onOpenFile, onSettings, activePath, onClearActivePath, onFocusBlock, onBoard, session: sharedSession }: { api: LumenApi; identity: Identity; onActivity: () => void; onOpenFile: (target: FileTarget) => void; onSettings?: () => void; activePath?: string | null; onClearActivePath?: () => void; onFocusBlock?: (blockId: string) => void; onBoard?: (signal: BoardSignal) => void; session?: ReturnType<typeof useSession> }) {
  const { chat: C, greeting } = useT()
  const localSession = useSession(api, sharedSession ? null : identity)
  const { feed, view } = sharedSession ?? localSession
  const [error, setError] = useState(''), [children, setChildren] = useState<ChildTask[]>([])
  const alive = useRef(true), priorRunning = useRef(false)
  const readAttempt = useRef<string | null>(null)
  const display = view.display, running = display?.isRunning ?? false
  const connected = view.connected && feed?.api === api
  const project = useMemo(createConversationProjection, [])
  const { timeline, turns } = useMemo(() => project(view.messages, display), [project, view.messages, display])
  const approvals = Object.values(display?.pendingApprovals ?? {})
  const suspended = Boolean(approvals.length || Object.keys(display?.pendingSuspensions ?? {}).length)
  const empty = !view.messages.length && !running
  // 进行中的专家任务挂输入坞上方；完成的专家目录在右轨，对话底部始终是最新消息
  const liveChildren = children.filter(child => ['pending', 'running', 'suspended'].includes(child.status))
  const canStop = running || suspended || Boolean(display?.queuedFollowUps) || liveChildren.length > 0
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
  }, [api, identity.topicId, identity.taskId, feed])
  const stick = useTranscriptStick(empty)
  // ---- 白板卡片的状态变化告诉外壳：开始画 → 显示「AI 正在画」；写完 → 重新取白板 ----
  const boardCards = timeline.filter((row): row is BoardCard => row.kind === 'board')
  const drawing = boardCards.find(card => card.running), drawingKey = drawing ? (drawing.blockId ?? 'new') : null
  const doneKey = boardCards.filter(card => card.status === 'completed').map(card => card.id).join(',')
  useEffect(() => { onBoard?.({ drawing: drawingKey, done: doneKey }) }, [drawingKey, doneKey, onBoard])
  useEffect(() => { if (priorRunning.current && !running) onActivity(); priorRunning.current = running }, [running, onActivity])
  const markVisibleRead = useCallback(() => {
    const id = view.lastStoredMessageId
    if (!id || id === readAttempt.current || !stick.followingNow.current || document.visibilityState !== 'visible' || !document.hasFocus()) return
    readAttempt.current = id
    void api.markSessionRead(identity, id).then(result => { if (alive.current && result.changed) onActivity() }).catch(() => { if (readAttempt.current === id) readAttempt.current = null })
  }, [api, identity.topicId, identity.taskId, view.lastStoredMessageId, onActivity, stick.followingNow])
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
      {empty && <div className="empty"><div className="empty-mark">{greeting(new Date().getHours())}</div></div>}
      {timeline.map(row => {
        if (row.kind === 'thought') return <ThoughtRow key={row.id} row={row} />
        if (row.kind === 'process') return <ProcessRow key={row.id} row={row} />
        if (row.kind === 'board') return <BoardCardRow key={row.id} card={row} onFocus={onFocusBlock} />
        const message = row.message
        return <article className={`msg-group msg-group-${messageRole(message)} mw-message mw-${messageRole(message)}`} key={row.id} id={messageAnchor(message.id)}>
        <div className={`bubble bubble-${messageRole(message)}`}>
        {messageRole(message) === 'assistant' ? <AssistantContent content={messageText(message)} isStreaming={running && display?.currentMessage?.id === message.id} onSendMessage={sendWidgetMessage} fixScope={`${identity.topicId}:${identity.taskId}`} /> : <UserMessage message={message} onOpenFile={onOpenFile} />}
        </div><MessageCopy user={messageRole(message) === 'user'} text={messageRole(message) === 'user' ? userContent(message).text : messageText(message)} />
      </article>})}
      {running && !suspended && !timeline.some(row => row.kind !== 'message' && row.running) && !display?.currentMessage?.content.parts.some(part => part.type === 'text' && part.text.trim()) && <Waiting startedAt={turnStartedAt(view.messages)} />}
      </div>
    </div>
    <TurnRail turns={turns} scroller={stick.transcript} onSelect={id => {
      const node = document.getElementById(messageAnchor(id)), root = stick.transcript.current
      if (!node || !root?.contains(node)) return
      stick.scrollToOffset(root.scrollTop + node.getBoundingClientRect().top - root.getBoundingClientRect().top - 24)
    }} />
    </div>
    <Composer prompt={<>
      {liveChildren.length > 0 && <section className="mw-children" aria-label={C.children}>{liveChildren.map(child => <div key={child.id}><span>{child.toolName} · {C.childStatus[child.status as keyof typeof C.childStatus] ?? child.status}</span><Button variant="ghost" onClick={() => { void api.cancelChild(identity, child.id).catch(showError) }}>{C.stopChild}</Button></div>)}</section>}
      {approvals.map(approval => <Approval key={approval.toolCallId} approval={approval} onReply={async approved => { if (!feed) throw new Error(C.connecting); acknowledged(await feed.session.approveTool(approval.toolCallId, approved)); await feed.refresh() }} />)}
      {display && Object.values(display.pendingSuspensions).map(suspension => <Question key={suspension.toolCallId} payload={suspension.suspendPayload} onAnswer={async answer => { if (!feed) throw new Error(C.connecting); acknowledged(await feed.session.respondToToolSuspension(suspension.toolCallId, answer)); await feed.refresh() }} />)}
    </>} activePath={activePath} onClearActivePath={onClearActivePath} onJumpToLatest={stick.following ? undefined : () => { stick.jumpToLatest(); markVisibleRead() }} model={view.model} onSettings={onSettings} api={api} identity={identity} feed={feed} connected={connected} canStop={canStop} queued={display?.queuedFollowUps ?? 0} onActivity={onActivity} />
  </section>
}

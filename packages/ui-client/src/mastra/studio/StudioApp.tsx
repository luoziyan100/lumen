/**
 * [INPUT]: the service connection, topic/session/board/material/reading data hooks, the one conversation feed (useSessionFeed, read through useFeedSelect), the sprite and reader, settings (specialists pane included), the appearance subscription, the newest takeaway (useSediment.newestTakeaway)
 * [OUTPUT]: StudioApp: the new shell — the prototype v7 skeleton: rounded panels with 8px gaps over the canvas (topics left, center, materials right, docked sprite), every panel's
 *           first row on one 50px header line; the center header holds only the centered view navigation (icon + text, icons alone when narrow; the topic name goes to aria-label and
 *           the window title), and in split view the reader header shares the board header's line; the sprite positions itself on the whole window (no longer inside the board area);
 *           both side panes collapse to width 0 (reopen buttons at the center header's ends, ⌘B / ⌘⌥B); the reader has three states: closed / split (draggable divider) / full center
 *           (the board hides but stays mounted with its camera; Esc restores); the Reading view (first in the navigation, the default) with its material action and selection window;
 *           the material on the empty Reading view's typewriter (the picked one, else the one open beside, else the only one) and the request's end (first section, run end, or an idle
 *           conversation that already answered: a short run can end unseen); each placeholder view is its object alone, centred, named 「还没开放」 for screen readers only
 *           (Map the cork board, Ideas the lamp, All the type case)
 * [POS]: the desktop's only workbench (it replaced the S2 transitional entry). It owns the topic's single conversation feed and lends it to the sprite, which reads the full view;
 *        the shell selects only the values it shows, so streamed text never re-renders the workbench. The sprite and the Reading view
 *        both post visible user messages on the native path (`say`), never a hidden prompt. Board and reading refresh ride only on the conversation's tool completion signals plus
 *        the running ETag fallback — no second event protocol
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { ExternalLinkGate } from '../../components/ExternalLinkDialog'
import { useAppearance } from '../../appearance'
import { useT } from '../../i18n/index.ts'
import { LumenApi, type Connection, type Identity, type SedimentInvite, type TopicMaterial } from '../data/client.ts'
import { useFeedSelect, useSessionFeed } from '../data/useSession.ts'
import { MODEL_TEXT } from '../../i18n/locales/model.ts'
import type { FileTarget } from '../data/file-links'
import type { BoardSignal } from '../views/Conversation'
import { DocumentReader } from '../views/reader/DocumentReader'
import { Settings } from '../views/Settings'
import { Board } from './Board'
import { Materials, useMaterials } from './Materials'
import { ReadingView, type AskTarget } from './Reading'
import { answered, askText, asksOf, latestReadingWrite, readingSignal, sameAsks, sendErrorText } from './reading-ask'
import { useReading, useTopicAsks } from './useReading'
import { Sprite, useSessions, type SpriteBox } from './Sprite'
import { Takeaways } from './Takeaways'
import { TopicPanel, useTopics } from './TopicPanel'
import { useBoard } from './useBoard'
import { IsoObject } from './objects/IsoObject'
import { corkSvg } from './objects/corkboard.ts'
import { lampSvg } from './objects/lamp.ts'
import { typecaseSvg } from './objects/typecase.ts'
import { newestTakeaway, useSediment } from './useSediment'
import { PaneToggle, Splitter, usePanes, type Side } from './Panes'
import { ViewNav, type View } from './ViewNav'
import '../views/workbench.css'
import './studio.css'

// The placeholder views' objects carry no data, so each is built once
const LATER_OBJECTS: Partial<Record<View, string>> = { map: corkSvg(), ideas: lampSvg(), all: typecaseSvg() }

const TOPIC_KEY = 'lumen.studio.topic'

export function StudioApp({ connection }: { connection: Connection }) {
  const S = useT().studio
  const api = useMemo(() => new LumenApi(connection), [connection.baseUrl, connection.token])
  const appearance = useAppearance()
  const [revision, setRevision] = useState(0)
  const activity = useCallback(() => setRevision(value => value + 1), [])
  const { topics, error: topicsError, edit: editTopics } = useTopics(api, revision)
  const [topicId, setTopicId] = useState<string | null>(() => { try { return localStorage.getItem(TOPIC_KEY) } catch { return null } })
  const topic = topics?.find(item => item.id === topicId) ?? null
  const [identity, setIdentity] = useState<Identity | null>(null)
  const { sessions, edit: editSessions } = useSessions(api, topic?.id ?? null, revision)
  const [view, setView] = useState<View>('reading')
  const [signal, setSignal] = useState<BoardSignal>({ drawing: null, done: '' })
  const [focus, setFocus] = useState<{ blockId: string; nonce: number } | null>(null)
  const [reading, setReading] = useState<{ target: FileTarget; title?: string } | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false), [docked, setDocked] = useState(false), [figure, setFigure] = useState<SpriteBox | null>(null)
  const [full, setFull] = useState(false), [center, setCenter] = useState<HTMLElement | null>(null)
  const panes = usePanes()
  const live = !!topic?.running
  const board = useBoard(api, topic?.id ?? null, `${signal.done}|${revision}`, live)
  const materials = useMaterials(api, topic?.id ?? null, `${signal.done}|${revision}`)
  // Deleted evidence links depend on board state: refetch whenever the board view changes version (a write, a sheet delete, another selection)
  const sediment = useSediment(api, topic?.id ?? null, `${signal.done}|${revision}|${board.view?.sheet.id ?? ''}|${board.view?.sheet.updatedAt ?? ''}`)
  // ---- The one conversation subscription: the sprite renders its full view; the shell selects only the values it shows, so a streamed token re-renders the sprite, not the workbench ----
  const feed = useSessionFeed(api, identity)
  const written = useFeedSelect(feed, view => readingSignal(view.messages))
  const latestWrite = useFeedSelect(feed, view => latestReadingWrite(view.messages), (a, b) => a?.callId === b?.callId && a?.itemId === b?.itemId)
  const isRunning = useFeedSelect(feed, view => !!view.display?.isRunning)
  const liveAsks = useFeedSelect(feed, view => feed ? asksOf(view.messages, feed.identity) : [], sameAsks)
  const [readingItem, setReadingItem] = useState<string | null>(null), [requested, setRequested] = useState<string | null>(null)
  const readings = useReading(api, topic?.id ?? null, readingItem, `${written}|${revision}`, live)
  const asks = useTopicAsks(api, topic?.id ?? null, sessions, identity, liveAsks)
  const running = live || isRunning
  // ---- Auto-focus the Reading stage when the AI lands a new reading_write / reading_insert in the live conversation (never on initial history hydration) ----
  const seenWrite = useRef<{ taskId: string | null; callId: string }>({ taskId: null, callId: '' })
  useEffect(() => {
    const taskId = identity?.taskId ?? null
    const callId = latestWrite?.callId ?? ''
    if (seenWrite.current.taskId !== taskId) {
      seenWrite.current = { taskId, callId }
      if (latestWrite && running) { setReadingItem(latestWrite.itemId); setView('reading') }
      return
    }
    if (latestWrite && callId !== seenWrite.current.callId) {
      seenWrite.current.callId = callId
      setReadingItem(latestWrite.itemId)
      setView('reading')
    }
  }, [identity?.taskId, latestWrite, running])
  // A requested reading stops showing "waiting" once the topic's run ends, whether or not a section landed. A short run can end before this view
  // ever sees it running (the topic's flag lags the send), so an idle conversation that already answered the request also ends it
  const wasRunning = useRef(false), requestText = useRef('')
  useEffect(() => { if (wasRunning.current && !running) setRequested(null); wasRunning.current = running }, [running])
  // Selected per frame like the shell's other conversation values; it reads the request text from a ref, which only changes together with a send (a new view follows)
  const replied = useFeedSelect(feed, view => !!requestText.current && answered(view.messages, requestText.current))
  useEffect(() => { if (requested && !running && replied) setRequested(null) }, [requested, running, replied])
  // ---- S9c: the selected sheet's invite (the question and pre-linked blocks above the full-board row) ----
  const [invite, setInvite] = useState<SedimentInvite | null>(null)
  useEffect(() => {
    if (!board.selected || sediment.unsupported) { setInvite(null); return }
    let active = true
    void api.sheetInvite(board.selected).then(result => { if (active) setInvite(result) }).catch(() => { if (active) setInvite(null) })
    return () => { active = false }
  }, [api, board.selected, sediment.unsupported, signal.done, revision])

  // ---- Topic pick: remember the last one; fall back to the first when unset or gone ----
  // A freshly created topic appears only on the next directory refresh and must not be displaced by "pick the first" meanwhile
  const created = useRef<string | null>(null)
  useEffect(() => {
    if (topic) { if (created.current === topic.id) created.current = null; return }
    if (!topics?.length || (topicId && topicId === created.current)) return
    setTopicId(topics[0]!.id)
  }, [topics, topic, topicId])
  useEffect(() => { try { if (topicId) localStorage.setItem(TOPIC_KEY, topicId) } catch { /* without storage the pick lasts this run only */ } }, [topicId])
  useEffect(() => { setIdentity(null); setReading(null); setFull(false); setFocus(null); setSignal({ drawing: null, done: '' }); setReadingItem(null); setRequested(null) }, [topicId])
  // ---- Busy topic with no open conversation: jump straight into the running/waiting one (R1: no new conversation alongside) ----
  useEffect(() => {
    if (identity || !topic || !(topic.running || topic.waiting)) return
    const active = sessions.find(session => session.running || session.waiting)
    if (active) setIdentity({ topicId: active.topicId, taskId: active.taskId })
  }, [identity, topic?.id, topic?.running, topic?.waiting, sessions])

  // ---- The topic name stays out of the center header (the left pane's selection already says it); it lives in aria-label and the window title ----
  useEffect(() => {
    const title = topic ? `${topic.title} — ${S.app}` : S.app
    document.title = title
    if (isTauri()) void invoke('set_window_title', { title }).catch(() => {})
  }, [topic?.title, S.app])

  // ---- In full view Esc returns to split; an Esc inside an input belongs to the input ----
  useEffect(() => {
    if (!full) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (event.key !== 'Escape' || event.defaultPrevented || (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]'))) return
      setFull(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [full])
  // ---- After toggling a pane the focus moves to the opposite toggle (the collapsed pane is inert and must not keep the focus) ----
  const flipped = useRef<Side | null>(null)
  const flip = (side: Side) => { flipped.current = side; panes.toggle(side) }
  useEffect(() => {
    const side = flipped.current, active = document.activeElement
    flipped.current = null
    if (!side || (active && active !== document.body && !active.closest('[inert]'))) return
    document.querySelector<HTMLElement>(`.app.studio .pane-toggle[data-pane="${side}"]:not([inert] *)`)?.focus()
  }, [panes.left, panes.right])

  const onBoard = useCallback((next: BoardSignal) => setSignal(previous => previous.drawing === next.drawing && previous.done === next.done ? previous : next), [])
  const onFocusBlock = useCallback((blockId: string) => { setView('board'); setFocus({ blockId, nonce: Date.now() }) }, [])
  // ---- Opening from a material or a source chip always enters split view ----
  const openMaterial = (item: TopicMaterial, page?: number) => { setFull(false); setReading({ target: { scope: 'library', path: item.id, ...(page ? { page } : {}) }, title: item.title }) }
  const openSource = (itemId: string, page?: number) => {
    const item = materials.items.find(material => material.id === itemId)
    setFull(false); setReading({ target: { scope: 'library', path: itemId, ...(page ? { page } : {}) }, title: item?.title })
  }
  // ---- Messages from the Reading view go where the person would type them: the given conversation, else the open one, else a new one ----
  /** Whether the conversation a message would go to is itself running or waiting (it would queue, not answer); another conversation's run is the service's 409 to tell */
  const busyFor = (to: Identity | null) => {
    const target = to ?? identity
    if (!target) return false
    if (target.taskId === identity?.taskId && isRunning) return true
    const info = sessions.find(item => item.taskId === target.taskId)
    return !!(info?.running || info?.waiting)
  }
  async function say(to: Identity | null, text: string): Promise<string | null> {
    if (!topic) return null
    const target = to ?? identity
    try {
      if (target && target.taskId === identity?.taskId && feed) await feed.send(text)
      else {
        const next = target ?? { topicId: topic.id, taskId: crypto.randomUUID() }
        if (!target) await api.open(next)
        await api.session(next).sendMessage(text)
        setIdentity(next)
      }
      activity()
      return null
    } catch (error) { return sendErrorText(error) }
  }
  async function writeReading(item: TopicMaterial): Promise<string | null> {
    setReadingItem(item.id); setView('reading')
    if (readings.items.some(reading => reading.itemId === item.id)) return null
    const text = MODEL_TEXT.writeReading(item.title, item.id), failure = await say(null, text)
    if (!failure) { requestText.current = text; setRequested(item.id) }
    return failure
  }
  // ---- The empty Reading view's typewriter shows the picked material's title, else the one open beside, else the only one ----
  const opened = reading?.target.scope === 'library' ? reading.target.path : null
  const startItem = materials.items.find(item => item.id === (readingItem ?? opened)) ?? (materials.items.length === 1 ? materials.items[0]! : null)
  const askReading = (target: AskTarget, words: string) => say(target.identity, askText(target.quote, target.section, readings.reading?.itemTitle ?? '', words))
  // The window keeps only the person's own words, through the takeaways' own route (R13); the quote never goes in
  async function keepWords(text: string): Promise<string | null> {
    if (!topic) return null
    try { await api.createSediment(topic.id, { text }); sediment.refresh(); return null } catch (error) { return error instanceof Error ? error.message : String(error) }
  }
  const reopenLeft = panes.left && <PaneToggle side="left" open={false} onToggle={() => flip('left')} className="head-lead" />
  const reopenRight = topic && panes.right && <PaneToggle side="right" open={false} onToggle={() => flip('right')} className="head-trail" />
  const split = topic && reading

  return <ExternalLinkGate><main className={`app studio${docked ? ' studio-docked' : ''}${topic ? '' : ' studio-no-topic'}${panes.left ? ' studio-left-collapsed' : ''}${panes.right ? ' studio-right-collapsed' : ''}`}>
    <TopicPanel api={api} topics={topics} error={topicsError} selected={topic?.id ?? null} takeaway={newestTakeaway(sediment.items, topic?.id ?? null)} collapsed={panes.left} onToggle={() => flip('left')} onSelect={setTopicId} onEdit={editTopics}
      onCreated={next => { created.current = next.id; setTopicId(next.id); activity() }} onSettings={() => setSettingsOpen(true)} />
    <section ref={setCenter} className={`studio-panel studio-center${split ? full ? ' studio-full' : ' studio-split' : ''}`} aria-label={topic?.title}
      style={{ '--split-ratio': panes.ratio } as CSSProperties}>
      <div className="studio-pane studio-board-pane">
        <header className="studio-head studio-center-head">
          {reopenLeft}
          {topic && <ViewNav view={view} onView={setView} />}
          {!split && reopenRight}
        </header>
        <div className="studio-stage">
          {!topic ? <div className="studio-later studio-pick"><p>{S.pickTopic}</p></div>
            : view === 'reading' ? <ReadingView state={readings} requested={!!requested && requested === readings.itemId} asks={asks} busyFor={busyFor}
              startItem={startItem}
              onSend={askReading} onWidgetSend={text => say(null, text)} onKeep={keepWords} onOpenSource={openSource} sprite={figure} />
            : view === 'board' ? <Board board={board} materials={materials.items} drawing={signal.drawing} focus={focus} onOpenSource={openSource} sediment={sediment} invite={invite} />
            : view === 'settled' ? <Takeaways sediment={sediment} onJump={(blockId, sheetId) => { setView('board'); board.select(sheetId); setFocus({ blockId, nonce: Date.now() }) }} />
            // A view not open yet is its object alone, centred; 「还没开放」 is the container's name for screen readers, never visible text
            : <div className="studio-later" role="img" aria-label={S.notOpen}>
              {LATER_OBJECTS[view] && <IsoObject markup={LATER_OBJECTS[view]} className="studio-later-object" />}
            </div>}
        </div>
      </div>
      {split && !full && <Splitter host={center} ratio={panes.ratio} onRatio={panes.setRatio} />}
      {split && <DocumentReader api={api} identity={identity} target={reading.target} title={reading.title} live={live} onClose={() => { setReading(null); setFull(false) }}
        onNavigate={target => setReading({ target })} full={full} onToggleFull={() => setFull(value => !value)} leading={full && reopenLeft} trailing={reopenRight} />}
    </section>
    {topic && <Materials api={api} topicId={topic.id} items={materials.items} error={materials.error} activeId={reading?.target.scope === 'library' ? reading.target.path : null}
      loaded={materials.loaded} collapsed={panes.right} onToggle={() => flip('right')}
      onOpen={item => openMaterial(item)} onChanged={materials.refresh}
      readings={readings.items.map(reading => reading.itemId)} readingBusy={busyFor(null)} onReading={writeReading} />}
    {topic && <Sprite api={api} topic={topic} identity={identity} feed={feed} sessions={sessions} onSessions={editSessions} onIdentity={setIdentity} onActivity={activity}
      onOpenFile={target => setReading({ target })} onFocusBlock={onFocusBlock} onBoard={onBoard} onSettings={() => setSettingsOpen(true)} onDocked={setDocked} onFigure={setFigure} />}
    {settingsOpen && <Settings api={api} appearance={appearance} onClose={() => setSettingsOpen(false)} />}
  </main></ExternalLinkGate>
}

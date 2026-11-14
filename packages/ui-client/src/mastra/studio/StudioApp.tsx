/**
 * [INPUT]: 服务连接、主题/会话/白板/材料数据钩子、精灵与阅读器、设置（含专家分页）、外观订阅
 * [OUTPUT]: StudioApp：新形态外壳——原型 v7 骨架：canvas 底上 8px 间距的圆角面板（左栏主题、中栏、右栏材料、停靠的精灵），每个面板首行 50px 头部同线；
 *           中栏头部只有按中线居中的视图导航（图标 + 文字，放不下只留图标；主题名进 aria-label 与窗口标题），分屏时阅读器头与白板头同一行；精灵自己定位在整个窗口上（不再挂进白板区）；
 *           左右栏可收起（宽 0，展开按钮在中栏头部两端，⌘B / ⌘⌥B）；阅读器三态：关闭 / 分屏（可拖分隔条）/ 铺满中栏（白板隐藏但保持挂载与相机，Esc 还原）
 * [POS]: 桌面唯一工作台（取代 S2 过渡入口）。白板刷新只靠对话里的白板工具完成信号 + 运行中 ETag 兜底，不另建事件协议
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { ExternalLinkGate } from '../../components/ExternalLinkDialog'
import { useAppearance } from '../../appearance'
import { STUDIO_COPY as S } from '../../copy/studioCopy'
import { LumenApi, type Connection, type Identity, type TopicMaterial } from '../data/client.ts'
import type { FileTarget } from '../data/file-links'
import type { BoardSignal } from '../views/Conversation'
import { DocumentReader } from '../views/reader/DocumentReader'
import { Settings } from '../views/Settings'
import { Board } from './Board'
import { Materials, useMaterials } from './Materials'
import { Sprite, useSessions } from './Sprite'
import { TopicPanel, useTopics } from './TopicPanel'
import { useBoard } from './useBoard'
import { PaneToggle, Splitter, usePanes, type Side } from './Panes'
import { ViewNav, type View } from './ViewNav'
import '../views/workbench.css'
import './studio.css'

const TOPIC_KEY = 'lumen.studio.topic'

export function StudioApp({ connection }: { connection: Connection }) {
  const api = useMemo(() => new LumenApi(connection), [connection.baseUrl, connection.token])
  const appearance = useAppearance()
  const [revision, setRevision] = useState(0)
  const activity = useCallback(() => setRevision(value => value + 1), [])
  const { topics, error: topicsError } = useTopics(api, revision)
  const [topicId, setTopicId] = useState<string | null>(() => { try { return localStorage.getItem(TOPIC_KEY) } catch { return null } })
  const topic = topics?.find(item => item.id === topicId) ?? null
  const [identity, setIdentity] = useState<Identity | null>(null)
  const { sessions } = useSessions(api, topic?.id ?? null, revision)
  const [view, setView] = useState<View>('board')
  const [signal, setSignal] = useState<BoardSignal>({ drawing: null, done: '' })
  const [focus, setFocus] = useState<{ blockId: string; nonce: number } | null>(null)
  const [reading, setReading] = useState<{ target: FileTarget; title?: string } | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false), [docked, setDocked] = useState(false)
  const [full, setFull] = useState(false), [center, setCenter] = useState<HTMLElement | null>(null)
  const panes = usePanes()
  const live = !!topic?.running
  const board = useBoard(api, topic?.id ?? null, `${signal.done}|${revision}`, live)
  const materials = useMaterials(api, topic?.id ?? null, `${signal.done}|${revision}`)

  // ---- 选主题：记住上次的；没选或已不存在就选第一个 ----
  // 刚建的主题要等下一次目录刷新才出现，期间不能被「选第一个」顶掉
  const created = useRef<string | null>(null)
  useEffect(() => {
    if (topic) { if (created.current === topic.id) created.current = null; return }
    if (!topics?.length || (topicId && topicId === created.current)) return
    setTopicId(topics[0]!.id)
  }, [topics, topic, topicId])
  useEffect(() => { try { if (topicId) localStorage.setItem(TOPIC_KEY, topicId) } catch { /* 仅本次有效 */ } }, [topicId])
  useEffect(() => { setIdentity(null); setReading(null); setFull(false); setFocus(null); setSignal({ drawing: null, done: '' }) }, [topicId])
  // ---- 主题忙且没开着对话：直接打开那段在运行或等你的对话（R1：不能另开新的） ----
  useEffect(() => {
    if (identity || !topic || !(topic.running || topic.waiting)) return
    const active = sessions.find(session => session.running || session.waiting)
    if (active) setIdentity({ topicId: active.topicId, taskId: active.taskId })
  }, [identity, topic?.id, topic?.running, topic?.waiting, sessions])

  // ---- 主题名不写在中栏头部（左栏选中项已经说明），留在 aria-label 与窗口标题 ----
  useEffect(() => {
    const title = topic ? `${topic.title} — ${S.app}` : S.app
    document.title = title
    if (isTauri()) void invoke('set_window_title', { title }).catch(() => {})
  }, [topic?.title])

  // ---- 铺满时 Esc 回到分屏；输入框里的 Esc 留给输入框 ----
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
  // ---- 点按钮收起/展开后，焦点落到对面那个按钮上（收起的栏是 inert，焦点不能留在里面） ----
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
  // ---- 从素材或出处签打开一律进分屏 ----
  const openMaterial = (item: TopicMaterial, page?: number) => { setFull(false); setReading({ target: { scope: 'library', path: item.id, ...(page ? { page } : {}) }, title: item.title }) }
  const openSource = (itemId: string, page?: number) => {
    const item = materials.items.find(material => material.id === itemId)
    setFull(false); setReading({ target: { scope: 'library', path: itemId, ...(page ? { page } : {}) }, title: item?.title })
  }
  const reopenLeft = panes.left && <PaneToggle side="left" open={false} onToggle={() => flip('left')} className="head-lead" />
  const reopenRight = topic && panes.right && <PaneToggle side="right" open={false} onToggle={() => flip('right')} className="head-trail" />
  const split = topic && reading

  return <ExternalLinkGate><main className={`app studio${docked ? ' studio-docked' : ''}${topic ? '' : ' studio-no-topic'}${panes.left ? ' studio-left-collapsed' : ''}${panes.right ? ' studio-right-collapsed' : ''}`}>
    <TopicPanel api={api} topics={topics} error={topicsError} selected={topic?.id ?? null} collapsed={panes.left} onToggle={() => flip('left')} onSelect={setTopicId}
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
            : view === 'board' ? <Board board={board} materials={materials.items} drawing={signal.drawing} focus={focus} onOpenSource={openSource} />
            : <div className="studio-later" role="status"><p>{S.views[view].available ? '' : S.views[view].later}</p></div>}
        </div>
      </div>
      {split && !full && <Splitter host={center} ratio={panes.ratio} onRatio={panes.setRatio} />}
      {split && <DocumentReader api={api} identity={identity} target={reading.target} title={reading.title} live={live} onClose={() => { setReading(null); setFull(false) }}
        onNavigate={target => setReading({ target })} full={full} onToggleFull={() => setFull(value => !value)} leading={full && reopenLeft} trailing={reopenRight} />}
    </section>
    {topic && <Materials api={api} topicId={topic.id} items={materials.items} error={materials.error} activeId={reading?.target.scope === 'library' ? reading.target.path : null}
      collapsed={panes.right} onToggle={() => flip('right')}
      onOpen={item => openMaterial(item)} onChanged={materials.refresh} />}
    {topic && <Sprite api={api} topic={topic} identity={identity} sessions={sessions} onIdentity={setIdentity} onActivity={activity}
      onOpenFile={target => setReading({ target })} onFocusBlock={onFocusBlock} onBoard={onBoard} onSettings={() => setSettingsOpen(true)} onDocked={setDocked} />}
    {settingsOpen && <Settings api={api} appearance={appearance} onClose={() => setSettingsOpen(false)} />}
  </main></ExternalLinkGate>
}

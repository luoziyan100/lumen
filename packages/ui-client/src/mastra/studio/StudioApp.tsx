/**
 * [INPUT]: 服务连接、主题/会话/白板/材料数据钩子、精灵与阅读器、设置与研究角色面板、外观订阅
 * [OUTPUT]: StudioApp：新形态外壳——左栏主题、中间视图标签（白板可用，其余如实占位）与原件分屏、右栏「这个主题用到的」、对话精灵
 * [POS]: 桌面唯一工作台（取代 S2 过渡入口）。白板刷新只靠对话里的白板工具完成信号 + 运行中 ETag 兜底，不另建事件协议
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLinkGate } from '../../components/ExternalLinkDialog'
import { useAppearance } from '../../appearance'
import { STUDIO_COPY as S } from '../../copy/studioCopy'
import { LumenApi, type Connection, type Identity, type TopicMaterial } from '../data/client.ts'
import type { FileTarget } from '../data/file-links'
import type { BoardSignal } from '../views/Conversation'
import { DocumentReader } from '../views/reader/DocumentReader'
import { Settings } from '../views/Settings'
import { Agents } from '../agents/Agents'
import { Board } from './Board'
import { Materials, useMaterials } from './Materials'
import { Sprite, useSessions } from './Sprite'
import { TopicPanel, useTopics } from './TopicPanel'
import { useBoard } from './useBoard'
import '../views/workbench.css'
import './studio.css'

type View = keyof typeof S.views
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
  const [settingsOpen, setSettingsOpen] = useState(false), [agentsOpen, setAgentsOpen] = useState(false), [docked, setDocked] = useState(false)
  const live = !!topic?.running
  const board = useBoard(api, topic?.id ?? null, `${signal.done}|${revision}`, live)
  const materials = useMaterials(api, topic?.id ?? null, `${signal.done}|${revision}`)

  // ---- 选主题：记住上次的；没选或已不存在就选第一个 ----
  useEffect(() => {
    if (!topics?.length || topic) return
    setTopicId(topics[0]!.id)
  }, [topics, topic])
  useEffect(() => { try { if (topicId) localStorage.setItem(TOPIC_KEY, topicId) } catch { /* 仅本次有效 */ } }, [topicId])
  useEffect(() => { setIdentity(null); setReading(null); setFocus(null); setSignal({ drawing: null, done: '' }) }, [topicId])
  // ---- 主题忙且没开着对话：直接打开那段在运行或等你的对话（R1：不能另开新的） ----
  useEffect(() => {
    if (identity || !topic || !(topic.running || topic.waiting)) return
    const active = sessions.find(session => session.running || session.waiting)
    if (active) setIdentity({ topicId: active.topicId, taskId: active.taskId })
  }, [identity, topic?.id, topic?.running, topic?.waiting, sessions])

  const onBoard = useCallback((next: BoardSignal) => setSignal(previous => previous.drawing === next.drawing && previous.done === next.done ? previous : next), [])
  const onFocusBlock = useCallback((blockId: string) => { setView('board'); setFocus({ blockId, nonce: Date.now() }) }, [])
  const openMaterial = (item: TopicMaterial, page?: number) => setReading({ target: { scope: 'library', path: item.id, ...(page ? { page } : {}) }, title: item.title })
  const openSource = (itemId: string, page?: number) => {
    const item = materials.items.find(material => material.id === itemId)
    setReading({ target: { scope: 'library', path: itemId, ...(page ? { page } : {}) }, title: item?.title })
  }

  return <ExternalLinkGate><main className={`app studio${docked ? ' studio-docked' : ''}${topic ? '' : ' studio-no-topic'}`}>
    <TopicPanel api={api} topics={topics} error={topicsError} selected={topic?.id ?? null} onSelect={setTopicId}
      onCreated={created => { setTopicId(created.id); activity() }} onSettings={() => setSettingsOpen(true)} onAgents={() => setAgentsOpen(true)} />
    <section className="studio-center">
      {topic ? <>
        <header className="studio-center-head">
          <h2 className="studio-topic-title">{topic.title}</h2>
          <nav className="studio-views" role="tablist" aria-label="视图">
            {(Object.keys(S.views) as View[]).map(key => <button type="button" role="tab" key={key} aria-selected={view === key} className={view === key ? 'on' : ''} onClick={() => setView(key)}>{S.views[key].label}</button>)}
          </nav>
        </header>
        <div className={`studio-stage${reading ? ' studio-split' : ''}`}>
          {view === 'board' ? <Board board={board} materials={materials.items} drawing={signal.drawing} focus={focus} onOpenSource={openSource} />
            : <div className="studio-later" role="status"><p>{S.views[view].available ? '' : S.views[view].later}</p></div>}
          {reading && <DocumentReader api={api} identity={identity} target={reading.target} title={reading.title} live={live} onClose={() => setReading(null)}
            onNavigate={target => setReading({ target })} />}
        </div>
      </> : <div className="mw-empty studio-pick"><p>{S.pickTopic}</p></div>}
    </section>
    {topic && <Materials api={api} topicId={topic.id} items={materials.items} error={materials.error} activeId={reading?.target.scope === 'library' ? reading.target.path : null}
      onOpen={item => openMaterial(item)} onChanged={materials.refresh} />}
    {topic && <Sprite api={api} topic={topic} identity={identity} sessions={sessions} onIdentity={setIdentity} onActivity={activity}
      onOpenFile={target => setReading({ target })} onFocusBlock={onFocusBlock} onBoard={onBoard} onSettings={() => setSettingsOpen(true)} onDocked={setDocked} />}
    {settingsOpen && <Settings api={api} appearance={appearance} onClose={() => setSettingsOpen(false)} />}
    {agentsOpen && <Agents api={api} onClose={() => setAgentsOpen(false)} />}
  </main></ExternalLinkGate>
}

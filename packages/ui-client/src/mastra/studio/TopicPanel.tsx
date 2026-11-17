/**
 * [INPUT]: LumenApi's topic directory (with the running/waiting projection), the external refresh signal; the current topic's newest takeaway; the box object and IsoObject
 * [OUTPUT]: useTopics: the topic list and its 3s poll (status lights must follow background runs); TopicPanel: the left pane — header 「主题 ＋ 收起」 (＋ opens an input at the list's
 *           top, Enter creates, Esc cancels; collapsed means width 0 and inert), status lights, only Settings at the bottom (specialists live inside settings); TakeawayBox: the 沉淀盒
 *           in the free space under the list, its front card the topic's newest takeaway in the person's own words
 * [POS]: the new shell's left pane; topics are the only entry, conversations switch inside the sprite. The box is absolutely placed, so showing or hiding it never moves the list;
 *        it shows only while the free height holds it with 16px of air above and below (a ResizeObserver on the scroller and the list's content)
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { useEffect, useLayoutEffect, useMemo, useState, type FormEvent } from 'react'
import { GearIcon, PlusIcon } from '../../components/icons'
import { useT } from '../../i18n/index.ts'
import { PaneToggle } from './Panes'
import type { LumenApi, SedimentEntry, Topic } from '../data/client.ts'
import { IsoObject } from './objects/IsoObject'
import { boxSvg, boxWords } from './objects/box.ts'

export function useTopics(api: LumenApi, signal: number) {
  const [topics, setTopics] = useState<Topic[] | null>(null), [error, setError] = useState('')
  useEffect(() => {
    let active = true, pending = false
    const read = () => {
      if (pending) return
      pending = true
      void api.topics().then(result => { if (active) { setTopics(result.items); setError('') } })
        .catch(error => { if (active) setError(error instanceof Error ? error.message : String(error)) })
        .finally(() => { pending = false })
    }
    read()
    const timer = window.setInterval(read, 3000)
    return () => { active = false; clearInterval(timer) }
  }, [api, signal])
  return { topics, error }
}

export function Light({ topic }: { topic: Pick<Topic, 'running' | 'waiting'> }) {
  const S = useT().studio
  if (topic.waiting) return <span className="topic-light topic-light-waiting" role="img" aria-label={S.light.waiting} title={S.light.waiting} />
  if (topic.running) return <span className="topic-light topic-light-running" role="img" aria-label={S.light.running} title={S.light.running} />
  return null
}

// The box at 200px wide over its 320×300 viewBox, and the air it needs above and below
const BOX_W = 200, BOX_H = BOX_W * 300 / 320, AIR = 16

/** The takeaway date as the card's stamp, MM-DD in local time */
const stampDate = (iso: string) => { const d = new Date(iso); return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

function TakeawayBox({ scroll, content, takeaway }: { scroll: HTMLElement | null; content: HTMLElement | null; takeaway: SedimentEntry | null }) {
  const { studio: S } = useT()
  const [fits, setFits] = useState(false)
  useLayoutEffect(() => {
    if (!scroll || !content) return
    const measure = () => {
      const pad = parseFloat(getComputedStyle(scroll).paddingTop) || 0
      setFits(scroll.clientHeight - pad - content.offsetHeight >= BOX_H + 2 * AIR)
    }
    measure()
    const resize = new ResizeObserver(measure)
    resize.observe(scroll); resize.observe(content)
    return () => resize.disconnect()
  }, [scroll, content])
  const text = takeaway?.text ?? '', stamp = takeaway ? S.objects.box.stamp(stampDate(takeaway.createdAt)) : ''
  const markup = useMemo(() => boxSvg({ labels: S.objects.box, words: boxWords(text, stamp) }), [S.objects.box, text, stamp])
  return fits ? <IsoObject markup={markup} className="topics-box" /> : null
}

export function TopicPanel({ api, topics, error, selected, takeaway, collapsed, onToggle, onSelect, onCreated, onSettings }: {
  api: LumenApi
  topics: Topic[] | null
  error: string
  selected: string | null
  /** The selected topic's newest takeaway, shown on the box's front card */
  takeaway: SedimentEntry | null
  collapsed: boolean
  onToggle: () => void
  onSelect: (topicId: string) => void
  onCreated: (topic: Topic) => void
  onSettings: () => void
}) {
  const { studio: S, common: C } = useT()
  const [adding, setAdding] = useState(false), [title, setTitle] = useState(''), [busy, setBusy] = useState(false), [createError, setCreateError] = useState('')
  const [scroll, setScroll] = useState<HTMLDivElement | null>(null), [content, setContent] = useState<HTMLDivElement | null>(null)
  function close() { setAdding(false); setTitle(''); setCreateError('') }
  async function create(event: FormEvent) {
    event.preventDefault()
    if (!title.trim() || busy) return
    setBusy(true); setCreateError('')
    try { const topic = await api.createTopic(title.trim()); close(); onCreated(topic) }
    catch (error) { setCreateError(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  return <nav className={`studio-panel studio-topics${collapsed ? ' is-collapsed' : ''}`} id="studio-topics" aria-label={S.topics} inert={collapsed}>
    <header className="studio-head"><h2 className="studio-head-title">{S.topics}</h2><span className="studio-sp" />
      <button type="button" className="icon-btn" aria-label={S.newTopic} title={S.newTopic} aria-expanded={adding} onClick={() => adding ? close() : setAdding(true)}><PlusIcon /></button>
      <PaneToggle side="left" open onToggle={onToggle} />
    </header>
    <div className="topics-body"><div ref={setScroll} className="studio-scroll"><div ref={setContent} className="topics-content">
      {adding && <form className="topics-new" onSubmit={event => void create(event)}>
        <input className="studio-field" autoFocus aria-label={S.newTopic} placeholder={S.newTopicPlaceholder} title={S.cancel} value={title} disabled={busy}
          onChange={event => setTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') close() }} />
      </form>}
      {(error || createError) && <p className="mw-error studio-note" role="alert">{createError || error}</p>}
      {topics === null ? !error && <p className="studio-note" role="status">{C.reading}</p> : !topics.length && !adding && <p className="studio-note">{S.noTopics}</p>}
      <ul className="topics-list">{topics?.map(topic => <li key={topic.id}>
        <button type="button" className={`studio-item topic${topic.id === selected ? ' on' : ''}`} aria-current={topic.id === selected ? 'page' : undefined} onClick={() => onSelect(topic.id)}>
          <span className="topic-title">{topic.title}</span><Light topic={topic} />
        </button>
      </li>)}</ul>
    </div></div><TakeawayBox scroll={scroll} content={content} takeaway={takeaway} /></div>
    <footer className="studio-foot">
      <button type="button" className="studio-item" onClick={onSettings}><GearIcon size={16} /><span>{S.settings}</span></button>
    </footer>
  </nav>
}

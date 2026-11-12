/**
 * [INPUT]: LumenApi 的主题目录（含运行/等你投影）、外部刷新信号
 * [OUTPUT]: useTopics：主题列表与 3 秒轮询（状态灯要跟上后台运行）；TopicPanel：左栏面板——头部「主题 ＋」（点＋在列表顶出输入框，回车建、Esc 取消）、状态灯、底部同一行的研究角色与设置
 * [POS]: 新外壳的左栏；主题是唯一的入口，对话在精灵里切换
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useState, type FormEvent } from 'react'
import { AccountIcon, GearIcon, PlusIcon } from '../../components/icons'
import { STUDIO_COPY as S } from '../../copy/studioCopy'
import { MASTRA_COPY as C } from '../../copy/mastraCopy'
import type { LumenApi, Topic } from '../data/client.ts'

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
  if (topic.waiting) return <span className="topic-light topic-light-waiting" role="img" aria-label={S.light.waiting} title={S.light.waiting} />
  if (topic.running) return <span className="topic-light topic-light-running" role="img" aria-label={S.light.running} title={S.light.running} />
  return null
}

export function TopicPanel({ api, topics, error, selected, onSelect, onCreated, onSettings, onAgents }: {
  api: LumenApi
  topics: Topic[] | null
  error: string
  selected: string | null
  onSelect: (topicId: string) => void
  onCreated: (topic: Topic) => void
  onSettings: () => void
  onAgents: () => void
}) {
  const [adding, setAdding] = useState(false), [title, setTitle] = useState(''), [busy, setBusy] = useState(false), [createError, setCreateError] = useState('')
  function close() { setAdding(false); setTitle(''); setCreateError('') }
  async function create(event: FormEvent) {
    event.preventDefault()
    if (!title.trim() || busy) return
    setBusy(true); setCreateError('')
    try { const topic = await api.createTopic(title.trim()); close(); onCreated(topic) }
    catch (error) { setCreateError(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  return <nav className="studio-panel studio-topics" aria-label={S.topics}>
    <header className="studio-head"><h2 className="studio-head-title">{S.topics}</h2><span className="studio-sp" />
      <button type="button" className="icon-btn" aria-label={S.newTopic} title={S.newTopic} aria-expanded={adding} onClick={() => adding ? close() : setAdding(true)}><PlusIcon /></button>
    </header>
    <div className="studio-scroll">
      {adding && <form className="topics-new" onSubmit={event => void create(event)}>
        <input className="studio-field" autoFocus aria-label={S.newTopic} placeholder={S.newTopicPlaceholder} title={S.cancel} value={title} disabled={busy}
          onChange={event => setTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') close() }} />
      </form>}
      {(error || createError) && <p className="mw-error studio-note" role="alert">{createError || error}</p>}
      {topics === null ? !error && <p className="studio-note" role="status">{C.loading}</p> : !topics.length && !adding && <p className="studio-note">{S.noTopics}</p>}
      <ul className="topics-list">{topics?.map(topic => <li key={topic.id}>
        <button type="button" className={`studio-item topic${topic.id === selected ? ' on' : ''}`} aria-current={topic.id === selected ? 'page' : undefined} onClick={() => onSelect(topic.id)}>
          <span className="topic-title">{topic.title}</span><Light topic={topic} />
        </button>
      </li>)}</ul>
    </div>
    <footer className="studio-foot">
      <button type="button" className="studio-item" onClick={onAgents}><AccountIcon size={16} /><span>{S.agents}</span></button>
      <button type="button" className="studio-item" onClick={onSettings}><GearIcon size={16} /><span>{S.settings}</span></button>
    </footer>
  </nav>
}

/**
 * [INPUT]: LumenApi 的主题目录（含运行/等你投影）、外部刷新信号
 * [OUTPUT]: useTopics：主题列表与 3 秒轮询（状态灯要跟上后台运行）；TopicPanel：左栏主题列表、状态灯、新建主题、设置与研究角色入口
 * [POS]: 新外壳的左栏；主题是唯一的入口，对话在精灵里切换
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import { Input } from '@cloudflare/kumo/components/input'
import { GearIcon } from '../../components/icons'
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
  const [title, setTitle] = useState(''), [busy, setBusy] = useState(false), [createError, setCreateError] = useState('')
  async function create(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    setBusy(true); setCreateError('')
    try { const topic = await api.createTopic(title.trim()); setTitle(''); onCreated(topic) }
    catch (error) { setCreateError(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  return <nav className="studio-topics" aria-label={S.topics}>
    <header className="topics-head"><span className="brand">{C.brand}</span></header>
    <form className="topics-new" onSubmit={event => void create(event)}>
      <Input aria-label={S.newTopic} placeholder={S.newTopicPlaceholder} value={title} onChange={event => setTitle(event.target.value)} />
      <Button type="submit" variant="secondary" disabled={busy || !title.trim()}>{S.create}</Button>
    </form>
    {(error || createError) && <p className="mw-error" role="alert">{createError || error}</p>}
    {topics === null ? !error && <p role="status">{C.loading}</p> : !topics.length && <p className="topics-none">{S.noTopics}</p>}
    <ul className="topics-list">{topics?.map(topic => <li key={topic.id}>
      <button type="button" className={`topic${topic.id === selected ? ' on' : ''}`} aria-current={topic.id === selected ? 'page' : undefined} onClick={() => onSelect(topic.id)}>
        <span className="topic-title">{topic.title}</span><Light topic={topic} />
      </button>
    </li>)}</ul>
    <footer className="topics-foot">
      <Button variant="ghost" onClick={onAgents}>{S.agents}</Button>
      <button type="button" className="icon-btn" aria-label={S.settings} title={S.settings} onClick={onSettings}><GearIcon /></button>
    </footer>
  </nav>
}

/**
 * [INPUT]: LumenApi 的主题/会话目录、Welcome/Conversation/Files 复用件、设置与角色面板、外观订阅
 * [OUTPUT]: TopicsEntry：S2–S3 过渡入口——列出真实主题、新建主题、打开或新开一段对话
 * [POS]: 只为让服务在白板外壳到来前可用；不画白板、不放假数据。S4 由 StudioApp 取代并整体退场
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import { Input } from '@cloudflare/kumo/components/input'
import { ExternalLinkGate } from '../../components/ExternalLinkDialog'
import { useAppearance } from '../../appearance'
import { MASTRA_COPY as C } from '../../copy/mastraCopy'
import { LumenApi, type Connection, type Identity, type SessionInfo, type Topic } from '../data/client.ts'
import type { FileTarget } from '../data/file-links'
import { Conversation } from './Conversation'
import { Welcome } from './conversation/welcome/Welcome'
import { Files, useWorkspace } from './Files'
import { Settings } from './Settings'
import { Agents } from '../agents/Agents'
import './workbench.css'

export function TopicsEntry({ connection }: { connection: Connection }) {
  const api = useMemo(() => new LumenApi(connection), [connection.baseUrl, connection.token])
  const appearance = useAppearance()
  const [topics, setTopics] = useState<Topic[] | null>(null), [topicId, setTopicId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionInfo[]>([]), [identity, setIdentity] = useState<Identity | null>(null)
  const [title, setTitle] = useState(''), [error, setError] = useState(''), [revision, setRevision] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false), [agentsOpen, setAgentsOpen] = useState(false)
  const [filesOpen, setFilesOpen] = useState(false), [fileTarget, setFileTarget] = useState<FileTarget | null>(null)
  const activity = useCallback(() => setRevision(value => value + 1), [])
  const workspace = useWorkspace(api, identity, revision)

  useEffect(() => {
    let active = true
    void api.topics().then(result => { if (active) { setTopics(result.items); setError('') } }).catch(error => { if (active) setError(String(error)) })
    return () => { active = false }
  }, [api, revision])
  useEffect(() => {
    if (!topicId) { setSessions([]); return }
    let active = true
    void api.sessions(topicId).then(result => { if (active) setSessions(result.items) }).catch(error => { if (active) setError(String(error)) })
    return () => { active = false }
  }, [api, topicId, revision])
  useEffect(() => { setFilesOpen(false); setFileTarget(null) }, [identity?.topicId, identity?.taskId])

  async function createTopic(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    try { const topic = await api.createTopic(title.trim()); setTitle(''); setTopicId(topic.id); setIdentity(null); activity() }
    catch (error) { setError(String(error)) }
  }
  const topic = topics?.find(item => item.id === topicId)
  return <ExternalLinkGate><main className="app mw-app">
    <header className="titlebar"><div className="tb-left"><span className="brand">{C.brand}</span></div>
      <nav className="titlebar-actions"><Button variant="ghost" onClick={() => setAgentsOpen(true)}>研究角色</Button><Button variant="ghost" onClick={() => setSettingsOpen(true)}>{C.settings}</Button>
        {identity && <Button variant="ghost" aria-expanded={filesOpen} onClick={() => setFilesOpen(value => !value)}>{filesOpen ? '收起工作区' : '工作区'}</Button>}</nav>
    </header>
    <div className="body mw-body">
      <nav className="studio-entry-nav" aria-label="主题">
        <p className="studio-entry-note">过渡入口：白板工作台将在 S4 接入。</p>
        <form onSubmit={event => void createTopic(event)}><Input aria-label="新主题名称" placeholder="新主题" value={title} onChange={event => setTitle(event.target.value)} /><Button type="submit" disabled={!title.trim()}>新建主题</Button></form>
        {topics === null ? !error && <p role="status">{C.loading}</p> : !topics.length && <p>还没有主题</p>}
        <ul>{topics?.map(item => <li key={item.id}><Button variant={item.id === topicId ? 'secondary' : 'ghost'} onClick={() => { setTopicId(item.id); setIdentity(null) }}>{item.title}{item.running ? ' · 运行中' : item.waiting ? ' · 等你' : ''}</Button>
          {item.id === topicId && <ul>
            <li><Button variant={identity ? 'ghost' : 'secondary'} onClick={() => setIdentity(null)}>新对话</Button></li>
            {sessions.map(session => <li key={session.taskId}><Button variant={identity?.taskId === session.taskId ? 'secondary' : 'ghost'} onClick={() => setIdentity({ topicId: session.topicId, taskId: session.taskId })}>{session.title}{session.unread ? ' ·' : ''}</Button></li>)}
          </ul>}
        </li>)}</ul>
      </nav>
      <section className={`chat mw-center${filesOpen ? ' chat-with-reader' : ''}${!identity ? ' chat-empty' : ''}`}>
        {error && <div className="mw-error" role="alert">{error}</div>}
        {identity ? <Conversation key={`${identity.topicId}:${identity.taskId}`} api={api} identity={identity} onActivity={activity} onSettings={() => setSettingsOpen(true)} onOpenFile={target => { setFileTarget(target); setFilesOpen(true) }} />
          : topic && !topic.archived ? <Welcome key={`${api.connection.baseUrl}:${topic.id}`} api={api} topicId={topic.id} onSettings={() => setSettingsOpen(true)} onSession={next => { setIdentity(next); activity() }} />
          : <div className="mw-empty"><p>选择或新建一个主题。</p></div>}
      </section>
      {identity && filesOpen && <Files key={`${identity.topicId}:${identity.taskId}`} api={api} identity={identity} revision={revision} workspace={workspace} target={fileTarget} onActivity={activity} onClose={() => { setFilesOpen(false); setFileTarget(null) }} />}
    </div>
    {settingsOpen && <Settings api={api} appearance={appearance} onClose={() => setSettingsOpen(false)} />}
    {agentsOpen && <Agents api={api} onClose={() => setAgentsOpen(false)} />}
  </main></ExternalLinkGate>
}

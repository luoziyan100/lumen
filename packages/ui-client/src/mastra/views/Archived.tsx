/**
 * [INPUT]: LumenApi's archived listing, unarchive (the topic and session PATCH) and delete; RemoveDialog from studio/RowActions; Kumo Button; the settings.archived catalog
 * [OUTPUT]: ArchivedPane: Settings › Archived (U7) — two short lists, topics and conversations (each with its topic's title), newest first; each row has Unarchive and Delete
 *           (the same one confirmation as the row menu); an empty list says 「还没有」 and nothing else
 * [POS]: the only place archived things show (R19: no 「已归档」 group in any list). One read of GET /lumen/archived; the main lists catch up on their next poll
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { useEffect, useState } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import { errorText, useT } from '../../i18n/index.ts'
import { RemoveDialog, type RowKind } from '../studio/RowActions'
import type { ArchivedSession, LumenApi, Topic } from '../data/client.ts'

interface Removal { kind: RowKind; name: string; run: () => Promise<unknown> }

export function ArchivedPane({ api }: { api: LumenApi }) {
  const { settings: { archived: A }, common, studio: { sprite } } = useT()
  const [lists, setLists] = useState<{ topics: Topic[]; sessions: ArchivedSession[] } | null>(null), [error, setError] = useState(''), [removal, setRemoval] = useState<Removal | null>(null)
  const load = () => api.archived().then(setLists)
  useEffect(() => {
    let active = true
    void api.archived().then(result => { if (active) setLists(result) }).catch(cause => { if (active) setError(errorText(cause)) })
    return () => { active = false }
  }, [api])
  async function act(work: () => Promise<unknown>) {
    setError('')
    try { await work(); await load() } catch (cause) { setError(errorText(cause)) }
  }
  if (!lists) return error ? <p className="mw-error" role="alert">{error}</p> : <p className="set-hint">{common.loading}</p>
  const row = (key: string, title: string, topicTitle: string | null, unarchive: () => Promise<unknown>, remove: Removal) => <li key={key} className="habits-row archived-row">
    <span className="archived-title">{title}</span>{topicTitle !== null && <span className="archived-topic">{topicTitle}</span>}
    <Button variant="ghost" size="sm" onClick={() => void act(unarchive)}>{A.unarchive}</Button>
    <Button variant="ghost" size="sm" className="archived-remove" onClick={() => setRemoval(remove)}>{A.remove}</Button>
  </li>
  return <div className="habits-pane archived-pane">
    <h2 className="settings-h">{A.title}</h2>
    <h3 className="archived-h">{A.topics}</h3>
    {lists.topics.length === 0 ? <p className="set-hint">{A.none}</p> : <ul className="habits-list">{lists.topics.map(topic => row(topic.id, topic.title, null,
      () => api.updateTopic(topic.id, { archived: false }), { kind: 'topic', name: topic.title, run: () => api.deleteTopic(topic.id) }))}</ul>}
    <h3 className="archived-h">{A.sessions}</h3>
    {lists.sessions.length === 0 ? <p className="set-hint">{A.none}</p> : <ul className="habits-list">{lists.sessions.map(session => {
      const identity = { topicId: session.topicId, taskId: session.taskId }, title = session.title ?? sprite.untitled
      return row(session.resourceId, title, session.topicTitle, () => api.updateSession(identity, { archived: false }), { kind: 'session', name: title, run: () => api.deleteSession(identity) })
    })}</ul>}
    {error && <p className="mw-error" role="alert">{error}</p>}
    {removal && <RemoveDialog kind={removal.kind} name={removal.name} onCancel={() => setRemoval(null)} onConfirm={async () => { await act(removal.run); setRemoval(null) }} />}
  </div>
}

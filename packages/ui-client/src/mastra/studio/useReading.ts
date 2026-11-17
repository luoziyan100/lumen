/**
 * [INPUT]: LumenApi's reading list and ETag reading read, each conversation's stored history (read only, no subscription), the shared session's live messages, the refresh signal and the running state
 * [OUTPUT]: useReading: the topic's reading list, the reading shown (the picked material, else the newest reading), whether a write was asked for, errors and refresh;
 *           useTopicAsks: every question asked from a reading in this topic, rebuilt from conversation messages (the open conversation live, the others from their stored history)
 * [POS]: the Reading view's data. Refresh rides the conversation's reading_write completions plus a 5-second list/ETag fallback only while the topic runs — the board's rule, no new protocol
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MastraDBMessage } from '@mastra/client-js'
import type { Identity, LumenApi, Reading, ReadingSummary, SessionInfo } from '../data/client.ts'
import { asksOf, type Ask } from './reading-ask.ts'

export interface ReadingState {
  items: ReadingSummary[]
  /** The material whose reading is shown (null: none picked and no reading yet) */
  itemId: string | null
  reading: Reading | null
  error: string
  refresh: () => void
}

export function useReading(api: LumenApi, topicId: string | null, picked: string | null, signal: string, live: boolean): ReadingState {
  const [items, setItems] = useState<ReadingSummary[]>([]), [reading, setReading] = useState<Reading | null>(null)
  const [error, setError] = useState(''), [tick, setTick] = useState(0)
  const etag = useRef<{ item: string; etag: string | null } | null>(null)
  useEffect(() => { setItems([]); setReading(null); setError(''); etag.current = null }, [api, topicId])

  useEffect(() => {
    if (!topicId) return
    let active = true
    const load = () => void api.readings(topicId).then(result => { if (active) { setItems(result); setError('') } })
      .catch(error => { if (active) setError(error instanceof Error ? error.message : String(error)) })
    load()
    const timer = live ? window.setInterval(load, 5000) : undefined
    return () => { active = false; if (timer !== undefined) clearInterval(timer) }
  }, [api, topicId, signal, tick, live])

  const itemId = picked ?? items[0]?.itemId ?? null
  // Refetch the shown reading when the list says it changed (a new section lands as a new updatedAt)
  const stamp = items.find(item => item.itemId === itemId)?.updatedAt ?? ''
  useEffect(() => {
    if (!topicId || !itemId) { setReading(null); return }
    let active = true
    const previous = etag.current?.item === itemId ? etag.current.etag : null
    void api.readingVersion(topicId, itemId, previous).then(result => {
      if (!active) return
      etag.current = { item: itemId, etag: result.etag }
      if (result.missing) setReading(null)
      else if (result.reading) setReading(result.reading)
      setError('')
    }).catch(error => { if (active) setError(error instanceof Error ? error.message : String(error)) })
    return () => { active = false }
  }, [api, topicId, itemId, stamp, signal, tick])

  return { items, itemId, reading: reading?.itemId === itemId ? reading : null, error, refresh: () => setTick(value => value + 1) }
}

/** Questions from every conversation of the topic. Closed conversations are read once per change of their last message; the open one comes live from the shared subscription. */
export function useTopicAsks(api: LumenApi, topicId: string | null, sessions: SessionInfo[], open: Identity | null, live: MastraDBMessage[]): Ask[] {
  const [stored, setStored] = useState<Ask[]>([])
  const others = sessions.filter(session => session.topicId === topicId && session.taskId !== open?.taskId)
  const key = others.map(session => `${session.taskId}:${session.lastMessageId ?? ''}`).join('|')
  useEffect(() => {
    if (!topicId) { setStored([]); return }
    let active = true
    void Promise.all(others.map(async session => {
      const identity = { topicId: session.topicId, taskId: session.taskId }
      const messages: MastraDBMessage[] = []
      for (let page = 0; page < 20; page++) {
        const result = await api.session(identity).listMessages(`${session.topicId}:${session.taskId}`, { page, perPage: 200, orderBy: { field: 'createdAt', direction: 'ASC' } })
        messages.push(...result.messages)
        if (!result.hasMore) break
      }
      return asksOf(messages, identity)
    })).then(all => { if (active) setStored(all.flat()) }).catch(() => { /* footprints are a convenience; the reading stays readable without them */ })
    return () => { active = false }
  }, [api, topicId, key])
  return useMemo(() => [...stored, ...(open ? asksOf(live, open) : [])].sort((a, b) => a.createdAt - b.createdAt), [stored, open?.topicId, open?.taskId, live])
}

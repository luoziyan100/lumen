/**
 * [INPUT]: LumenApi's sediment endpoints (entries/offers/invites), the external refresh signal, the board view (revs when linking evidence and conflict recovery)
 * [OUTPUT]: newestTakeaway (the topic's most recently written entry, for the sidebar box's front card); useSediment: loads entries (newest first) and pending offers; create/confirm/dismiss/edit/remove actions and their errors (an older service without the routes marks
 *           unsupported and the view shows the clean line); the revConflict flag lets the composer keep the typed line and reload the board (S10)
 * [POS]: the UI's single sediment data source; writes go only through user HTTP (R13), and an offer's fragments restore one by one before the confirm (S9)
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { useCallback, useEffect, useState } from 'react'
import type { LumenApi, SedimentEntry, SedimentOffer } from '../data/client.ts'
import { t } from '../../i18n/index.ts'

export type SedimentFailure = { code: string; message: string } | null

/** The topic's most recently written takeaway (by createdAt; an edit does not make an entry newer); entries of another topic never count */
export function newestTakeaway(items: SedimentEntry[], topicId: string | null): SedimentEntry | null {
  let newest: SedimentEntry | null = null
  for (const item of items) if (item.topicId === topicId && (!newest || item.createdAt > newest.createdAt || (item.createdAt === newest.createdAt && item.id > newest.id))) newest = item
  return newest
}

export interface SedimentState {
  items: SedimentEntry[]
  offers: SedimentOffer[]
  /** true: the service predates the sediment routes; the view shows the old-service line */
  unsupported: boolean
  error: string
  revConflict: boolean
  refresh: () => void
  create: (input: { text: string; blocks?: { id: string; rev: number }[] }) => Promise<boolean>
  confirm: (offerId: string, text: string) => Promise<boolean>
  dismiss: (offerId: string) => Promise<void>
  edit: (entryId: string, text: string) => Promise<boolean>
  remove: (entryId: string) => Promise<boolean>
}

export function useSediment(api: LumenApi, topicId: string | null, signal: string): SedimentState {
  const [items, setItems] = useState<SedimentEntry[]>([]), [offers, setOffers] = useState<SedimentOffer[]>([])
  const [unsupported, setUnsupported] = useState(false), [error, setError] = useState(''), [revConflict, setRevConflict] = useState(false)
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick(value => value + 1), [])

  useEffect(() => { setItems([]); setOffers([]); setUnsupported(false); setError(''); setRevConflict(false) }, [api, topicId])

  useEffect(() => {
    if (!topicId) return
    let active = true
    void api.sediment(topicId).then(result => {
      if (!active) return
      if (!result) { setUnsupported(true); return }
      setItems(result.items); setOffers(result.offers); setUnsupported(false); setError('')
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : String(cause)) })
    return () => { active = false }
  }, [api, topicId, signal, tick])

  /** A failed write keeps its reason; a rev conflict (S10) additionally raises the flag so the caller can keep the typed line. */
  const fail = (cause: unknown) => {
    const detail = cause as { status?: number; detail?: { code?: string } } | null
    const code = detail?.detail?.code ?? ''
    setError((cause instanceof Error ? cause.message : String(cause)))
    setRevConflict(code === 'sediment.link_stale')
    return false
  }

  return {
    items, offers, unsupported, error, revConflict, refresh,
    async create(input) {
      if (!topicId) return false
      try { await api.createSediment(topicId, input); setError(''); setRevConflict(false); refresh(); return true } catch (cause) { return fail(cause) }
    },
    async confirm(offerId, text) {
      if (!topicId) return false
      try { await api.createSediment(topicId, { offerId, text }); setError(''); setRevConflict(false); refresh(); return true } catch (cause) { return fail(cause) }
    },
    async dismiss(offerId) {
      if (!topicId) return
      try { await api.dismissOffer(topicId, offerId); setError(''); refresh() } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    },
    async edit(entryId, text) {
      if (!topicId) return false
      try { await api.editSediment(topicId, entryId, text); setError(''); refresh(); return true } catch (cause) { return fail(cause) }
    },
    async remove(entryId) {
      if (!topicId) return false
      try { await api.deleteSediment(topicId, entryId); setError(''); refresh(); return true } catch (cause) { return fail(cause) }
    },
  }
}

/** The composer's failure line: the rev conflict gets its own sentence (S10). */
export function sedimentError(state: SedimentState): string {
  return state.revConflict ? t().studio.sediment.linkStale : state.error
}

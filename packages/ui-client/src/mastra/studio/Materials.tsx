/**
 * [INPUT]: LumenApi's topic materials, upload and unreference; the refresh signal; which materials already have a reading in this topic and whether a message can go out now
 * [OUTPUT]: Materials: the right pane 「素材 / Materials」. The header holds the title, upload (paperclip, multiple files, disabled and lit while uploading) and collapse; one plain
 *           search field (filters as you type, Esc clears, says so when nothing matches); the list newest first. Each row: the kind outline (18, text colour), the title (one line,
 *           full name in title), the short link (one line, full URL in title; no row without a link), 「写解读 / Write a reading」 or 「打开解读 / Open reading」, and remove.
 *           Clicking a row opens the original in split view. Once the list has loaded empty, the card cabinet stands alone (decoration; upload stays in the header). shortLink: drops the scheme and trailing slashes; filterMaterials: title and link, case-insensitive, trimmed, CJK by substring
 * [POS]: the UI says 「素材」; docs and code keep "material". Materials enter only through a topic reference (R15) and the original stays in the library. No link adding here (the model
 *        fetches links in conversation), no deleting originals, only unreferencing from this topic. The reading action only asks the host: it shows the service's refusal (R1's 409)
 *        and sends nothing else
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { AttachIcon, CloseIcon, FileTextIcon, FileTypeIcon, ICON_MD, ICON_SM, SearchIcon } from '../../components/icons'
import { useT } from '../../i18n/index.ts'
import type { LumenApi, TopicMaterial } from '../data/client.ts'
import { DeskObject } from './objects/DeskObject'
import { PaneToggle } from './Panes'

export function useMaterials(api: LumenApi, topicId: string | null, signal: string) {
  const [items, setItems] = useState<TopicMaterial[]>([]), [error, setError] = useState(''), [tick, setTick] = useState(0)
  // Whether this topic's list has arrived once: an empty list before then is not "no materials", so the empty state does not flash while loading
  const [loaded, setLoaded] = useState(false)
  useEffect(() => { setItems([]); setError(''); setLoaded(false) }, [api, topicId])
  useEffect(() => {
    if (!topicId) return
    let active = true
    void api.materials(topicId).then(result => { if (active) { setItems(result.items); setError(''); setLoaded(true) } }).catch(error => { if (active) setError(error instanceof Error ? error.message : String(error)) })
    return () => { active = false }
  }, [api, topicId, signal, tick])
  return { items, error, loaded, refresh: () => setTick(value => value + 1) }
}

/** Short link: drop the scheme and trailing slashes, keep path and query as they are (arxiv.org/abs/2611.14235, example.com/post/1) */
export function shortLink(url: string | null | undefined) {
  return url ? url.trim().replace(/^[a-z][a-z\d+.-]*:\/\//i, '').replace(/\/+$/, '') : ''
}

/** Search looks at title and link only: case-insensitive, trimmed; Chinese has no word boundaries, so match by substring */
export function filterMaterials(items: TopicMaterial[], query: string) {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return items
  return items.filter(item => [item.title, item.sourceUrl ?? ''].some(text => text.toLocaleLowerCase().includes(needle)))
}

/** Kind outline: PDFs and documents use the document outline, web pages reuse it, images use the image one; text colour */
function KindIcon({ item }: { item: TopicMaterial }) {
  return item.kind === 'web' ? <FileTextIcon size={ICON_MD} /> : <FileTypeIcon name={item.kind === 'pdf' ? 'x.pdf' : item.file} size={ICON_MD} />
}

function Row({ item, active, read, readingBusy, onOpen, onReading, onRemove }: {
  item: TopicMaterial; active: boolean; read: boolean; readingBusy: boolean; onOpen: () => void; onReading: () => void; onRemove: () => void
}) {
  const { studio: S, common: { labelled } } = useT()
  const link = shortLink(item.sourceUrl)
  return <li className={`material${active ? ' on' : ''}`}>
    <button type="button" className="material-open" onClick={onOpen}>
      <span className="material-icon"><KindIcon item={item} /></span>
      <span className="material-text"><span className="material-title" title={item.title}>{item.title}</span>
        {link && <small className="material-link" title={item.sourceUrl ?? undefined}>{link}</small>}</span>
    </button>
    <button type="button" className="material-reading" disabled={!read && readingBusy} title={!read && readingBusy ? S.reading.busy : undefined}
      aria-label={labelled(read ? S.reading.open : S.reading.write, item.title)} onClick={onReading}>{read ? S.reading.open : S.reading.write}</button>
    <button type="button" className="icon-btn material-remove" aria-label={labelled(S.materials.remove, item.title)} title={S.materials.remove} onClick={onRemove}><CloseIcon /></button>
  </li>
}

/** Empty Materials: the card cabinet alone (upload sits in the header); hover and click only, and it leaves when a material arrives */
function EmptyMaterials() {
  return <div className="materials-empty">
    <DeskObject slot="materials" className="materials-cabinet" />
  </div>
}

export function Materials({ api, topicId, items, error: loadError, loaded, activeId, collapsed, onToggle, onOpen, onChanged, readings, readingBusy, onReading }: {
  api: LumenApi
  topicId: string
  items: TopicMaterial[]
  error: string
  /** The topic's list has arrived once (useMaterials) */
  loaded: boolean
  activeId: string | null
  collapsed: boolean
  onToggle: () => void
  onOpen: (item: TopicMaterial) => void
  onChanged: () => void
  /** Materials that already have a reading in this topic */
  readings: string[]
  /** The conversation a request would go to is running or waiting: writing a new reading waits (opening one never does) */
  readingBusy: boolean
  /** Switch to the reading and, when there is none, ask for one; resolves to the refusal text or null */
  onReading: (item: TopicMaterial) => Promise<string | null>
}) {
  const S = useT().studio
  const [query, setQuery] = useState(''), [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => setQuery(''), [topicId])
  // One list, newest addition to this topic first
  const ordered = [...items].sort((a, b) => b.addedAt.localeCompare(a.addedAt) || a.id.localeCompare(b.id))
  const shown = filterMaterials(ordered, query)

  async function act(work: () => Promise<unknown>): Promise<void> {
    setBusy(true); setError('')
    try { await work(); onChanged() } catch (error) { setError(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) }
  }
  function upload(files: File[]) {
    setUploading(true)
    void act(async () => { for (const file of files) await api.upload({ topicId }, file) }).finally(() => setUploading(false))
  }
  return <aside className={`studio-panel studio-materials${collapsed ? ' is-collapsed' : ''}`} id="studio-materials" aria-label={S.materials.title} inert={collapsed}>
    <header className="studio-head"><h2 className="studio-head-title">{S.materials.title}</h2><span className="studio-sp" />
      <button type="button" className={`icon-btn materials-upload${uploading ? ' is-uploading' : ''}`} disabled={busy} aria-busy={uploading || undefined}
        aria-label={S.materials.upload} title={uploading ? S.materials.uploading : S.materials.upload} onClick={() => input.current?.click()}><AttachIcon /></button>
      <input ref={input} type="file" hidden multiple aria-label={S.materials.upload} onChange={event => {
        const files = [...event.target.files ?? []]
        event.target.value = ''
        if (files.length) upload(files)
      }} />
      <PaneToggle side="right" open onToggle={onToggle} />
    </header>
    <div className="studio-scroll">
      <div className="materials-search"><SearchIcon size={ICON_SM} />
        <input className="studio-field" aria-label={S.materials.search} placeholder={S.materials.search} value={query} onChange={event => setQuery(event.target.value)}
          onKeyDown={event => { if (event.key === 'Escape' && query) { event.preventDefault(); setQuery('') } }} />
      </div>
      {(error || loadError) && <p className="mw-error studio-note" role="alert">{error || loadError}</p>}
      {!items.length ? !loadError && loaded && <EmptyMaterials />
        : !shown.length ? <p className="studio-note materials-none" role="status">{S.materials.noMatch}</p>
        : <ul className="materials-list" aria-label={S.materials.title}>{shown.map(item => <Row key={item.id} item={item} active={item.id === activeId} read={readings.includes(item.id)} readingBusy={readingBusy}
          onOpen={() => onOpen(item)} onReading={() => { setError(''); void onReading(item).then(failure => { if (failure) setError(failure) }) }} onRemove={() => void act(() => api.unreference(topicId, item.id))} />)}</ul>}
    </div>
  </aside>
}

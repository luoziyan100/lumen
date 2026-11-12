/**
 * [INPUT]: LumenApi 的主题材料（引用 + 读到哪 + 板上引用数）、上传与粘贴链接、取消引用；刷新信号
 * [OUTPUT]: Materials：右侧「这个主题用到的」——分「你带来的 / AI 找来的」，上传、粘贴链接、不再引用；点一条在中间分屏打开原件
 * [POS]: 材料只经主题引用进入（R15），原件留在资料库；这里不删原件，只断开本主题的引用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '@cloudflare/kumo/components/button'
import { Input } from '@cloudflare/kumo/components/input'
import { CloseIcon } from '../../components/icons'
import { STUDIO_COPY as S } from '../../copy/studioCopy'
import type { LumenApi, TopicMaterial } from '../data/client.ts'

export function useMaterials(api: LumenApi, topicId: string | null, signal: string) {
  const [items, setItems] = useState<TopicMaterial[]>([]), [error, setError] = useState(''), [tick, setTick] = useState(0)
  useEffect(() => { setItems([]); setError('') }, [api, topicId])
  useEffect(() => {
    if (!topicId) return
    let active = true
    void api.materials(topicId).then(result => { if (active) { setItems(result.items); setError('') } }).catch(error => { if (active) setError(error instanceof Error ? error.message : String(error)) })
    return () => { active = false }
  }, [api, topicId, signal, tick])
  return { items, error, refresh: () => setTick(value => value + 1) }
}

function Row({ item, active, onOpen, onRemove }: { item: TopicMaterial; active: boolean; onOpen: () => void; onRemove: () => void }) {
  return <li className={`material${active ? ' on' : ''}`}>
    <button type="button" className="material-open" onClick={onOpen} title={item.sourceUrl ?? item.title}>
      <span className={`ws-tag ws-tag-${item.kind === 'pdf' ? 'pdf' : item.kind === 'web' ? 'html' : 'md'}`}>{item.kind === 'pdf' ? 'PDF' : item.kind === 'web' ? 'WEB' : 'FILE'}</span>
      <span className="material-text"><span className="material-title">{item.title}</span>
        <small className="material-meta">{S.materials.progress(item.readProgress)}{S.materials.cited(item.citedBy)}</small></span>
    </button>
    <button type="button" className="icon-btn material-remove" aria-label={`${S.materials.remove}：${item.title}`} title={S.materials.remove} onClick={onRemove}><CloseIcon /></button>
  </li>
}

export function Materials({ api, topicId, items, error: loadError, activeId, onOpen, onChanged }: {
  api: LumenApi
  topicId: string
  items: TopicMaterial[]
  error: string
  activeId: string | null
  onOpen: (item: TopicMaterial) => void
  onChanged: () => void
}) {
  const [link, setLink] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const yours = items.filter(item => item.addedBy === 'you'), found = items.filter(item => item.addedBy === 'ai')

  async function act(work: () => Promise<unknown>) {
    setBusy(true); setError('')
    try { await work(); onChanged() } catch (error) { setError(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) }
  }
  function submitLink(event: FormEvent) {
    event.preventDefault()
    const url = link.trim()
    if (url) void act(async () => { await api.addLink(url, topicId); setLink('') })
  }
  const group = (label: string, list: TopicMaterial[]) => <section className="materials-group" aria-label={label}>
    <h4>{label} <small>{list.length}</small></h4>
    {list.length ? <ul>{list.map(item => <Row key={item.id} item={item} active={item.id === activeId} onOpen={() => onOpen(item)} onRemove={() => void act(() => api.unreference(topicId, item.id))} />)}</ul> : null}
  </section>

  return <aside className="studio-materials" aria-label={S.materials.title}>
    <header className="materials-head"><h3>{S.materials.title}</h3><p>{S.materials.note}</p></header>
    <div className="materials-add">
      <Button variant="secondary" disabled={busy} onClick={() => input.current?.click()}>{S.materials.upload}</Button>
      <input ref={input} type="file" hidden multiple aria-label={S.materials.upload} onChange={event => {
        const files = [...event.target.files ?? []]
        event.target.value = ''
        if (files.length) void act(async () => { for (const file of files) await api.upload({ topicId }, file) })
      }} />
      <form onSubmit={submitLink}><Input aria-label={S.materials.link} placeholder={S.materials.link} value={link} onChange={event => setLink(event.target.value)} /><Button type="submit" variant="ghost" disabled={busy || !link.trim()}>{S.materials.add}</Button></form>
    </div>
    {(error || loadError) && <p className="mw-error" role="alert">{error || loadError}</p>}
    {!items.length && !loadError ? <p className="materials-none">{S.materials.none}</p> : <>{group(S.materials.yours, yours)}{group(S.materials.ai, found)}</>}
  </aside>
}

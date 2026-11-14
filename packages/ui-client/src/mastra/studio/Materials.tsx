/**
 * [INPUT]: LumenApi 的主题材料、上传与取消引用；刷新信号
 * [OUTPUT]: Materials：右栏面板「素材」——头部「素材 · 上传（回形针，多选，上传中禁用并亮起）· 收起」、一个纯搜索框（即时过滤，Esc 清空，无匹配如实说）、按加入时间倒序的列表；
 *           每行类别轮廓（18，随文字色）+ 标题（单行省略，title 全名）+ 链接短写（单行省略，title 完整 URL；没有链接不出这一行）；点一条在中间分屏打开原件。
 *           shortLink：去协议与末尾斜杠；filterMaterials：标题与链接，不分大小写、忽略首尾空格、中文按子串
 * [POS]: 界面叫「素材」，文档与代码里的对象仍叫材料。材料只经主题引用进入（R15），原件留在资料库；这里不加链接（交给对话里的模型去取），不删原件，只断开本主题的引用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useRef, useState } from 'react'
import { AttachIcon, CloseIcon, FileTextIcon, FileTypeIcon, ICON_MD, ICON_SM, SearchIcon } from '../../components/icons'
import { STUDIO_COPY as S } from '../../copy/studioCopy'
import type { LumenApi, TopicMaterial } from '../data/client.ts'
import { PaneToggle } from './Panes'

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

/** 链接短写：去掉协议与末尾斜杠，路径与查询原样留着（arxiv.org/abs/2611.14235、example.com/post/1） */
export function shortLink(url: string | null | undefined) {
  return url ? url.trim().replace(/^[a-z][a-z\d+.-]*:\/\//i, '').replace(/\/+$/, '') : ''
}

/** 搜索只看标题与链接：不分大小写、忽略首尾空格；中文没有词边界，按子串匹配 */
export function filterMaterials(items: TopicMaterial[], query: string) {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return items
  return items.filter(item => [item.title, item.sourceUrl ?? ''].some(text => text.toLocaleLowerCase().includes(needle)))
}

/** 类别轮廓：PDF 与文档用文档、网页复用文档轮廓、图片用图片；随文字色 */
function KindIcon({ item }: { item: TopicMaterial }) {
  return item.kind === 'web' ? <FileTextIcon size={ICON_MD} /> : <FileTypeIcon name={item.kind === 'pdf' ? 'x.pdf' : item.file} size={ICON_MD} />
}

function Row({ item, active, onOpen, onRemove }: { item: TopicMaterial; active: boolean; onOpen: () => void; onRemove: () => void }) {
  const link = shortLink(item.sourceUrl)
  return <li className={`material${active ? ' on' : ''}`}>
    <button type="button" className="material-open" onClick={onOpen}>
      <span className="material-icon"><KindIcon item={item} /></span>
      <span className="material-text"><span className="material-title" title={item.title}>{item.title}</span>
        {link && <small className="material-link" title={item.sourceUrl ?? undefined}>{link}</small>}</span>
    </button>
    <button type="button" className="icon-btn material-remove" aria-label={`${S.materials.remove}：${item.title}`} title={S.materials.remove} onClick={onRemove}><CloseIcon /></button>
  </li>
}

export function Materials({ api, topicId, items, error: loadError, activeId, collapsed, onToggle, onOpen, onChanged }: {
  api: LumenApi
  topicId: string
  items: TopicMaterial[]
  error: string
  activeId: string | null
  collapsed: boolean
  onToggle: () => void
  onOpen: (item: TopicMaterial) => void
  onChanged: () => void
}) {
  const [query, setQuery] = useState(''), [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => setQuery(''), [topicId])
  // 一个列表，按加入本主题的时间倒序
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
      {!items.length ? !loadError && <p className="studio-note materials-none">{S.materials.none}</p>
        : !shown.length ? <p className="studio-note materials-none" role="status">{S.materials.noMatch}</p>
        : <ul className="materials-list" aria-label={S.materials.title}>{shown.map(item => <Row key={item.id} item={item} active={item.id === activeId} onOpen={() => onOpen(item)} onRemove={() => void act(() => api.unreference(topicId, item.id))} />)}</ul>}
    </div>
  </aside>
}

/**
 * [INPUT]: LumenApi 的主题材料（引用 + 读到哪 + 板上引用数）、上传与粘贴链接、取消引用；刷新信号
 * [OUTPUT]: Materials：右栏面板「素材」——头部右侧收起（镜像 PanelIcon，收起后宽 0、inert）、一行添加（粘贴链接回车 + 上传图标）、一个按加入时间倒序的列表（不分组、不计数）；
 *           每行按类别的文件轮廓（18，随文字色，不用文字徽标），标题单行省略、悬停看全名，meta 放「AI 找来」·格式·来源·（arXiv 编号·年份）·读到哪，板上引用数进 title、不再引用；materialMeta；点一条在中间分屏打开原件
 * [POS]: 界面叫「素材」，文档与代码里的对象仍叫材料。材料只经主题引用进入（R15），原件留在资料库；这里不删原件，只断开本主题的引用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AttachIcon, CloseIcon, FileTextIcon, FileTypeIcon, ICON_MD } from '../../components/icons'
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

/** 来源域名（M4：进 meta 行，不用悬停浮层挡住下面的条目） */
function host(url?: string | null) {
  try { return url ? new URL(url).host : '' } catch { return '' }
}

/** 格式：PDF、网页，其余取文件扩展名（I2：格式进 meta，不做徽标） */
function format(item: TopicMaterial) {
  if (item.kind === 'pdf' || item.kind === 'web') return S.materials.format[item.kind]
  return item.file.match(/\.([A-Za-z0-9]+)$/)?.[1]?.toUpperCase() ?? ''
}

/** meta：AI 找来的排在最前（淡色小字，不用徽标色）· 格式 · 来源 ·（arXiv 编号 · 年份）· 读到哪；板上引用数进 title 提示 */
export function materialMeta(item: TopicMaterial) {
  return [item.addedBy === 'ai' ? S.materials.foundByAi : '', format(item), host(item.sourceUrl), item.arxivId ? `arXiv ${item.arxivId}` : '', item.year ? String(item.year) : '',
    S.materials.progress(item.readProgress)].filter(Boolean).join(' · ')
}

/** 类别轮廓：PDF 与文档用文档、网页复用文档轮廓、图片用图片；随文字色 */
function KindIcon({ item }: { item: TopicMaterial }) {
  return item.kind === 'web' ? <FileTextIcon size={ICON_MD} /> : <FileTypeIcon name={item.kind === 'pdf' ? 'x.pdf' : item.file} size={ICON_MD} />
}

function Row({ item, active, onOpen, onRemove }: { item: TopicMaterial; active: boolean; onOpen: () => void; onRemove: () => void }) {
  return <li className={`material${active ? ' on' : ''}`}>
    <button type="button" className="material-open" onClick={onOpen}>
      <span className="material-icon"><KindIcon item={item} /></span>
      <span className="material-text"><span className="material-title" title={item.title}>{item.title}</span>
        <small className="material-meta" data-added-by={item.addedBy} title={S.materials.cited(item.citedBy) || undefined}>{materialMeta(item)}</small></span>
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
  const [link, setLink] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  // 一个列表，按加入本主题的时间倒序；added_by 只体现在 meta（P1 的「删除 / 转为你的」靠它）
  const ordered = [...items].sort((a, b) => b.addedAt.localeCompare(a.addedAt) || a.id.localeCompare(b.id))

  async function act(work: () => Promise<unknown>) {
    setBusy(true); setError('')
    try { await work(); onChanged() } catch (error) { setError(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) }
  }
  function submitLink(event: FormEvent) {
    event.preventDefault()
    const url = link.trim()
    if (url) void act(async () => { await api.addLink(url, topicId); setLink('') })
  }
  return <aside className={`studio-panel studio-materials${collapsed ? ' is-collapsed' : ''}`} id="studio-materials" aria-label={S.materials.title} inert={collapsed}>
    <header className="studio-head"><h2 className="studio-head-title">{S.materials.title}</h2><span className="studio-sp" /><PaneToggle side="right" open onToggle={onToggle} /></header>
    <div className="studio-scroll">
      <form className="materials-add" onSubmit={submitLink}>
        <input className="studio-field" aria-label={S.materials.link} placeholder={S.materials.link} value={link} disabled={busy} onChange={event => setLink(event.target.value)} />
        <button type="button" className="icon-btn" disabled={busy} aria-label={S.materials.upload} title={S.materials.upload} onClick={() => input.current?.click()}><AttachIcon /></button>
        <input ref={input} type="file" hidden multiple aria-label={S.materials.upload} onChange={event => {
          const files = [...event.target.files ?? []]
          event.target.value = ''
          if (files.length) void act(async () => { for (const file of files) await api.upload({ topicId }, file) })
        }} />
      </form>
      {(error || loadError) && <p className="mw-error studio-note" role="alert">{error || loadError}</p>}
      {!items.length && !loadError ? <p className="studio-note materials-none">{S.materials.none}</p>
        : <ul className="materials-list" aria-label={S.materials.title}>{ordered.map(item => <Row key={item.id} item={item} active={item.id === activeId} onOpen={() => onOpen(item)} onRemove={() => void act(() => api.unreference(topicId, item.id))} />)}</ul>}
    </div>
  </aside>
}

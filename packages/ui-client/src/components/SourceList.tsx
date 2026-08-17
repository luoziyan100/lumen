/**
 * [INPUT]: SourceCite[];useOpenExternal;collapseSourcesBySite
 * [OUTPUT]: SourceList —— 答末来源按站点一行;超 SOURCE_PREVIEW 站可展开/收起
 * [POS]: 终稿助手泡下方兜底表;模型已在正文写 Sources 时不渲染。折叠只发生在展示,不改收集
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useMemo, useRef, useState } from 'react'
import { APP_STATUS_COPY } from '../copy/appCopy'
import { SOURCE_PREVIEW, collapseSourcesBySite, type SourceCite } from '../sourceCite'
import { useOpenExternal } from './ExternalLinkDialog'

export function SourceList({ sources }: { sources: SourceCite[] }) {
  const open = useOpenExternal()
  const [showAll, setShowAll] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const grouped = useMemo(() => collapseSourcesBySite(sources), [sources])
  if (!grouped.length) return null
  const canToggle = grouped.length > SOURCE_PREVIEW
  const visible = showAll ? grouped : grouped.slice(0, SOURCE_PREVIEW)
  const hidden = grouped.length - visible.length

  function toggle(): void {
    if (showAll) {
      setShowAll(false)
      requestAnimationFrame(() => {
        rootRef.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
      })
      return
    }
    setShowAll(true)
  }

  return (
    <div ref={rootRef} className="source-list">
      <div className="source-list-head">{APP_STATUS_COPY.sourcesHeading}</div>
      <ul>
        {visible.map((s) => (
          <li key={s.url}>
            <button
              type="button"
              className="source-list-link"
              onClick={() => open(s.url)}
              title={s.url}
            >
              {s.title}
            </button>
          </li>
        ))}
      </ul>
      {canToggle ? (
        <button type="button" className="source-list-more" onClick={toggle}>
          {showAll ? APP_STATUS_COPY.sourcesLess : APP_STATUS_COPY.sourcesMore(hidden)}
        </button>
      ) : null}
    </div>
  )
}

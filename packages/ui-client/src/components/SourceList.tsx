/**
 * [INPUT]: SourceCite[];useOpenExternal
 * [OUTPUT]: SourceList —— 答末来源列表,一行一条标题
 * [POS]: 终稿助手泡下方;点开走外链确认
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useState } from 'react'
import { APP_STATUS_COPY } from '../appCopy'
import { SOURCE_PREVIEW, type SourceCite } from '../sourceCite'
import { useOpenExternal } from './ExternalLinkDialog'

export function SourceList({ sources }: { sources: SourceCite[] }) {
  const open = useOpenExternal()
  const [showAll, setShowAll] = useState(false)
  if (!sources.length) return null
  const visible = showAll ? sources : sources.slice(0, SOURCE_PREVIEW)
  const hidden = sources.length - visible.length
  return (
    <div className="source-list">
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
      {hidden > 0 ? (
        <button type="button" className="source-list-more" onClick={() => setShowAll(true)}>
          {APP_STATUS_COPY.sourcesMore(hidden)}
        </button>
      ) : null}
    </div>
  )
}

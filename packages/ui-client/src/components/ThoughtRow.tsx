/**
 * [INPUT]: ThoughtItem;useElapsedLabel;APP_STATUS_COPY
 * [OUTPUT]: ThoughtRow —— 一轮一条可展开思考轨迹
 * [POS]: 对话流;运行中 shimmer + 计时;收口后「思考了 Xs」默认收起
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useEffect, useState } from 'react'
import { APP_STATUS_COPY } from '../appCopy'
import { useElapsedLabel } from '../elapsedLabel'
import type { ThoughtItem } from '../useAgent'
import { CurtainFold } from './CurtainFold'

export function ThoughtRow({ thought }: { thought: ThoughtItem }) {
  const [open, setOpen] = useState(!thought.done)
  useEffect(() => {
    if (thought.done) setOpen(false)
  }, [thought.done])
  const elapsed = useElapsedLabel(thought.startedAt, thought.done ? thought.endedAt : undefined)
  const preview = thought.content.trim()
  const short = preview.length > 280 ? `${preview.slice(0, 280)}…` : preview
  const label = thought.done
    ? (elapsed ? APP_STATUS_COPY.thoughtDone(elapsed) : APP_STATUS_COPY.thoughtDoneFallback)
    : APP_STATUS_COPY.thoughtActive
  return (
    <div className={`thought ${thought.done ? 'is-done' : 'is-run'}`}>
      <button
        type="button"
        className="thought-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`thought-label${thought.done ? '' : ' is-shimmer'}`}>{label}</span>
        {!thought.done && elapsed ? (
          <span className="thought-elapsed">{elapsed}</span>
        ) : null}
        <span className="thought-toggle" aria-hidden>{open ? '⌃' : '›'}</span>
      </button>
      <CurtainFold open={open}>
        <div className="thought-body">
          <pre className="thought-text">{open ? preview : short}</pre>
        </div>
      </CurtainFold>
    </div>
  )
}

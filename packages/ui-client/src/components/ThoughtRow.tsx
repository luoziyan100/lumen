/**
 * [INPUT]: ThoughtItem;可选 clockStart;useElapsedLabel;APP_STATUS_COPY
 * [OUTPUT]: ThoughtRow —— 一轮一条可展开思考轨迹
 * [POS]: 对话流;运行中 shimmer + live 计时;收口后只留 Thought process 摘要,不报秒数
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useEffect, useState } from 'react'
import { APP_STATUS_COPY } from '../appCopy'
import { useElapsedLabel } from '../elapsedLabel'
import type { ThoughtItem } from '../useAgent'
import { CurtainFold } from './CurtainFold'

export function ThoughtRow({
  thought,
  clockStart,
}: {
  thought: ThoughtItem
  /** 本轮开始时刻(用户点发送);比 thought.startedAt 更早,覆盖首 token 前的等待 */
  clockStart?: string
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (thought.done) setOpen(false)
  }, [thought.done])
  const elapsed = useElapsedLabel(thought.done ? undefined : (clockStart ?? thought.startedAt))
  const preview = thought.content.trim()
  const label = thought.done ? APP_STATUS_COPY.thoughtSettled : APP_STATUS_COPY.thoughtActive
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
          <pre className="thought-text">{preview}</pre>
        </div>
      </CurtainFold>
    </div>
  )
}

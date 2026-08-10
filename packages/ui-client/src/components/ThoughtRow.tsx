/**
 * [INPUT]: ThoughtItem
 * [OUTPUT]: ThoughtRow —— Claude 档折叠思考过程
 * [POS]: 对话流;默认收起;done 时显示 Done
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useState } from 'react'
import type { ThoughtItem } from '../useAgent'
import { CurtainFold } from './CurtainFold'

export function ThoughtRow({ thought }: { thought: ThoughtItem }) {
  const [open, setOpen] = useState(false)
  const preview = thought.content.trim()
  const short = preview.length > 280 ? `${preview.slice(0, 280)}…` : preview
  return (
    <div className={`thought ${thought.done ? 'is-done' : 'is-run'}`}>
      <button
        type="button"
        className="thought-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="thought-label">Thought process</span>
        <span className="thought-toggle">{open ? '收起' : '›'}</span>
      </button>
      <CurtainFold open={open}>
        <div className="thought-body">
          <pre className="thought-text">{open ? preview : short}</pre>
          {thought.done && <div className="thought-done">Done</div>}
        </div>
      </CurtainFold>
      {!open && thought.done && (
        <div className="thought-done thought-done-collapsed">Done</div>
      )}
    </div>
  )
}

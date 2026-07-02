/**
 * 会话搜索弹窗(Cmd+K / 侧栏🔍):居中面板,实时过滤,Enter 选第一条,Esc/×/遮罩关闭。
 */
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Task } from '../agent-client'
import { SearchIcon } from './icons'

export function SearchModal({ conversations, onSelect, onClose }: {
  conversations: Task[]
  onSelect: (task: Task) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const q = query.trim().toLowerCase()
  const shown = q ? conversations.filter((t) => t.goal.toLowerCase().includes(q)) : conversations

  function onSubmit(e: FormEvent): void {
    e.preventDefault()
    if (shown[0]) onSelect(shown[0])
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="search-modal" role="dialog" aria-label="搜索对话" onClick={(e) => e.stopPropagation()}>
        <form className="search-modal-head" onSubmit={onSubmit}>
          <span className="search-modal-icon"><SearchIcon /></span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索对话…"
          />
          <button type="button" className="search-modal-close" aria-label="关闭" onClick={onClose}>×</button>
        </form>
        <div className="search-modal-list">
          {shown.length === 0 && <div className="sb-empty">无匹配会话。</div>}
          {shown.map((task) => (
            <button key={task.id} className="sb-item" onClick={() => onSelect(task)} title={task.goal}>
              <span className="sb-item-title">{task.goal}</span>
              {task.status === 'running' && <span className="sb-dot" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

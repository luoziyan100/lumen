/**
 * 左侧栏:收起/搜索 图标行 + 新对话 + 会话历史(= 本项目 task 列表)。
 * 搜索点击打开全局弹窗(SearchModal);收起由 App 控制,收起后展开钮在顶栏。
 */
import type { Task } from '../agent-client'
import { PanelIcon, SearchIcon } from './icons'

interface SidebarProps {
  conversations: Task[]
  activeId: string | null
  onNew: () => void
  onSelect: (task: Task) => void
  onCollapse: () => void
  onSearch: () => void
}

export function Sidebar({ conversations, activeId, onNew, onSelect, onCollapse, onSearch }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sb-top">
        <button className="icon-btn" title="收起侧栏" aria-label="收起侧栏" onClick={onCollapse}><PanelIcon /></button>
        <button className="icon-btn" title="搜索对话 (⌘K)" aria-label="搜索对话" onClick={onSearch}><SearchIcon /></button>
      </div>
      <button className="sb-new" onClick={onNew}>＋ 新对话</button>
      <div className="sb-head">会话</div>
      <nav className="sb-list">
        {conversations.length === 0 && <div className="sb-empty">还没有会话。问点什么开始吧。</div>}
        {conversations.map((task) => (
          <button
            key={task.id}
            className={`sb-item ${task.id === activeId ? 'is-active' : ''}`}
            onClick={() => onSelect(task)}
            title={task.goal}
          >
            <span className="sb-item-title">{task.goal}</span>
            {task.status === 'running' && <span className="sb-dot" />}
          </button>
        ))}
      </nav>
    </aside>
  )
}

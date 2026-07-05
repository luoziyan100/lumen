/**
 * 左侧栏:新对话 + 会话历史(= 本项目 task 列表)。
 * 收起/搜索钮恒驻标题栏(App 的 tb-left),不在侧栏内——位置不随开合漂移。
 */
import { Button } from '@cloudflare/kumo/components/button'
import type { Task } from '../agent-client'

interface SidebarProps {
  conversations: Task[]
  activeId: string | null
  onNew: () => void
  onSelect: (task: Task) => void
}

export function Sidebar({ conversations, activeId, onNew, onSelect }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="flex px-4 pt-3 pb-2">
        <Button variant="outline" size="sm" className="w-full justify-center" onClick={onNew}>＋ 新对话</Button>
      </div>
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

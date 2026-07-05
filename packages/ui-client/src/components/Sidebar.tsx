/**
 * 左侧栏:收起/搜索 图标行 + 新对话 + 会话历史(= 本项目 task 列表)。
 * 搜索点击打开全局弹窗(SearchModal);收起由 App 控制,收起后展开钮在顶栏。
 */
import { Button } from '@cloudflare/kumo/components/button'
import { Tooltip } from '@cloudflare/kumo/components/tooltip'
import type { Task } from '../agent-client'
import { PanelIcon, SearchIcon } from './icons'
import { APP_NAV_ICON_BUTTON } from '../appCopy'

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
        <Tooltip content="收起侧栏" render={
          <button className="icon-btn nav-icon-btn" aria-label="收起侧栏" onClick={onCollapse}><PanelIcon size={APP_NAV_ICON_BUTTON.iconSize} /></button>
        } />
        <Tooltip content="搜索对话 ⌘K" render={
          <button className="icon-btn nav-icon-btn" aria-label="搜索对话" onClick={onSearch}><SearchIcon size={APP_NAV_ICON_BUTTON.iconSize} /></button>
        } />
      </div>
      <div className="flex px-4 py-2">
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

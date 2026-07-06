/**
 * 左侧栏:新对话 + 会话历史(= 本项目 task 列表)。
 * 收起/搜索钮恒驻标题栏(App 的 tb-left),不在侧栏内——位置不随开合漂移。
 * 右缘把手可拖拽调宽(220–420px,记忆宽度,双击复位);一键收起仍走标题栏折叠钮。
 */
import type { Task } from '../agent-client'
import { AccountIcon, ChatIcon, GearIcon, SearchIcon, ICON_MD } from './icons'
import { SIDEBAR_ACCOUNT_COPY } from '../appCopy'
import { useResizable } from '../useResizable'

interface SidebarProps {
  conversations: Task[]
  activeId: string | null
  onNew: () => void
  onSearch: () => void
  onSelect: (task: Task) => void
  onSettings: () => void
}

export function Sidebar({ conversations, activeId, onNew, onSearch, onSelect, onSettings }: SidebarProps) {
  const { width, handleProps } = useResizable({ edge: 'right', min: 220, max: 420, fallback: 300, storageKey: 'lumen:sbWidth' })

  return (
    <aside className="sidebar" style={{ '--sidebar-w': `${width}px` } as React.CSSProperties}>
      {/* image-6 式导航行(顶部):功能少先放这两条,多了再扩 */}
      <nav className="sb-nav">
        <button className="sb-navrow" onClick={onNew}><span className="sb-navrow-ic"><ChatIcon size={ICON_MD} /></span>新对话</button>
        <button className="sb-navrow" onClick={onSearch}><span className="sb-navrow-ic"><SearchIcon size={ICON_MD} /></span>搜索</button>
      </nav>
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
      {/* 左下角账户区:账号功能未做前即设置入口(将来扩成账户菜单) */}
      <div className="sb-foot">
        <button className="sb-account" onClick={onSettings} title="设置">
          <span className="sb-avatar"><AccountIcon size={18} /></span>
          <span className="sb-account-text">
            <span className="sb-account-name">{SIDEBAR_ACCOUNT_COPY.name}</span>
            <span className="sb-account-hint">{SIDEBAR_ACCOUNT_COPY.hint}</span>
          </span>
          <span className="sb-account-gear"><GearIcon size={16} /></span>
        </button>
      </div>
      <div
        className="sb-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整侧栏宽度(双击复位)"
        title="拖拽调宽 · 双击复位"
        {...handleProps}
      />
    </aside>
  )
}

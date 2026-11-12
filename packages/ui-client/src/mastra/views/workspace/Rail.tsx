/**
 * [INPUT]: 产物目录、原生tasks/usage快照、Progress用量呈现、共享CurtainFold/Disclosure、工作区动作与统一 Phosphor 图标
 * [OUTPUT]: WorkspaceRail：原进度卡、主题工作区产物、卷帘折叠和工作目录管理入口（加入资料库、两层记忆），专家协作目录与累计用量收在右轨
 * [POS]: 仅呈现任务真实状态；更多菜单负责管理、方向箭头负责折叠，阅读器打开时由Files替换，不绑定执行协议
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useState, type CSSProperties, type ReactNode } from 'react'
import { DropdownMenu } from '@cloudflare/kumo/components/dropdown'
import { SectionChevronIcon, FileTypeIcon, FoldersIcon, PlusIcon, MoreIcon, CheckIcon, RefreshGlyph, FileGlyph, FolderGlyph, BrainGlyph, ICON_SM, ICON_MD } from '../../../components/icons'
import { CurtainFold } from '../../../components/disclosure/CurtainFold'
import { Disclosure } from '../../../components/disclosure/Disclosure'
import { useResizable } from '../chrome/useResizable'
import { Progress } from '../conversation/Progress'
import type { FileScope } from '../../data/client'
import type { WorkspaceAsset, WorkspaceState } from './useWorkspace'
export function WorkspaceRail({ workspace, onOpen, onBrowse, onUpload, uploading = false, specialists }: { workspace: WorkspaceState; onOpen: (asset: WorkspaceAsset) => void; onBrowse: (scope: FileScope) => void; onUpload: () => void; uploading?: boolean; specialists?: ReactNode }) {
  const [open, setOpen] = useState(true)
  const { width, handleProps } = useResizable({ edge: 'left', min: 260, max: 540, fallback: 300, storageKey: 'lumen:railWidth.v4' })
  const tasks = workspace.display?.tasks ?? []
  return <aside className="rail mw-workspace-rail" aria-label="工作区" style={{ '--rail-w': `${width}px` } as CSSProperties}>
    <div className="rail-resize" role="separator" aria-orientation="vertical" aria-label="调整工作目录宽度（双击复位）" {...handleProps} />
    {tasks.length > 0 && <section className="rail-card glass-beam"><h3 className="rail-h">进度<span className="rail-count">{tasks.filter(task => task.status === 'completed').length}/{tasks.length}</span></h3><ul className="rail-todo-steps">{tasks.map(task => <li key={task.id} className={`rail-todo-step is-${task.status}`}><span className={`rail-todo-mark${task.status === 'in_progress' && workspace.display?.isRunning ? ' is-run' : task.status !== 'completed' ? ' is-pending' : ''}`} aria-hidden>{task.status === 'completed' && <CheckIcon size={ICON_SM} />}</span><span className="rail-todo-label">{task.status === 'in_progress' && workspace.display?.isRunning ? task.activeForm || task.content : task.content}</span></li>)}</ul></section>}
    <section className="rail-card glass-beam"><div className="mw-workspace-heading"><button className="rail-h rail-toggle" onClick={() => setOpen(value => !value)} aria-expanded={open}><FoldersIcon size={ICON_MD} /><span>工作目录</span><span className="rail-count">{workspace.assets.length}</span><SectionChevronIcon open={open} /></button><DropdownMenu><DropdownMenu.Trigger render={<button className="icon-btn nav-icon-btn" aria-label="工作目录管理" />}><MoreIcon size={ICON_MD} /></DropdownMenu.Trigger><DropdownMenu.Content><DropdownMenu.Item icon={RefreshGlyph} onClick={workspace.refresh}>刷新</DropdownMenu.Item><DropdownMenu.Item icon={FileGlyph} onClick={() => onBrowse('work')}>浏览全部文件</DropdownMenu.Item><DropdownMenu.Item icon={BrainGlyph} onClick={() => onBrowse('memory')}>主题记忆</DropdownMenu.Item><DropdownMenu.Item icon={FolderGlyph} onClick={() => onBrowse('you')}>关于你的记忆</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu></div>
      <CurtainFold open={open}><div className="rail-dir-body">{(['work'] as const).map(scope => { const files = workspace.assets.filter(file => file.scope === scope); return <div className="rail-group" key={scope}><div className="rail-group-head">主题工作区<span className="rail-group-n">{files.length}</span><button className="rail-upload-shared" aria-label={uploading ? '正在加入资料库' : '加入资料库'} disabled={uploading} onClick={onUpload}><PlusIcon size={ICON_SM} /></button></div>{files.map(file => <button className="ws-item" title={file.path} key={file.path} onClick={() => onOpen(file)}><span className="ws-file-icon"><FileTypeIcon name={file.name} size={ICON_MD} /></span><span className="ws-name">{file.name}</span></button>)}</div> })}{workspace.loading && <p role="status">正在读取工作目录…</p>}{workspace.error && <p className="mw-error" role="alert">{workspace.error}</p>}</div></CurtainFold>
    </section>
    {specialists}
    {((workspace.display?.tokenUsage?.totalTokens ?? 0) + (workspace.display?.childTokenUsage?.totalTokens ?? 0) > 0) && <Disclosure className="rail-card mw-workspace-usage" summary="研究用量"><Progress display={workspace.display} showTasks={false} /></Disclosure>}
  </aside>
}

/**
 * [INPUT]: Asset(含 scope);ChatItem;icons;useResizable;WORKSPACE_SCOPE_COPY;filterComposerFiles
 * [OUTPUT]: UtilityRail —— Todo Progress + 工作目录(共享区 / 本会话)
 * [POS]: 右轨;阅读器打开时由 ReaderPane 替换;共享区上传与 composer 同宽准入;
 *        Progress **仅** Todo(见 doc/todo.md);普通 tool 过程在主对话 ProcessRow，
 *        不在此刷「网页搜索·完成」长列表（复杂任务十几轮会爆长）;
 *        工作目录开合走 CurtainFold;默认宽 300
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import type { Asset } from '../agent-client'
import type { ChatItem, TodoChatItem, TodoEntry } from '../useAgent'
import { WORKSPACE_SCOPE_COPY } from '../appCopy'
import { filterComposerFiles } from '../composerAccept'
import { CurtainFold } from './CurtainFold'
import { ChevronIcon, FileTypeIcon, FoldersIcon, PlusIcon, ICON_MD } from './icons'
import { useResizable } from '../useResizable'

const OPENABLE: Asset['kind'][] = ['pdf', 'doc', 'html']

function isShared(a: Asset): boolean {
  return a.scope === 'shared' || a.path.startsWith('shared/')
}

function AssetGroup({ label, items, onOpen }: { label: string; items: Asset[]; onOpen: (a: Asset) => void }) {
  if (!items.length) return null
  return (
    <div className="rail-group">
      <div className="rail-group-head">{label}<span className="rail-group-n">{items.length}</span></div>
      {items.map((a) => {
        const inner = (
          <>
            <span className="ws-file-icon"><FileTypeIcon name={a.name} size={ICON_MD} /></span>
            <span className="ws-name">{a.name}</span>
          </>
        )
        return OPENABLE.includes(a.kind)
          ? <button key={a.path} className="ws-item" onClick={() => onOpen(a)}>{inner}</button>
          : <div key={a.path} className="ws-item ws-item-static">{inner}</div>
      })}
    </div>
  )
}

/** live=会话仍在跑时才转圈;task 已停仍 in_progress 时降级为静态度(双保险) */
function TodoMark({ status, live }: { status: TodoEntry['status']; live: boolean }) {
  if (status === 'completed') return <span className="rail-todo-mark" aria-hidden>✓</span>
  if (status === 'in_progress' && live) return <span className="rail-todo-mark is-run" aria-hidden />
  if (status === 'in_progress') return <span className="rail-todo-mark" aria-hidden>✓</span>
  return <span className="rail-todo-mark is-pending" aria-hidden />
}

export function UtilityRail({ assets, onOpen, items, onUploadShared, running = false }: {
  assets: Asset[]
  onOpen: (a: Asset) => void
  /** 用户面 items（Todo 等） */
  items: ChatItem[]
  /** @deprecated 保留 prop 兼容；右轨不再渲染普通 tool process 长列表 */
  evidenceItems?: ChatItem[]
  running?: boolean
  /** 有则显示「上传到共享区」 */
  onUploadShared?: (files: File[]) => void
}) {
  const todo: TodoChatItem | undefined = [...items].reverse().find((it): it is TodoChatItem => it.kind === 'todo')
  const [dirOpen, setDirOpen] = useState(true)
  // 默认 300:主窗略收后右轨同步;key 升 v4 使旧 320 缓存不锁死
  const { width, handleProps } = useResizable({ edge: 'left', min: 260, max: 540, fallback: 300, storageKey: 'lumen:railWidth.v4' })
  const sharedFileRef = useRef<HTMLInputElement>(null)
  const shared = assets.filter(isShared)
  const session = assets.filter((a) => !isShared(a))
  // 会话已停:in_progress 视同完成(停转圈/计数);pending 仍空着(中断未做)
  const todoDone = todo
    ? todo.todos.filter((t) => t.status === 'completed' || (!running && t.status === 'in_progress')).length
    : 0
  const todoN = todo?.todos.length ?? 0

  function onPickShared(e: ChangeEvent<HTMLInputElement>): void {
    const files = filterComposerFiles(e.target.files)
    e.target.value = ''
    if (files.length && onUploadShared) onUploadShared(files)
  }

  return (
    <aside className="rail" aria-label="工具轨" style={{ '--rail-w': `${width}px` } as CSSProperties}>
      <div className="rail-resize" role="separator" aria-orientation="vertical" aria-label="调整工作目录宽度(双击复位)" title="拖拽调宽 · 双击复位" {...handleProps} />
      {/* 仅 Todo 占「进度」：搜索/抓取/跑代码等普通工具只在主对话过程块，不在此铺长列表 */}
      {todo && todo.todos.length > 0 && (
        <section className="rail-card glass-beam">
          <h3 className="rail-h">
            进度
            <span className="rail-count">{todoDone}/{todoN}</span>
          </h3>
          <ul className="rail-todo-steps">
            {todo.todos.map((t) => {
              const effective: TodoEntry['status'] =
                t.status === 'in_progress' && !running ? 'completed' : t.status
              return (
                <li key={t.id} className={`rail-todo-step is-${effective}`}>
                  <TodoMark status={t.status} live={running} />
                  <span className="rail-todo-label">
                    {effective === 'in_progress' ? t.activeForm : t.content}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="rail-card glass-beam">
        <button type="button" className="rail-h rail-toggle" onClick={() => setDirOpen((v) => !v)} aria-expanded={dirOpen}>
          <FoldersIcon size={ICON_MD} />
          <span>工作目录</span>
          <span className="rail-count">{assets.length}</span>
          <ChevronIcon open={dirOpen} />
        </button>
        <CurtainFold open={dirOpen}>
          <div className="rail-dir-body">
            <div className="rail-group">
              <div className="rail-group-head">
                {WORKSPACE_SCOPE_COPY.shared}
                <span className="rail-group-n">{shared.length}</span>
                {onUploadShared && (
                  <>
                    <button
                      type="button"
                      className="rail-upload-shared"
                      title={WORKSPACE_SCOPE_COPY.uploadShared}
                      aria-label={WORKSPACE_SCOPE_COPY.uploadShared}
                      onClick={() => sharedFileRef.current?.click()}
                    >
                      <PlusIcon size={12} />
                    </button>
                    <input ref={sharedFileRef} type="file" multiple hidden onChange={onPickShared} />
                  </>
                )}
              </div>
              {shared.map((a) => {
                const inner = (
                  <>
                    <span className="ws-file-icon"><FileTypeIcon name={a.name} size={ICON_MD} /></span>
                    <span className="ws-name">{a.name}</span>
                  </>
                )
                return OPENABLE.includes(a.kind)
                  ? <button key={a.path} className="ws-item" onClick={() => onOpen(a)}>{inner}</button>
                  : <div key={a.path} className="ws-item ws-item-static">{inner}</div>
              })}
            </div>
            <AssetGroup label={WORKSPACE_SCOPE_COPY.session} items={session} onOpen={onOpen} />
          </div>
        </CurtainFold>
      </section>
    </aside>
  )
}

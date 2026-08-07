/**
 * [INPUT]: Asset(含 scope);ChatItem;icons;useResizable;WORKSPACE_SCOPE_COPY;filterComposerFiles
 * [OUTPUT]: UtilityRail —— 进度 + 工作目录(共享区 / 本会话)
 * [POS]: 右轨;阅读器打开时由 ReaderPane 替换;共享区上传与 composer 同宽准入
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import type { Asset } from '../agent-client'
import type { ChatItem, ProcessItem } from '../useAgent'
import { WORKSPACE_SCOPE_COPY } from '../appCopy'
import { filterComposerFiles } from '../composerAccept'
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

export function UtilityRail({ assets, onOpen, items, running, onUploadShared }: {
  assets: Asset[]
  onOpen: (a: Asset) => void
  items: ChatItem[]
  running: boolean
  /** 有则显示「上传到共享区」 */
  onUploadShared?: (files: File[]) => void
}) {
  const proc: ProcessItem | undefined = running
    ? [...items].reverse().find((it): it is ProcessItem => it.kind === 'process' && it.running)
    : undefined
  const [dirOpen, setDirOpen] = useState(true)
  const { width, handleProps } = useResizable({ edge: 'left', min: 240, max: 480, fallback: 280, storageKey: 'lumen:railWidth.v2' })
  const sharedFileRef = useRef<HTMLInputElement>(null)
  const shared = assets.filter(isShared)
  const session = assets.filter((a) => !isShared(a))

  function onPickShared(e: ChangeEvent<HTMLInputElement>): void {
    const files = filterComposerFiles(e.target.files)
    e.target.value = ''
    if (files.length && onUploadShared) onUploadShared(files)
  }

  return (
    <aside className="rail" aria-label="工具轨" style={{ '--rail-w': `${width}px` } as CSSProperties}>
      <div className="rail-resize" role="separator" aria-orientation="vertical" aria-label="调整工作目录宽度(双击复位)" title="拖拽调宽 · 双击复位" {...handleProps} />
      {proc && (
        <section className="rail-card glass-beam">
          <h3 className="rail-h">进度</h3>
          <ul className="proc-steps rail-steps">
            {proc.steps.map((s) => (
              <li key={s.id} className="proc-step">
                <span className={`proc-step-dot ${s.done ? 'is-done' : ''}`} />
                <span>{s.label}</span>
              </li>
            ))}
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
        {dirOpen && (
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
        )}
      </section>
    </aside>
  )
}

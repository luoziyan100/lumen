/**
 * 工作区抽屉:Cowork 式独立卡片——论文 / 产物 / 图片 / 文件 各一张,单独折叠,状态记忆。
 * PDF 与文档可点开阅读器;图片与其它文件先陈列。
 */
import { useState } from 'react'
import type { Asset } from '../agent-client'
import { WORKSPACE_DRAWER_COPY } from '../appCopy'
import { ChevronIcon } from './icons'

const TAG_CLASS: Record<Asset['kind'], string> = { pdf: 'pdf', doc: 'md', image: 'img', file: 'file' }
const TAG_TEXT: Record<Asset['kind'], string> = { pdf: 'PDF', doc: 'MD', image: 'IMG', file: 'FILE' }

function Card({ label, items, onOpen }: {
  label: string; items: Asset[]; onOpen: (a: Asset) => void
}) {
  const storageKey = `lumen:ws-card:${label}`
  const [open, setOpen] = useState(() => localStorage.getItem(storageKey) !== '0')
  if (!items.length) return null

  function toggle(): void {
    const next = !open
    setOpen(next)
    localStorage.setItem(storageKey, next ? '1' : '0')
  }

  return (
    <section className="ws-card">
      <button className="ws-card-head" onClick={toggle} aria-expanded={open}>
        <span className="ws-card-title">{label}</span>
        <span className="ws-group-n">{items.length}</span>
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div className="ws-card-body">
          {items.map((a) => {
            const inner = (
              <>
                <span className={`ws-tag ws-tag-${TAG_CLASS[a.kind]}`}>{TAG_TEXT[a.kind]}</span>
                <span className="ws-name">{a.name}</span>
              </>
            )
            // 混类型组:PDF/文档可点开阅读器;图片与其它文件先陈列
            const clickable = a.kind === 'pdf' || a.kind === 'doc'
            return clickable
              ? <button key={a.path} className="ws-item" onClick={() => onOpen(a)}>{inner}</button>
              : <div key={a.path} className="ws-item ws-item-static">{inner}</div>
          })}
        </div>
      )}
    </section>
  )
}

/** 用户上传归位的目录(saveUpload 写入);其余视为 agent 产出 */
const UPLOAD_DIR = /^(papers|docs|images|uploads)\//

export function WorkspaceDrawer({ assets, onOpen }: {
  assets: Asset[]; onOpen: (a: Asset) => void
}) {
  return (
    <aside className="ws-drawer" id="workspace-drawer">
      <header className="ws-head">
        <span className="ws-title">
          {WORKSPACE_DRAWER_COPY.title} <span className="ws-count">{assets.length} {WORKSPACE_DRAWER_COPY.countUnit}</span>
        </span>
      </header>
      {assets.length === 0
        ? <p className="ws-empty">还没有资产。让 Lumen 去研究,或上传文件。</p>
        : <>
            {/* 按来源分组:Workfolder=你放进来的(不限类型) / Output=Lumen 产出的 */}
            <Card label="Workfolder" items={assets.filter((a) => UPLOAD_DIR.test(a.path))} onOpen={onOpen} />
            <Card label="Output" items={assets.filter((a) => !UPLOAD_DIR.test(a.path))} onOpen={onOpen} />
          </>}
    </aside>
  )
}

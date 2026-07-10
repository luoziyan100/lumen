/**
 * 右侧工具轨(持久):只放有真实数据的卡(owner 定)——
 *   进度(运行中的过程步骤) · 工作目录(本会话产物 ws.assets)。
 * 连接器/上下文等尚不具备的能力一律不摆(owner 定「没有的功能不放」)。
 * PDF / HTML / 文档点开走阅读器(替换本轨)。
 */
import { useState, type CSSProperties } from 'react'
import type { Asset } from '../agent-client'
import type { ChatItem, ProcessItem } from '../useAgent'
import { ChevronIcon, FileTypeIcon, FoldersIcon, ICON_MD } from './icons'
import { useResizable } from '../useResizable'

const OPENABLE: Asset['kind'][] = ['pdf', 'doc', 'html']
const UPLOAD_DIR = /^(papers|docs|images|uploads)\//

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

export function UtilityRail({ assets, onOpen, items, running }: {
  assets: Asset[]; onOpen: (a: Asset) => void; items: ChatItem[]; running: boolean
}) {
  const proc: ProcessItem | undefined = running
    ? [...items].reverse().find((it): it is ProcessItem => it.kind === 'process' && it.running)
    : undefined
  const [dirOpen, setDirOpen] = useState(true) // 工作目录默认展开;点标题收放
  const { width, handleProps } = useResizable({ edge: 'left', min: 260, max: 480, fallback: 320, storageKey: 'lumen:railWidth' })

  return (
    <aside className="rail" aria-label="工具轨" style={{ '--rail-w': `${width}px` } as CSSProperties}>
      <div className="rail-resize" role="separator" aria-orientation="vertical" aria-label="调整工作目录宽度(双击复位)" title="拖拽调宽 · 双击复位" {...handleProps} />
      {proc && (
        <section className="rail-card">
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

      <section className="rail-card">
        <button type="button" className="rail-h rail-toggle" onClick={() => setDirOpen((v) => !v)} aria-expanded={dirOpen}>
          <FoldersIcon size={ICON_MD} />
          <span>工作目录</span>
          <span className="rail-count">{assets.length}</span>
          <ChevronIcon open={dirOpen} />
        </button>
        {dirOpen && assets.length > 0 && (
          <div className="rail-dir-body">
            <AssetGroup label="资料" items={assets.filter((a) => UPLOAD_DIR.test(a.path))} onOpen={onOpen} />
            <AssetGroup label="产物" items={assets.filter((a) => !UPLOAD_DIR.test(a.path))} onOpen={onOpen} />
          </div>
        )}
      </section>
    </aside>
  )
}

/**
 * 右侧工具轨(持久):只放有真实数据的卡(owner 定)——
 *   进度(运行中的过程步骤) · 工作目录(本会话产物 ws.assets)。
 * 连接器/上下文等尚不具备的能力一律不摆(owner 定「没有的功能不放」)。
 * PDF/文档点开走阅读器(替换本轨)。
 */
import type { Asset } from '../agent-client'
import type { ChatItem, ProcessItem } from '../useAgent'
import { FoldersIcon, PdfIcon, ICON_SM, ICON_MD } from './icons'

const TAG_CLASS: Record<Asset['kind'], string> = { pdf: 'pdf', doc: 'md', image: 'img', file: 'file' }
const TAG_TEXT: Record<Asset['kind'], string> = { pdf: 'PDF', doc: 'MD', image: 'IMG', file: 'FILE' }
const UPLOAD_DIR = /^(papers|docs|images|uploads)\//

function AssetGroup({ label, items, onOpen }: { label: string; items: Asset[]; onOpen: (a: Asset) => void }) {
  if (!items.length) return null
  return (
    <div className="rail-group">
      <div className="rail-group-head">{label}<span className="rail-group-n">{items.length}</span></div>
      {items.map((a) => {
        const inner = (
          <>
            {a.kind === 'pdf'
              ? <span className="ws-tag-icon" title="PDF"><PdfIcon size={ICON_SM} /></span>
              : <span className={`ws-tag ws-tag-${TAG_CLASS[a.kind]}`}>{TAG_TEXT[a.kind]}</span>}
            <span className="ws-name">{a.name}</span>
          </>
        )
        return a.kind === 'pdf' || a.kind === 'doc'
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

  return (
    <aside className="rail" aria-label="工具轨">
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
        <h3 className="rail-h"><FoldersIcon size={ICON_MD} />工作目录<span className="rail-count">{assets.length}</span></h3>
        {assets.length === 0
          ? <p className="rail-empty">本会话的产物会出现在这里——让 Lumen 去研究,或上传给它。</p>
          : <>
              <AssetGroup label="资料" items={assets.filter((a) => UPLOAD_DIR.test(a.path))} onOpen={onOpen} />
              <AssetGroup label="产物" items={assets.filter((a) => !UPLOAD_DIR.test(a.path))} onOpen={onOpen} />
            </>}
      </section>
    </aside>
  )
}

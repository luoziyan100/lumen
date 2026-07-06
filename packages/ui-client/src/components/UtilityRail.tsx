/**
 * 右侧工具轨(持久):只放有真实数据的卡(owner 定「只做有真实数据的卡」)——
 *   进度(运行中的过程步骤) · 工作目录(本会话产物 ws.assets) · 连接器(Lumen 真实工具)。
 * 不列未实现的能力(如联网检索/抓取尚不存在,不摆占位)。PDF/文档点开走阅读器(替换本轨)。
 */
import type { Asset } from '../agent-client'
import type { ChatItem, ProcessItem } from '../useAgent'

const TAG_CLASS: Record<Asset['kind'], string> = { pdf: 'pdf', doc: 'md', image: 'img', file: 'file' }
const TAG_TEXT: Record<Asset['kind'], string> = { pdf: 'PDF', doc: 'MD', image: 'IMG', file: 'FILE' }
const UPLOAD_DIR = /^(papers|docs|images|uploads)\//

// 当前真实存在的工具族(见 agent-service/src/tools);未实现的不列
const CONNECTORS = [
  { name: '工作区文件系统', hint: '读写 · 检索会话工作区' },
  { name: '代码沙箱', hint: 'run_code · Seatbelt 限权' },
]

function AssetGroup({ label, items, onOpen }: { label: string; items: Asset[]; onOpen: (a: Asset) => void }) {
  if (!items.length) return null
  return (
    <div className="rail-group">
      <div className="rail-group-head">{label}<span className="rail-group-n">{items.length}</span></div>
      {items.map((a) => {
        const inner = (
          <>
            <span className={`ws-tag ws-tag-${TAG_CLASS[a.kind]}`}>{TAG_TEXT[a.kind]}</span>
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
        <h3 className="rail-h">工作目录<span className="rail-count">{assets.length}</span></h3>
        {assets.length === 0
          ? <p className="rail-empty">本会话的产物会出现在这里——让 Lumen 去研究,或上传给它。</p>
          : <>
              <AssetGroup label="资料" items={assets.filter((a) => UPLOAD_DIR.test(a.path))} onOpen={onOpen} />
              <AssetGroup label="产物" items={assets.filter((a) => !UPLOAD_DIR.test(a.path))} onOpen={onOpen} />
            </>}
      </section>

      <section className="rail-card">
        <h3 className="rail-h">连接器</h3>
        {CONNECTORS.map((c) => (
          <div key={c.name} className="rail-conn">
            <span className="rail-conn-dot" />
            <span className="rail-conn-text">
              <span className="rail-conn-name">{c.name}</span>
              <span className="rail-conn-hint">{c.hint}</span>
            </span>
          </div>
        ))}
      </section>
    </aside>
  )
}

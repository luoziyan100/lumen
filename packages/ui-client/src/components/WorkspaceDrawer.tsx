/** 工作区抽屉:论文(PDF)/ 产物(.md)两组列表。点条目 → 在阅读器打开。 */
import type { Asset } from '../agent-client'

function Group({ label, items, tag, onOpen }: {
  label: string; items: Asset[]; tag: 'PDF' | 'MD'; onOpen: (a: Asset) => void
}) {
  if (!items.length) return null
  return (
    <section className="ws-group">
      <div className="ws-group-head">
        <span className="t-caps">{label}</span>
        <span className="ws-rule" />
        <span className="ws-group-n">{items.length}</span>
      </div>
      {items.map((a) => (
        <button key={a.path} className="ws-item" onClick={() => onOpen(a)}>
          <span className={`ws-tag ws-tag-${tag === 'PDF' ? 'pdf' : 'md'}`}>{tag}</span>
          <span className="ws-name">{a.name}</span>
        </button>
      ))}
    </section>
  )
}

export function WorkspaceDrawer({ assets, onOpen, onClose }: {
  assets: Asset[]; onOpen: (a: Asset) => void; onClose: () => void
}) {
  return (
    <aside className="ws-drawer">
      <header className="ws-head">
        <span className="ws-title">工作区 <span className="ws-count">{assets.length} 项</span></span>
        <button className="ws-close" onClick={onClose} aria-label="收起">→</button>
      </header>
      {assets.length === 0
        ? <p className="ws-empty">还没有资产。让 Lumen 去研究,或上传一篇 PDF。</p>
        : <>
            <Group label="论文" items={assets.filter((a) => a.kind === 'pdf')} tag="PDF" onOpen={onOpen} />
            <Group label="产物" items={assets.filter((a) => a.kind === 'doc')} tag="MD" onOpen={onOpen} />
          </>}
    </aside>
  )
}

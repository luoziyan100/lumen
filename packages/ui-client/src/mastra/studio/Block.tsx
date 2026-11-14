/**
 * [INPUT]: 服务端区块（text/ladder/table/widget，内容合同见 mastra-service studio/content.ts）、主题材料标题、小部件激活名额
 * [OUTPUT]: BlockCard：一块的完整渲染——标题（块里最强的字）、署名只进 aria-label（P0 全是 AI 画的）、底部一行出处签（无出处即「AI 推断」，R9）、已被取代变灰（R10）；梯子（断点在两级之间）与表格为新建渲染，文字复用 Markdown，小部件复用 WidgetFrame
 * [POS]: 白板画布里的单块；P0 对人只读，没有编辑入口。小部件超出同时运行名额时显示占位，点开才运行（WebKit 约束）
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { Markdown } from '../../components/Markdown'
import { WidgetFrame } from '../../components/widget/WidgetFrame'
import { useT } from '../../i18n/index.ts'
import type { SheetView, TopicMaterial } from '../data/client.ts'

export type Block = SheetView['blocks'][number]
type Ladder = { rungs: { level: number; text: string }[]; here: number; foggedAbove?: number; breakAt?: number }
type Table = { columns: string[]; rows: string[][]; guessCells?: [number, number][] }

/** 断点画在 breakAt 那级和上一级之间：「从这一级往上爬不上去」（原型 .break）。 */
function LadderView({ value }: { value: Ladder }) {
  const { studio: S, common: { labelled } } = useT()
  const rungs = [...value.rungs].sort((a, b) => b.level - a.level)
  return <ol className="ladder" aria-label={S.board.ladder}>
    {rungs.flatMap((rung, index) => {
      const fog = value.foggedAbove !== undefined && rung.level > value.foggedAbove
      const item = <li key={rung.level} className={`rung${rung.level === value.here ? ' rung-here' : ''}${fog ? ' rung-fog' : ''}`} data-level={rung.level}>
        <span className="rung-text">{fog ? S.board.fog : rung.text}</span>
        {rung.level === value.here && <span className="rung-here-tag">{S.board.here}</span>}
      </li>
      return rung.level === value.breakAt && index > 0 ? [<li key={`break-${rung.level}`} className="rung-break" role="note">{S.board.broken}</li>, item] : [item]
    })}
  </ol>
}

function TableView({ value }: { value: Table }) {
  const { studio: S, common: { labelled } } = useT()
  const guess = new Set((value.guessCells ?? []).map(([row, column]) => `${row}:${column}`))
  return <div className="block-table-wrap"><table className="block-table">
    <thead><tr>{value.columns.map((column, index) => <th key={index}>{column}</th>)}</tr></thead>
    <tbody>{value.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => guess.has(`${r}:${c}`)
      ? <td key={c} className="guess-cell" title={S.board.guess}>{cell || S.board.guess}</td>
      : <td key={c}>{cell}</td>)}</tr>)}</tbody>
  </table></div>
}

export function BlockCard({ block, materials, supersededTitle, widgetActive, onActivateWidget, onOpenSource, focused, drawing }: {
  block: Block
  materials: Map<string, TopicMaterial>
  supersededTitle?: string
  widgetActive: boolean
  onActivateWidget: (blockId: string) => void
  onOpenSource: (itemId: string, page?: number) => void
  focused: boolean
  drawing: boolean
}) {
  const { studio: S, common: { labelled } } = useT()
  const content = block.content as Record<string, unknown>
  const body = block.kind === 'text' ? <div className="block-text"><Markdown>{String(content.markdown ?? '')}</Markdown></div>
    : block.kind === 'ladder' ? <LadderView value={content as unknown as Ladder} />
    : block.kind === 'table' ? <TableView value={content as unknown as Table} />
    : widgetActive ? <div className="block-widget"><WidgetFrame widgetCode={String(content.html ?? '')} title={block.title} isStreaming={false} light /></div>
    : <div className="block-widget block-widget-idle"><span>{S.board.widgetIdle}</span><button type="button" className="btn" onClick={() => onActivateWidget(block.id)}>{S.board.widgetRun}</button></div>
  const superseded = block.state === 'superseded'
  return <article id={`block-${block.id}`} data-block={block.id} data-kind={block.kind}
    className={`board-block board-block-${block.kind}${superseded ? ' is-superseded' : ''}${block.state === 'settled' ? ' is-settled' : ''}${focused ? ' is-focused' : ''}${drawing ? ' is-drawing' : ''}`}
    style={{ left: block.x, top: block.y, width: block.w }} aria-label={labelled(S.board.by, block.title)}>
    {(superseded || block.state === 'settled' || drawing) && <header className="block-head">
      {superseded && <span className="block-state">{supersededTitle ? S.board.supersededBy(supersededTitle) : S.board.superseded}</span>}
      {block.state === 'settled' && <span className="block-state">✓ {S.board.settled}</span>}
      {drawing && <span className="block-drawing">{S.board.updating}</span>}
    </header>}
    <h4 className="block-title">{block.title}</h4>
    {body}
    <footer className="block-sources">
      {block.sources.length ? block.sources.map((source, index) => 'itemId' in source
        ? <button type="button" key={index} className="source-chip" title={source.quote ?? undefined} onClick={() => onOpenSource(source.itemId, source.page)}>
          {materials.get(source.itemId)?.title ?? source.itemId}{source.page ? ` · p.${source.page}` : ''}</button>
        : <span key={index} className="source-chip source-chip-thread">{S.board.fromConversation}</span>)
        : <span className="source-chip source-chip-inferred">{S.board.inferred}</span>}
    </footer>
  </article>
}

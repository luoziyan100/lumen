/**
 * [INPUT]: 服务端区块（text/ladder/table/widget，内容合同见 mastra-service studio/content.ts）、主题材料标题、小部件激活名额
 * [OUTPUT]: BlockCard：一块的完整渲染——标题、AI 署名、出处签（无出处即「AI 推断」，R9）、已被取代变灰（R10）；梯子与表格为新建渲染，文字复用 Markdown，小部件复用 WidgetFrame
 * [POS]: 白板画布里的单块；P0 对人只读，没有编辑入口。小部件超出同时运行名额时显示占位，点开才运行（WebKit 约束）
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { Markdown } from '../../components/Markdown'
import { WidgetFrame } from '../../components/widget/WidgetFrame'
import { STUDIO_COPY as S } from '../../copy/studioCopy'
import type { SheetView, TopicMaterial } from '../data/client.ts'

export type Block = SheetView['blocks'][number]
type Ladder = { rungs: { level: number; text: string }[]; here: number; foggedAbove?: number; breakAt?: number }
type Table = { columns: string[]; rows: string[][]; guessCells?: [number, number][] }

function LadderView({ value }: { value: Ladder }) {
  const rungs = [...value.rungs].sort((a, b) => b.level - a.level)
  return <ol className="ladder" aria-label="理解的梯子">
    {rungs.map(rung => {
      const fog = value.foggedAbove !== undefined && rung.level > value.foggedAbove
      return <li key={rung.level} className={`rung${rung.level === value.here ? ' rung-here' : ''}${fog ? ' rung-fog' : ''}`} data-level={rung.level}>
        <span className="rung-text">{fog ? S.board.fog : rung.text}</span>
        {rung.level === value.here && <span className="rung-here-tag">{S.board.here}</span>}
        {rung.level === value.breakAt && <span className="rung-break" role="note">{S.board.broken}</span>}
      </li>
    })}
  </ol>
}

function TableView({ value }: { value: Table }) {
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
  const content = block.content as Record<string, unknown>
  const body = block.kind === 'text' ? <div className="block-text"><Markdown>{String(content.markdown ?? '')}</Markdown></div>
    : block.kind === 'ladder' ? <LadderView value={content as unknown as Ladder} />
    : block.kind === 'table' ? <TableView value={content as unknown as Table} />
    : widgetActive ? <div className="block-widget"><WidgetFrame widgetCode={String(content.html ?? '')} title={block.title} isStreaming={false} /></div>
    : <div className="block-widget block-widget-idle"><span>{S.board.widgetIdle}</span><button type="button" className="btn" onClick={() => onActivateWidget(block.id)}>{S.board.widgetRun}</button></div>
  const superseded = block.state === 'superseded'
  return <article id={`block-${block.id}`} data-block={block.id} data-kind={block.kind}
    className={`board-block board-block-${block.kind}${superseded ? ' is-superseded' : ''}${block.state === 'settled' ? ' is-settled' : ''}${focused ? ' is-focused' : ''}${drawing ? ' is-drawing' : ''}`}
    style={{ left: block.x, top: block.y, width: block.w }} aria-label={block.title}>
    <header className="block-head">
      <span className="block-by">{S.board.by}</span>
      {superseded && <span className="block-state">{supersededTitle ? S.board.supersededBy(supersededTitle) : S.board.superseded}</span>}
      {block.state === 'settled' && <span className="block-state">✓ {S.board.settled}</span>}
      {drawing && <span className="block-drawing">{S.board.updating}</span>}
    </header>
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

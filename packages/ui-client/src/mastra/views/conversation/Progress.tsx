/**
 * [INPUT]: 官方 displayState 的 tasks/tokenUsage 与子用量
 * [OUTPUT]: Progress、ToolActivity：任务/累计用量（可仅显示用量）与进行中工具
 * [POS]: 原生和派生用量的只读呈现；旧导入无 usage 时不编造消耗
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useT, formatNumber as number } from '../../../i18n/index.ts'
import type { DisplayState } from '../../data/client.ts'

export function Progress({ display, showTasks = true }: { display: DisplayState | null; showTasks?: boolean }) {
  const C = useT().chat
  if (!display) return null
  const { tasks, tokenUsage: main, childTokenUsage: child } = display
  const usage = { promptTokens: main.promptTokens + (child?.promptTokens ?? 0), completionTokens: main.completionTokens + (child?.completionTokens ?? 0), totalTokens: main.totalTokens + (child?.totalTokens ?? 0) }
  const cached = main.cachedInputTokens === undefined && child?.cachedInputTokens === undefined ? undefined : (main.cachedInputTokens ?? 0) + (child?.cachedInputTokens ?? 0)
  const reasoning = main.reasoningTokens === undefined && child?.reasoningTokens === undefined ? undefined : (main.reasoningTokens ?? 0) + (child?.reasoningTokens ?? 0)
  const completed = tasks.filter(task => task.status === 'completed').length
  return <div className="mw-progress">
    {showTasks && tasks.length > 0 && <section aria-label={C.taskList}><header><strong>{C.taskList}</strong><span>{completed} / {tasks.length}</span></header>
      <ol>{tasks.map(task => <li key={task.id} data-status={task.status}><span className="mw-task-state">{C.taskStatus[task.status]}</span><span>{task.status === 'in_progress' ? task.activeForm || task.content : task.content}</span></li>)}</ol>
    </section>}
    {usage.totalTokens > 0 && <div className="mw-usage" aria-label={C.tokenUsage}>
      <span>{C.mainUsage(number(main.totalTokens))}</span><span>{C.childUsage(child ? number(child.totalTokens) : null)}</span>
      <span>{C.totalUsage(number(usage.totalTokens))}</span><span>{C.inputTokens} {number(usage.promptTokens)}</span><span>{C.outputTokens} {number(usage.completionTokens)}</span>
      {cached !== undefined && <span>{C.cachedTokens} {number(cached)}</span>}
      {reasoning !== undefined && <span>{C.reasoningTokens} {number(reasoning)}</span>}
    </div>}
  </div>
}

// 原生 activeTools 保留已完成/失败项；历史结果由会话正文呈现。
export function ToolActivity({ display }: { display: DisplayState | null }) {
  const C = useT().chat
  if (!display) return null
  return <>{Object.entries(display.activeTools)
    .filter(([, tool]) => tool.status === 'running' || tool.status === 'streaming_input')
    .map(([id, tool]) => <p className="mw-activity" key={id}>{tool.name} · {C.working}</p>)}</>
}

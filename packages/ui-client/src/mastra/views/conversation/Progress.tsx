/**
 * [INPUT]: 官方 displayState 的 tasks/tokenUsage、子用量与最后主请求的真实输入计量
 * [OUTPUT]: Progress、ToolActivity、ContextMeter：任务/累计用量（可仅显示用量）、进行中工具及上次输入占窗口比例
 * [POS]: 原生和派生用量的只读呈现；旧导入无 usage 时不编造消耗
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useT, formatNumber as number } from '../../../i18n/index.ts'
import { useEffect, useState } from 'react'
import type { DisplayState, Identity, LumenApi } from '../../data/client.ts'

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

// 用上次实际主请求衡量上下文；不把会话累计消耗冒充当前窗口占用。
export function ContextMeter({ api, identity, running }: { api: LumenApi; identity: Identity; running: boolean }) {
  const C = useT().chat
  const [value, setValue] = useState<{ lastMainInputTokens: number | null; contextWindow: number } | null>(null)
  useEffect(() => {
    let active = true, pending = false
    const refresh = async () => {
      if (pending) return
      pending = true
      try {
        const next = await api.request<{ lastMainInputTokens: number | null; contextWindow: number }>(`/lumen/budget?${api.query(identity)}`)
        if (active) setValue(next)
      } catch { /* 未计量的历史不显示推测值。 */ }
      finally { pending = false }
    }
    void refresh()
    const timer = running ? window.setInterval(() => { void refresh() }, 3000) : undefined
    return () => { active = false; if (timer !== undefined) clearInterval(timer) }
  }, [api, identity.topicId, identity.taskId, running])
  if (!value || value.lastMainInputTokens === null || !Number.isFinite(value.lastMainInputTokens) || value.contextWindow <= 0) return null
  const ratio = value.lastMainInputTokens / value.contextWindow
  if (ratio < 0.6) return null
  return <small role="status" className={ratio >= 0.85 ? 'mw-error' : 'composer-context'} title={C.contextTitle(number(value.lastMainInputTokens), number(value.contextWindow))}>
    {C.contextShort(Math.round(ratio * 100))}
  </small>
}

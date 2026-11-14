/**
 * [INPUT]: 后端持久评估结果、标注保存状态和显式运行回调
 * [OUTPUT]: Evaluation：录制回放/当前模型评估按钮、执行状态与文本判断
 * [POS]: 区分运行是否完成和预期文本是否匹配；缺证据不显示为成功，不承担评估执行
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { Button } from '@cloudflare/kumo/components/button'
import type { EvaluationResult } from '../data/client.ts'
import { useT, formatDateTime } from '../../i18n/index.ts'

export function Evaluation({ result, disabled, dirty, pending, onRun }: {
  result?: EvaluationResult; disabled: boolean; dirty: boolean; pending: EvaluationResult['mode'] | null
  onRun: (mode: EvaluationResult['mode']) => void
}) {
  const E = useT().evaluation, reason = (value: string) => E.reasons[value] ?? value
  const outcome = result?.execution === 'completed' && result.reply.trim() ? result.judgment : 'not_evaluated'
  return <section className="md-evaluation" aria-label={E.label} aria-busy={!!pending}>
    <h3>{E.title}</h3>
    <div className="md-evaluation-actions">{(['recorded', 'live'] as const).map(mode => <Button key={mode} type="button" variant="secondary" disabled={disabled || dirty} onClick={() => onRun(mode)}>{pending === mode ? E.running(E.modes[mode]) : E.modes[mode]}</Button>)}</div>
    <p className="md-hint">{E.hint}</p>
    {dirty && <p className="md-hint">{E.dirty}</p>}
    {pending && <p role="status">{E.pending(E.modes[pending])}</p>}
    {result && <div className="md-evaluation-result">
      <h4>{E.last}{dirty && E.unsaved}</h4>
      <dl><div><dt>{E.mode}</dt><dd>{E.modes[result.mode]}</dd></div><div><dt>{E.execution}</dt><dd>{E.executions[result.execution]}</dd></div><div><dt>{E.judgment}</dt><dd>{E.judgments[outcome]}</dd></div>{result.model && <div><dt>{E.model}</dt><dd>{result.model}</dd></div>}<div><dt>{E.finished}</dt><dd>{formatDateTime(result.finishedAt)}</dd></div></dl>
      <p>{reason(result.detail)}</p>
      <p className="md-hint">{E.textHint}</p>
      {!!result.gaps.length && <div className="md-evaluation-gaps"><strong>{E.gaps}</strong><ul>{result.gaps.map((gap, index) => <li key={`${index}:${gap}`}>{reason(gap)}</li>)}</ul></div>}
      {result.reply && <><h4>{E.reply}</h4><pre>{result.reply}</pre></>}
    </div>}
  </section>
}

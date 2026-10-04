/**
 * [INPUT]: 后端持久评估结果、标注保存状态和显式运行回调
 * [OUTPUT]: Evaluation：录制回放/当前模型评估按钮、执行状态与文本判断
 * [POS]: 区分运行是否完成和预期文本是否匹配；缺证据不显示为成功，不承担评估执行
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { Button } from '@cloudflare/kumo/components/button'
import type { EvaluationResult } from '../data/client.ts'

const execution = { completed: '运行已完成', failed: '运行失败', unavailable: '无法运行：证据不可用' } as const
const judgment = { matched: '预期文本匹配', mismatched: '预期文本未匹配', not_evaluated: '未作判断' } as const
const modes = { recorded: '录制回放', live: '重新评估' } as const
const reasons: Record<string, string> = {
  missing_source_trace: '此标注没有可用的来源记录。', missing_source_prompt: '记录缺少原始用户输入。',
  source_prompt_truncated: '原始输入不完整，无法还原评估请求。', source_prompt_redacted: '原始输入已脱敏，无法完整还原。',
  unsupported_source_prompt: '记录中的输入格式暂不支持。', non_text_source_prompt: '记录包含无法还原的非文本输入。',
  trace_incomplete_or_child_scope_omitted: '执行记录不完整，或包含无法读取的子任务步骤。',
  model_step_incomplete: '模型步骤尚未结束、已裁剪或缺少完整结果。', model_step_output_unavailable: '缺少可用于回放的模型输出。',
  duplicate_tool_call_identity: '记录中的工具调用身份重复，无法准确配对。', missing_or_ambiguous_tool_result: '工具结果缺失或无法唯一配对。',
  tool_result_incomplete: '工具执行结果不完整。', tool_result_identity_mismatch: '工具结果与原调用的身份或参数不一致。',
  missing_terminal_model_step: '记录缺少完整的最终模型步骤，或超出本次回放范围。',
  live_model_not_configured: '请先在设置中配置可用模型。', evaluation_cancelled_or_timed_out: '本次评估已取消或超时。',
  evaluation_empty_response: '模型没有返回可判断的正文。', evaluation_failed: '本次评估失败。',
  recorded_model_exhausted: '执行所需的模型步骤超出已有记录。', recorded_sequence_incomplete: '已有记录未能完整重放。',
  recorded_tool_identity_or_arguments_mismatch: '回放工具调用与原记录不一致。',
}
const reason = (value: string) => reasons[value] ?? value

export function Evaluation({ result, disabled, dirty, pending, onRun }: {
  result?: EvaluationResult; disabled: boolean; dirty: boolean; pending: EvaluationResult['mode'] | null
  onRun: (mode: EvaluationResult['mode']) => void
}) {
  const outcome = result?.execution === 'completed' && result.reply.trim() ? result.judgment : 'not_evaluated'
  return <section className="md-evaluation" aria-label="标注评估" aria-busy={!!pending}>
    <h3>验证标注</h3>
    <div className="md-evaluation-actions">{(['recorded', 'live'] as const).map(mode => <Button key={mode} type="button" variant="secondary" disabled={disabled || dirty} onClick={() => onRun(mode)}>{pending === mode ? `${modes[mode]}中…` : modes[mode]}</Button>)}</div>
    <p className="md-hint">录制回放只使用保存的证据，不访问外部模型或真实工具。重新评估会向当前模型发送一次无工具请求，可能产生费用。</p>
    {dirty && <p className="md-hint">请先保存标注修改，再运行评估。</p>}
    {pending && <p role="status">正在{modes[pending]}，结果会保存在此标注中。</p>}
    {result && <div className="md-evaluation-result">
      <h4>上次结果{dirty && '（标注有未保存修改）'}</h4>
      <dl><div><dt>方式</dt><dd>{modes[result.mode]}</dd></div><div><dt>执行状态</dt><dd>{execution[result.execution]}</dd></div><div><dt>文本判断</dt><dd>{judgment[outcome]}</dd></div>{result.model && <div><dt>模型</dt><dd>{result.model}</dd></div>}<div><dt>完成时间</dt><dd>{new Date(result.finishedAt).toLocaleString()}</dd></div></dl>
      <p>{reason(result.detail)}</p>
      <p className="md-hint">文本判断只检查回复是否包含预期文字，不代表回答质量通过或问题已修复。</p>
      {!!result.gaps.length && <div className="md-evaluation-gaps"><strong>证据缺口</strong><ul>{result.gaps.map((gap, index) => <li key={`${index}:${gap}`}>{reason(gap)}</li>)}</ul></div>}
      {result.reply && <><h4>回复</h4><pre>{result.reply}</pre></>}
    </div>}
  </section>
}

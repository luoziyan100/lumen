/**
 * [INPUT]: 共享Disclosure卷帘、服务已授权和脱敏的原生 trace、用户标注回调
 * [OUTPUT]: Trace：步骤层次、输入输出与错误的只读查看
 * [POS]: 直接呈现原生 span，不合成第二份执行状态；所有负载按文本显示
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { Disclosure } from '../../components/disclosure/Disclosure'
import { Button } from '@cloudflare/kumo/components/button'
import type { DiagnosticTrace, DiagnosticSpan } from '../data/client.ts'
import { useT, formatDateTime } from '../../i18n/index.ts'

export interface CaseTarget { traceId: string; spanId?: string }
const printed = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value, null, 2)
function depth(span: DiagnosticSpan, spans: Map<string, DiagnosticSpan>) {
  let level = 0, parent = span.parentSpanId
  while (parent && level < 5) { level++; parent = spans.get(parent)?.parentSpanId ?? null }
  return level
}

export function Trace({ trace, onMark }: { trace: DiagnosticTrace; onMark: (target: CaseTarget) => void }) {
  const T = useT().trace
  const spans = new Map(trace.spans.map(span => [span.spanId, span]))
  return <section className="md-trace" aria-label={T.label}>
    <header><div><strong>{T.title}</strong><code>{trace.traceId}</code><small>{T.steps(trace.spans.length, trace.nativeSpanCount)}</small></div><Button variant="secondary" onClick={() => onMark({ traceId: trace.traceId })}>{T.mark}</Button></header>
    {trace.spans.map(span => <Disclosure className="md-span" key={span.spanId} style={{ marginLeft: depth(span, spans) * 10 }} summary={<><span>{span.name}</span><small>{span.type}{span.error ? T.error : ''}{span.redacted ? T.redacted : ''}{span.truncated ? T.truncated : ''}</small></>}>
      <div className="md-span-meta"><code>{span.spanId}</code><time>{formatDateTime(span.startedAt)}</time><span>{span.endedAt ? T.ended : T.notEnded}</span><Button variant="ghost" onClick={() => onMark({ traceId: trace.traceId, spanId: span.spanId })}>{T.markStep}</Button></div>
      {([[T.fields.input, span.input], [T.fields.output, span.output], [T.fields.error, span.error], [T.fields.attributes, span.attributes], [T.fields.metadata, span.metadata]] as const).map(([label, value]) => value !== null && value !== undefined ? <section key={label}><h4>{label}</h4><pre>{printed(value)}</pre></section> : null)}
    </Disclosure>)}
  </section>
}

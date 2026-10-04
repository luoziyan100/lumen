/**
 * [INPUT]: 共享Disclosure卷帘、服务已授权和脱敏的原生 trace、用户标注回调
 * [OUTPUT]: Trace：步骤层次、输入输出与错误的只读查看
 * [POS]: 直接呈现原生 span，不合成第二份执行状态；所有负载按文本显示
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { Disclosure } from '../../components/disclosure/Disclosure'
import { Button } from '@cloudflare/kumo/components/button'
import type { DiagnosticTrace, DiagnosticSpan } from '../data/client.ts'

export interface CaseTarget { traceId: string; spanId?: string }
const printed = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value, null, 2)
function depth(span: DiagnosticSpan, spans: Map<string, DiagnosticSpan>) {
  let level = 0, parent = span.parentSpanId
  while (parent && level < 5) { level++; parent = spans.get(parent)?.parentSpanId ?? null }
  return level
}

export function Trace({ trace, onMark }: { trace: DiagnosticTrace; onMark: (target: CaseTarget) => void }) {
  const spans = new Map(trace.spans.map(span => [span.spanId, span]))
  return <section className="md-trace" aria-label="执行步骤">
    <header><div><strong>执行记录</strong><code>{trace.traceId}</code><small>{trace.spans.length} / {trace.nativeSpanCount} 个步骤</small></div><Button variant="secondary" onClick={() => onMark({ traceId: trace.traceId })}>标注此记录</Button></header>
    {trace.spans.map(span => <Disclosure className="md-span" key={span.spanId} style={{ marginLeft: depth(span, spans) * 10 }} summary={<><span>{span.name}</span><small>{span.type}{span.error ? ' · 有错误' : ''}{span.redacted ? ' · 已脱敏' : ''}{span.truncated ? ' · 已裁剪' : ''}</small></>}>
      <div className="md-span-meta"><code>{span.spanId}</code><time>{new Date(span.startedAt).toLocaleString()}</time><span>{span.endedAt ? '步骤已结束' : '未记录结束'}</span><Button variant="ghost" onClick={() => onMark({ traceId: trace.traceId, spanId: span.spanId })}>标注此步骤</Button></div>
      {([['输入', span.input], ['输出', span.output], ['错误', span.error], ['属性', span.attributes], ['元数据', span.metadata]] as const).map(([label, value]) => value !== null && value !== undefined ? <section key={label}><h4>{label}</h4><pre>{printed(value)}</pre></section> : null)}
    </Disclosure>)}
  </section>
}

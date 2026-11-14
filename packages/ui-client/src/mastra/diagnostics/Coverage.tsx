/**
 * [INPUT]: 共享Disclosure卷帘、当前采集状态与选中 trace 的脱敏、裁剪和完成标志
 * [OUTPUT]: Coverage：诊断证据的真实边界与当前可见缺口
 * [POS]: 将框架观察和完整审计明确区分，不从工具成功或摘要校验推断执行正确
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { Disclosure } from '../../components/disclosure/Disclosure'
import type { DiagnosticTrace } from '../data/client.ts'
import { useT } from '../../i18n/index.ts'

export function Coverage({ enabled, total, trace }: { enabled?: boolean; total?: number; trace?: DiagnosticTrace | null }) {
  const V = useT().coverage
  const redacted = trace?.spans.some(span => span.redacted), truncated = trace?.truncated || trace?.spans.some(span => span.truncated)
  return <section className="md-coverage" aria-label={V.label}>
    <p><strong>{V.title}</strong>{enabled !== undefined && <span>{V.state(enabled)}</span>}</p>
    {total === 0 && <p>{V.empty}</p>}
    {redacted && <p>{V.redacted}</p>}{truncated && <p>{V.truncated}</p>}
    {!!trace?.omittedUnattributedSpans && <p>{V.omitted(trace.omittedUnattributedSpans)}</p>}
    {trace?.spans.some(span => !span.endedAt) && <p>{V.open}</p>}
    <Disclosure summary={V.gaps}><p>{V.gap1}</p><p>{V.gap2}</p><p>{V.gap3}</p></Disclosure>
  </section>
}

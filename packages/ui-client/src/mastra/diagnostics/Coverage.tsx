/**
 * [INPUT]: 共享Disclosure卷帘、当前采集状态与选中 trace 的脱敏、裁剪和完成标志
 * [OUTPUT]: Coverage：诊断证据的真实边界与当前可见缺口
 * [POS]: 将框架观察和完整审计明确区分，不从工具成功或摘要校验推断执行正确
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { Disclosure } from '../../components/disclosure/Disclosure'
import type { DiagnosticTrace } from '../data/client.ts'

export function Coverage({ enabled, total, trace }: { enabled?: boolean; total?: number; trace?: DiagnosticTrace | null }) {
  const redacted = trace?.spans.some(span => span.redacted), truncated = trace?.truncated || trace?.spans.some(span => span.truncated)
  return <section className="md-coverage" aria-label="诊断覆盖范围">
    <p><strong>框架观察记录 · 非完整审计</strong>{enabled !== undefined && <span>当前采集{enabled ? '开启' : '关闭'}</span>}</p>
    {total === 0 && <p>此会话暂无已保存记录，不能据此判断研究是否执行过。</p>}
    {redacted && <p>所选记录已脱敏，部分原文不会显示。</p>}{truncated && <p>所选记录存在裁剪，不能视为完整输入或输出。</p>}
    {!!trace?.omittedUnattributedSpans && <p>另有 {trace.omittedUnattributedSpans} 个步骤未显示：独立子会话或归属链无法核实。父会话收到的委派结果仍保留。</p>}
    {trace?.spans.some(span => !span.endedAt) && <p>包含尚未结束或结束事件缺失的步骤。</p>}
    <Disclosure summary="覆盖范围与缺口"><p>记录 Mastra 观察到的模型、工具和子任务调用；不保证采集、导出投递或外部副作用完整。</p><p>不包含原始 HTTP、SDK 最终网络请求、完整文件和网络副作用、历史文件版本或原二进制。迁移归档在“旧版证据”中独立查看。</p><p>问题标注可显式运行录制回放或当前模型评估；缺证据时会说明无法运行。离线诊断包查看仅展示保存内容，不执行评估。</p></Disclosure>
  </section>
}

/** 过程块:一轮里的 tool_call/tool_result 聚合成一行,默认折叠,点开看每步(§9)。
 *  折叠行为走 Kumo Collapsible(高度动画见 styles.css 的 .collapse-panel)。 */
import { useState } from 'react'
import { Collapsible } from '@cloudflare/kumo/components/collapsible'
import type { ProcessItem } from '../useAgent'

export function ProcessRow({ block }: { block: ProcessItem }) {
  const [open, setOpen] = useState(false)
  const head = block.running
    ? (block.steps[block.steps.length - 1]?.label ?? '研究中…')
    : `研究过程 · ${block.steps.length} 步`
  return (
    <Collapsible.Root className={`proc ${block.running ? 'proc-running' : ''}`} open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger className="proc-head">
        <span className="proc-dot" />
        <span className="proc-label">{head}</span>
        <span className="proc-toggle">{open ? '收起' : `${block.steps.length} 步 ›`}</span>
      </Collapsible.Trigger>
      <Collapsible.Panel className="collapse-panel">
        <ul className="proc-steps">
          {block.steps.map((s) => (
            <li key={s.id} className="proc-step">
              <span className={`proc-step-dot ${s.done ? 'is-done' : ''}`} />
              <span>{s.label}</span>
            </li>
          ))}
        </ul>
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

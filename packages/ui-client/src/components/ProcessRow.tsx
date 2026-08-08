/**
 * [INPUT]: ProcessItem;Kumo Collapsible;StatusOrb;orbStateFromSteps
 * [OUTPUT]: ProcessRow —— 可折叠过程块;左侧点云球按焦点工具态切换(完成态 paused 保留形态)
 * [POS]: 对话流过程叙事行;与 ThinkingIndicator(尚无工具/轮间思考)分离;进度清单见 TodoCard / 右轨 Progress
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useState } from 'react'
import { Collapsible } from '@cloudflare/kumo/components/collapsible'
import { orbStateFromSteps } from '../orbState'
import type { ProcessItem } from '../useAgent'
import { StatusOrb } from './StatusOrb'

export function ProcessRow({ block }: { block: ProcessItem }) {
  const [open, setOpen] = useState(false)
  const head = block.running
    ? (block.steps[block.steps.length - 1]?.label ?? '研究中…')
    : `研究过程 · ${block.steps.length} 步`
  const orbState = orbStateFromSteps(block.steps)
  return (
    <Collapsible.Root className={`proc ${block.running ? 'proc-running' : ''}`} open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger className="proc-head">
        <StatusOrb
          className="proc-orb"
          state={orbState}
          paused={!block.running}
          aria-label={head}
        />
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

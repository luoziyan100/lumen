/**
 * [INPUT]: ProcessItem;Kumo Collapsible;StatusOrb;orbStateFromTool
 * [OUTPUT]: ProcessRow —— 可折叠过程块;运行中左侧点云球按工具态切换
 * [POS]: 对话流过程叙事行;与 ThinkingIndicator(尚无工具)分离;计划卡见 PlanCard
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useState } from 'react'
import { Collapsible } from '@cloudflare/kumo/components/collapsible'
import { ORB_THINKING, orbStateFromTool } from '../orbState'
import type { ProcessItem, ProcStep } from '../useAgent'
import { StatusOrb } from './StatusOrb'
import type { OrbState } from 'thinking-orbs'

/** 当前焦点步:最后一个未完成;全完成则取末步 */
function activeStep(steps: ProcStep[]): ProcStep | undefined {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (!steps[i].done) return steps[i]
  }
  return steps[steps.length - 1]
}

function runningOrbState(steps: ProcStep[]): OrbState {
  if (steps.length > 0 && steps.every((s) => s.done)) return ORB_THINKING
  return orbStateFromTool(activeStep(steps)?.name ?? '')
}

export function ProcessRow({ block }: { block: ProcessItem }) {
  const [open, setOpen] = useState(false)
  const head = block.running
    ? (block.steps[block.steps.length - 1]?.label ?? '研究中…')
    : `研究过程 · ${block.steps.length} 步`
  const orbState = runningOrbState(block.steps)
  return (
    <Collapsible.Root className={`proc ${block.running ? 'proc-running' : ''}`} open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger className="proc-head">
        {block.running ? (
          <StatusOrb className="proc-orb" state={orbState} aria-label={head} />
        ) : (
          <span className="proc-dot" />
        )}
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

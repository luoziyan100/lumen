/**
 * [INPUT]: useAgent 的 PlanItem;Kumo Collapsible
 * [OUTPUT]: PlanCard —— 可折叠任务计划(对标 Implementation plan 进度卡)
 * [POS]: 对话流一等 UI;与 ProcessRow 分离——计划≠工具回放
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useEffect, useState } from 'react'
import { Collapsible } from '@cloudflare/kumo/components/collapsible'
import type { PlanItem, PlanStep } from '../useAgent'

function StepIcon({ status }: { status: PlanStep['status'] }) {
  if (status === 'done') {
    return <span className="plan-step-ic plan-step-ic-done" aria-hidden>✓</span>
  }
  if (status === 'in_progress') {
    return <span className="plan-step-ic plan-step-ic-run" aria-hidden />
  }
  return <span className="plan-step-ic plan-step-ic-pending" aria-hidden />
}

export function PlanCard({ plan }: { plan: PlanItem }) {
  const done = plan.steps.filter((s) => s.status === 'done').length
  const n = plan.steps.length
  const allDone = n > 0 && done === n
  const [open, setOpen] = useState(!allDone)

  useEffect(() => {
    if (allDone) setOpen(false)
  }, [allDone])

  return (
    <Collapsible.Root
      className={`plan-card${allDone ? ' is-complete' : ''}`}
      open={open}
      onOpenChange={setOpen}
    >
      <Collapsible.Trigger className="plan-card-head">
        <span className={`plan-card-badge${allDone ? ' is-done' : ''}`} aria-hidden>
          {allDone ? '✓' : '☰'}
        </span>
        <span className="plan-card-title">{plan.title}</span>
        <span className={`plan-card-count${allDone ? ' is-done' : ''}`}>{done}/{n}</span>
        <span className="plan-card-chev" aria-hidden>{open ? '⌃' : '⌄'}</span>
      </Collapsible.Trigger>
      <Collapsible.Panel className="collapse-panel">
        <ul className="plan-steps">
          {plan.steps.map((s) => (
            <li key={s.id} className={`plan-step is-${s.status}`}>
              <StepIcon status={s.status} />
              <span className="plan-step-label">{s.label}</span>
              {s.status === 'in_progress' ? <span className="plan-step-tag">进行中</span> : null}
            </li>
          ))}
        </ul>
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

/**
 * [INPUT]: ProcessItem;CurtainFold;StatusOrb;orbStateFromSteps;partitionProcessSteps
 * [OUTPUT]: ProcessRow —— 可折叠过程块(Turn-scoped ToolGroup 唯一卡)
 * [POS]: 对话流过程叙事行;长轨迹只露最近 6 步;运行中 shimmer + 计时。
 *        running 是模型执行态;open 只由用户点击改变(首次挂载按 running 初始化)。
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useLayoutEffect, useRef, useState } from 'react'
import { APP_STATUS_COPY } from '../copy/appCopy'
import { useElapsedLabel } from '../process/elapsedLabel'
import { orbStateFromSteps } from '../process/orbState'
import { PROCESS_RECENT_KEEP, partitionProcessSteps, stepChip } from '../process/processSteps'
import type { ProcessItem } from '../useAgent'
import { scrollDebugLog } from '../scroll/scrollDebug'
import { CurtainFold } from './CurtainFold'
import { StatusOrb } from './StatusOrb'

export function ProcessRow({ block }: { block: ProcessItem }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(block.running)
  const [showAll, setShowAll] = useState(false)
  const focus = block.steps.slice().reverse().find((s) => !s.done)
    ?? block.steps[block.steps.length - 1]
  const head = block.running
    ? (focus?.label ?? '研究中…')
    : APP_STATUS_COPY.processTools(block.steps.length)
  const orbState = orbStateFromSteps(block.steps)
  const elapsed = useElapsedLabel(block.startedAt)
  const { hidden, visible } = partitionProcessSteps(block.steps, showAll)

  useLayoutEffect(() => {
    const el = rootRef.current
    const parent = el?.parentElement
    const index = el && parent ? Array.from(parent.children).indexOf(el) : -1
    const r = el?.getBoundingClientRect()
    scrollDebugLog('process-layout', {
      trigger: 'layout-effect',
      processId: block.id,
      processRunning: block.running,
      processOpen: open,
      processDomIndex: index,
      processStepCount: block.steps.length,
      rectTop: r?.top,
      rectHeight: r?.height,
    })
  }, [block.id, block.running, block.steps.length, open])

  return (
    <div ref={rootRef} className={`proc ${block.running ? 'proc-running' : 'proc-done'}`}>
      <button
        type="button"
        className="proc-head"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => {
            const next = !v
            scrollDebugLog('process-toggle', {
              trigger: 'user-gesture',
              processId: block.id,
              processRunning: block.running,
              processOpen: next,
              processStepCount: block.steps.length,
              note: 'user-toggle',
            })
            return next
          })
        }}
      >
        <StatusOrb
          className="proc-orb"
          state={orbState}
          paused={!block.running}
          aria-label={head}
        />
        <span className={`proc-label${block.running ? ' is-shimmer' : ''}`}>{head}</span>
        {elapsed ? <span className="proc-elapsed">{elapsed}</span> : null}
        <span className="proc-toggle">{open ? '收起' : `${block.steps.length} ›`}</span>
      </button>
      <CurtainFold open={open} stagger>
        <ul className="proc-steps">
          {hidden > 0 ? (
            <li className="proc-step proc-step-more">
              <button
                type="button"
                className="proc-more"
                onClick={() => setShowAll(true)}
              >
                {APP_STATUS_COPY.processMore(hidden)}
              </button>
            </li>
          ) : null}
          {visible.map((s) => {
            const chip = stepChip(s)
            return (
              <li key={s.id} className={`proc-step${s.done ? ' is-done' : ''}`}>
                <span className={`proc-step-dot ${s.done ? 'is-done' : ''}`} />
                <span className="proc-step-label">{s.label}</span>
                {chip ? <span className="proc-step-chip">{chip}</span> : null}
              </li>
            )
          })}
          {showAll && block.steps.length > PROCESS_RECENT_KEEP ? (
            <li className="proc-step proc-step-more">
              <button
                type="button"
                className="proc-more"
                onClick={() => setShowAll(false)}
              >
                {APP_STATUS_COPY.processRecent}
              </button>
            </li>
          ) : null}
        </ul>
      </CurtainFold>
    </div>
  )
}

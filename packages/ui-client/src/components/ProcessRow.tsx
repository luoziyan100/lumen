/**
 * [INPUT]: ProcessItem;CurtainFold;StatusOrb;orbStateFromSteps
 * [OUTPUT]: ProcessRow —— 可折叠过程块(Turn-scoped ToolGroup 唯一卡)
 * [POS]: 对话流过程叙事行;与 ThinkingIndicator(尚无工具/轮间思考)分离;进度清单见 TodoCard / 右轨 Progress
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useEffect, useState } from 'react'
import { orbStateFromSteps } from '../orbState'
import type { ProcessItem } from '../useAgent'
import { CurtainFold } from './CurtainFold'
import { StatusOrb } from './StatusOrb'

export function ProcessRow({ block }: { block: ProcessItem }) {
  // 运行中默认展开当前步；收口后默认收起，只露「研究过程 · N 步」
  const [open, setOpen] = useState(block.running)
  useEffect(() => {
    if (block.running) setOpen(true)
    else setOpen(false)
  }, [block.running])
  const focus = block.steps.slice().reverse().find((s) => !s.done)
    ?? block.steps[block.steps.length - 1]
  // H1：运行中露焦点步；收口统一摘要（避免多卡标题错觉）
  const head = block.running
    ? (focus?.label ?? '研究中…')
    : `研究过程 · ${block.steps.length} 步`
  const orbState = orbStateFromSteps(block.steps)
  return (
    <div className={`proc ${block.running ? 'proc-running' : 'proc-done'}`}>
      <button
        type="button"
        className="proc-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <StatusOrb
          className="proc-orb"
          state={orbState}
          paused={!block.running}
          aria-label={head}
        />
        <span className="proc-label">{head}</span>
        <span className="proc-toggle">{open ? '收起' : `${block.steps.length} 步 ›`}</span>
      </button>
      <CurtainFold open={open} stagger>
        <ul className="proc-steps">
          {block.steps.map((s) => (
            <li key={s.id} className="proc-step">
              <span className={`proc-step-dot ${s.done ? 'is-done' : ''}`} />
              <span>{s.label}</span>
            </li>
          ))}
        </ul>
      </CurtainFold>
    </div>
  )
}

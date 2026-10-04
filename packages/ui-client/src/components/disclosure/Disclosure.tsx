/**
 * [INPUT]: 标题、正文、局部布局与原 ChevronIcon/CurtainFold
 * [OUTPUT]: Disclosure：新增详情功能共用的键盘可操作卷帘入口
 * [POS]: 仅管理开合；正文持续挂载以保留表单草稿，不代管业务请求或提交
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useId, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronIcon } from '../icons'
import { CurtainFold } from './CurtainFold'
import './disclosure.css'

export function Disclosure({ summary, children, className = '', style, defaultOpen = false }: {
  summary: ReactNode; children: ReactNode; className?: string; style?: CSSProperties; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return <section className={`curtain-disclosure ${className}`} style={style}>
    <button type="button" className="curtain-disclosure-trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <ChevronIcon open={open} /><span className="curtain-disclosure-label">{summary}</span>
    </button>
    <CurtainFold open={open} id={id}>{children}</CurtainFold>
  </section>
}

/**
 * [INPUT]: open;可选 stagger;children
 * [OUTPUT]: CurtainFold —— 全站卷帘折叠:grid Accordion + clip 揭帘 + spring/curtain
 * [POS]: Curtain Language 原语;侧栏/过程块/右轨目录/用户长文共用;关合保持挂载以播 exit
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { ReactNode } from 'react'

export function CurtainFold({
  open,
  id,
  className,
  stagger = false,
  children,
}: {
  open: boolean
  id?: string
  className?: string
  /** 子项 cascade(侧栏文件夹/会话、过程步骤等) */
  stagger?: boolean
  children: ReactNode
}) {
  const cls = [
    'curtain-fold',
    open ? 'is-open' : '',
    stagger ? 'curtain-fold--stagger' : '',
    className ?? '',
  ].filter(Boolean).join(' ')

  return (
    <div
      id={id}
      className={cls}
      aria-hidden={!open}
      // React 19:关闭时从焦点环摘掉内部控件
      inert={!open ? true : undefined}
    >
      <div className="curtain-fold-pane">
        <div className="curtain-fold-veil">{children}</div>
      </div>
    </div>
  )
}

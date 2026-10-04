/**
 * [INPUT]: open、可选错峰与子内容；原 styles.css 的卷帘层次和 tokens 动效
 * [OUTPUT]: CurtainFold：高度伸展、裁切揭帘与逐项亮相的共享容器
 * [POS]: 侧栏、思考、工具、目录和详情共用；关闭保留 DOM 播退出动画，以 inert 摘除焦点
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { ReactNode } from 'react'

export function CurtainFold({ open, id, className = '', stagger = false, children }: {
  open: boolean; id?: string; className?: string; stagger?: boolean; children: ReactNode
}) {
  const classes = ['curtain-fold', open && 'is-open', stagger && 'curtain-fold--stagger', className].filter(Boolean).join(' ')
  return <div id={id} className={classes} aria-hidden={!open} inert={!open ? true : undefined}>
    <div className="curtain-fold-pane"><div className="curtain-fold-veil">{children}</div></div>
  </div>
}

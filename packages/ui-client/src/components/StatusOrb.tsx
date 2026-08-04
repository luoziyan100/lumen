/**
 * [INPUT]: thinking-orbs ThinkingOrb
 * [OUTPUT]: StatusOrb —— 行内 20px 点云球(内部按 64 档绘制再缩显,避免 size=20 粒子过稀)
 * [POS]: ThinkingIndicator / ProcessRow 共用;theme 钉 dark 适配玻璃壳
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { ThinkingOrb, type OrbState } from 'thinking-orbs'

/** 库仅调 20|64;20 档 ribbon/ring 点过稀像碎线,故用 64 预设缩到 20 显示 */
const DRAW_SIZE = 64
const SHOW_PX = 20

export function StatusOrb({
  state,
  className,
  'aria-label': ariaLabel,
  'aria-hidden': ariaHidden,
}: {
  state: OrbState
  className?: string
  'aria-label'?: string
  'aria-hidden'?: boolean
}) {
  return (
    <ThinkingOrb
      className={className}
      state={state}
      size={DRAW_SIZE}
      theme="dark"
      style={{ width: SHOW_PX, height: SHOW_PX }}
      aria-label={ariaLabel}
      aria-hidden={ariaHidden}
    />
  )
}

/**
 * [INPUT]: thinking-orbs ThinkingOrb
 * [OUTPUT]: StatusOrb —— 行内 20px 点云球(用库原生 size=20 预设,各态点距已调过)
 * [POS]: ThinkingIndicator / ProcessRow 共用;theme 钉 dark 适配玻璃壳
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { ThinkingOrb, type OrbState } from 'thinking-orbs'

/** 库 20|64 是两套手调设计,不是缩放;行内必须用 20,禁 64→CSS 缩(会糊成同一虚线圈) */
const INLINE_SIZE = 20 as const

export function StatusOrb({
  state,
  paused = false,
  className,
  'aria-label': ariaLabel,
  'aria-hidden': ariaHidden,
}: {
  state: OrbState
  /** 过程块完成后冻结当前帧,形态仍保留工具态差异 */
  paused?: boolean
  className?: string
  'aria-label'?: string
  'aria-hidden'?: boolean
}) {
  return (
    <ThinkingOrb
      className={className}
      state={state}
      size={INLINE_SIZE}
      theme="dark"
      paused={paused}
      speed={paused ? 1 : 1.15}
      style={{ width: INLINE_SIZE, height: INLINE_SIZE }}
      aria-label={ariaLabel}
      aria-hidden={ariaHidden}
    />
  )
}

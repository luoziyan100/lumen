/**
 * [INPUT]: appCopy 思考态文案;styles.css 的 .think-* (CSS Dot Matrix,不引 motion)
 * [OUTPUT]: ThinkingIndicator —— 模型等待态:3×3 对角波点阵 + 文案
 * [POS]: 对话流 status 气泡;与侧栏 sb-dot / ProcessRow 脉冲同族,专责「尚未出过程行」的等待
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { APP_STATUS_COPY } from '../appCopy'

const CELLS = 9

/** 对角波延迟档位:(x+y) ∈ 0..4 → 0..1 */
function diagonalDelay(index: number): number {
  const x = index % 3
  const y = Math.floor(index / 3)
  return (x + y) / 4
}

export function ThinkingIndicator({ label = APP_STATUS_COPY.thinking }: { label?: string }) {
  return (
    <div className="bubble bubble-status think-status" role="status" aria-live="polite" aria-label={label}>
      <span className="think-matrix" aria-hidden>
        {Array.from({ length: CELLS }, (_, i) => (
          <span
            key={i}
            className="think-cell"
            style={{ animationDelay: `${diagonalDelay(i)}s` }}
          />
        ))}
      </span>
      <span className="think-label">{label}</span>
    </div>
  )
}

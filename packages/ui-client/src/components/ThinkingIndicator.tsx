/**
 * [INPUT]: appCopy 思考态文案;generative-loaders InlineLoader aperture
 * [OUTPUT]: ThinkingIndicator —— 模型等待态:aperture 光圈动效 + 文案
 * [POS]: 对话流 status 气泡;尚无过程行且尚无 streaming 正文时的等待;
 *        与 ProcessRow 的 StatusOrb(工具态)分离——仅「思考中」用 aperture;
 *        model_retry 时 label 切到 Retry n/m（Codex 档）
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { InlineLoader } from 'generative-loaders'
import 'generative-loaders/styles.css'
import { APP_STATUS_COPY } from '../appCopy'

/** 行内比旧 orb(20) 更大,略大于库 demo 的 24 */
const APERTURE_SIZE = 32

export function ThinkingIndicator({
  label = APP_STATUS_COPY.thinking,
  retrying = false,
  detail,
}: {
  label?: string
  /** 模型连接重试中：文案强调 + 略加速光圈 */
  retrying?: boolean
  /** 可选短原因（fetch failed / HTTP 429） */
  detail?: string
}) {
  const aria = detail ? `${label} · ${detail}` : label
  return (
    <div
      className={`bubble bubble-status think-status${retrying ? ' is-retrying' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={aria}
    >
      <span className="think-aperture" aria-hidden>
        <InlineLoader
          variant="aperture"
          size={APERTURE_SIZE}
          color={retrying ? 'var(--ember)' : 'var(--ink-soft)'}
          speed={retrying ? 1.35 : 1.05}
        />
      </span>
      <span className="think-label">
        {label}
        {detail ? <span className="think-detail"> · {detail}</span> : null}
      </span>
    </div>
  )
}

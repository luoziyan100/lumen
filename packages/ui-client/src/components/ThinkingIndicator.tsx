/**
 * [INPUT]: appCopy 思考态文案;startedAt;generative-loaders InlineLoader aperture
 * [OUTPUT]: ThinkingIndicator —— 等待态:光圈 + shimmer 文案 + live 计时
 * [POS]: 对话流 status;尚无开放 Thought、尚无过程/流式正文时的等待;
 *        与 ProcessRow 的 StatusOrb(工具态)分离;model_retry 切 Retry n/m
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { InlineLoader } from 'generative-loaders'
import 'generative-loaders/styles.css'
import { APP_STATUS_COPY } from '../copy/appCopy'
import { useElapsedLabel } from '../process/elapsedLabel'

/** 行内比旧 orb(20) 更大,略大于库 demo 的 24 */
const APERTURE_SIZE = 32

export function ThinkingIndicator({
  label = APP_STATUS_COPY.thinking,
  retrying = false,
  detail,
  startedAt,
}: {
  label?: string
  /** 模型连接重试中：文案强调 + 略加速光圈 */
  retrying?: boolean
  /** 可选短原因（fetch failed / HTTP 429） */
  detail?: string
  /** 本轮开始(点发送);有则右侧跟 live 秒数 */
  startedAt?: string | null
}) {
  const elapsed = useElapsedLabel(startedAt ?? undefined)
  const aria = [label, elapsed, detail].filter(Boolean).join(' · ')
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
      <span className={`think-label${retrying ? '' : ' is-shimmer'}`}>
        {label}
        {detail ? <span className="think-detail"> · {detail}</span> : null}
      </span>
      {elapsed ? <span className="thought-elapsed">{elapsed}</span> : null}
    </div>
  )
}

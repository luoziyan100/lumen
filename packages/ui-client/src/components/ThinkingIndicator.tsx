/**
 * [INPUT]: appCopy 思考态文案;StatusOrb;orbState.ORB_THINKING
 * [OUTPUT]: ThinkingIndicator —— 模型等待态:点云球 breathing + 文案
 * [POS]: 对话流 status 气泡;尚无过程行时的等待;与 ProcessRow 运行态 orb 同族
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { APP_STATUS_COPY } from '../appCopy'
import { ORB_THINKING } from '../orbState'
import { StatusOrb } from './StatusOrb'

export function ThinkingIndicator({ label = APP_STATUS_COPY.thinking }: { label?: string }) {
  return (
    <div className="bubble bubble-status think-status" role="status" aria-live="polite" aria-label={label}>
      <StatusOrb className="think-orb" state={ORB_THINKING} aria-hidden />
      <span className="think-label">{label}</span>
    </div>
  )
}

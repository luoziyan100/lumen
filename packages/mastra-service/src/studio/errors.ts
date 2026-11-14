/**
 * [INPUT]: 无
 * [OUTPUT]: StudioError：带 HTTP 状态、可直接给人和模型读的中文错误、稳定 code 与 params（i18n I6），可附给客户端用的字段（detail）
 * [POS]: studio 模块唯一错误类型；存储、HTTP 与白板工具共用，文案说明下一步怎么办
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { ErrorCode, ErrorParams } from '../http/error-codes.ts'

export class StudioError extends Error {
  readonly status: 400 | 404 | 409 | 413
  /** Stable code and the values in the message, so the UI can say it in its own language (i18n I6); the message stays as is. */
  readonly code: ErrorCode
  readonly params: ErrorParams | undefined
  /** Extra fields for the HTTP body next to `error`, for clients that act on them (R17: the block count behind a confirmation). */
  readonly detail: Record<string, unknown> | undefined

  constructor(message: string, status: 400 | 404 | 409 | 413, code: ErrorCode, params?: ErrorParams, detail?: Record<string, unknown>) {
    super(message)
    this.name = 'StudioError'
    this.status = status
    this.code = code
    this.params = params
    this.detail = detail
  }
}

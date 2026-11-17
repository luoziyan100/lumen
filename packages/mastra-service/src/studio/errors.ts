/**
 * [INPUT]: the error codes of http/error-codes
 * [OUTPUT]: StudioError: an HTTP status, a Chinese message people and models both read, a stable code and params (i18n I6), optional client fields (detail);
 *           notReferenced: the one R15 refusal for a material outside the topic's references
 * [POS]: the studio module's only error type; stores, HTTP and the AI tools share it, and every message says what to do next
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
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

/** R15: unreferenced, missing and out-of-bounds items get the same sentence, so a topic learns nothing about other topics. */
export function notReferenced(itemId: string) {
  return new StudioError(`材料 ${itemId} 不在这个主题的引用清单里；用 list_materials 看能读哪些`, 404, 'material.not_referenced', { itemId })
}

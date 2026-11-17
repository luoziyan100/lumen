/**
 * [INPUT]: none
 * [OUTPUT]: ERROR_CODES (every stable error code the service may send), ErrorCode, ErrorParams, errorBody: the `{ error, code, params? }` HTTP body
 * [POS]: the one list of error codes. `error` stays the Chinese text people and models read today; the UI maps `code` (+ `params`) to its own
 *        language and falls back to `error`. The UI test keeps its catalog keys equal to this list, so a new code needs UI text in every locale
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
export const ERROR_CODES = [
  'request.invalid', 'upload.too_large',
  'settings.model_missing', 'settings.busy', 'settings.saving', 'settings.invalid_update', 'settings.invalid_document', 'settings.invalid_legacy',
  'settings.profile_incomplete', 'settings.read_failed', 'settings.save_failed', 'settings.import_path', 'settings.legacy_read_failed',
  'settings.data_root', 'settings.closed', 'settings.already_initialized', 'settings.model_unavailable', 'settings.invalid_model_id', 'settings.profile_not_found',
  'topic.not_found', 'topic.busy', 'topic.archived', 'topic.material_not_referenced', 'session.not_found',
  'library.not_found', 'library.upload_incomplete', 'library.no_file', 'library.empty_file', 'library.too_large', 'library.link_unreachable',
  'library.link_no_text', 'library.arxiv_fetch_failed', 'library.arxiv_not_pdf', 'library.original_missing', 'library.original_outside',
  'library.duplicate', 'library.same_name',
  'material.not_referenced', 'material.pdf_pages', 'material.is_image', 'material.not_text',
  'board.sheet_not_found', 'board.sheet_in_use', 'board.confirm_delete', 'board.block_sheet_deleted', 'board.no_live_sheet', 'board.sheet_closed',
  'board.selected_sheet_closed', 'board.sheet_full', 'board.block_not_current', 'board.block_stale', 'board.block_already_replaced',
  'board.replace_self', 'board.replacement_missing', 'board.title_invalid', 'board.source_material', 'board.source_thread', 'board.block_not_found',
  'board.block_other_sheet', 'board.invalid_content', 'board.invalid_sources',
  'sediment.text_invalid', 'sediment.entry_not_found', 'sediment.offer_not_found', 'sediment.quote_invalid', 'sediment.quote_source',
  'sediment.link_invalid', 'sediment.link_stale', 'sediment.invite_blocks',
  'files.not_local', 'files.not_found',
  'agents.role_not_found', 'agents.invalid_request', 'agents.load_failed',
  'specialists.busy', 'specialists.no_context', 'specialists.not_continued',
  'question.unavailable', 'question.stale',
  'diagnostics.closed', 'diagnostics.invalid_session', 'diagnostics.session_not_found', 'diagnostics.storage_unavailable', 'diagnostics.invalid_trace',
  'diagnostics.trace_not_found', 'diagnostics.invalid_page', 'diagnostics.scope_failed', 'diagnostics.invalid_case', 'diagnostics.span_not_found',
  'diagnostics.case_unsafe', 'diagnostics.invalid_mode', 'diagnostics.evaluating', 'diagnostics.pack_too_large', 'diagnostics.invalid_json',
  'diagnostics.invalid_pack', 'diagnostics.checksum_failed', 'diagnostics.missing_content', 'diagnostics.case_not_found', 'diagnostics.case_edited',
] as const

export type ErrorCode = typeof ERROR_CODES[number]
export type ErrorParams = Record<string, string | number>

/** The JSON body for an error the UI may show. `extra` carries fields clients act on (R17's reason/blocks). */
export function errorBody(message: string, code: ErrorCode, params?: ErrorParams, extra?: Record<string, unknown>) {
  return { ...extra, error: message, code, ...(params ? { params } : {}) }
}

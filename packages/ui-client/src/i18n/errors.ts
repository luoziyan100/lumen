/**
 * [INPUT]: the active catalog's `errors` (keys are the service's stable codes), a service error body { error, code?, params? }
 * [OUTPUT]: serviceErrorText: the body in the UI's language (unknown code → the service's own `error`); errorText: what to show for any thrown value
 * [POS]: the client half of i18n I6. The service keeps `error` in Chinese for people and models; only `code` + `params` decide the UI text
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { t } from './index.ts'

type Entry = string | ((params: Record<string, string | number>) => string)

export function serviceErrorText(body: unknown, fallback: string): string {
  const value = body && typeof body === 'object' ? body as { error?: unknown; code?: unknown; params?: unknown } : {}
  const own = typeof value.error === 'string' && value.error ? value.error : fallback
  const entry = typeof value.code === 'string' ? (t().errors as Record<string, Entry | undefined>)[value.code] : undefined
  if (typeof entry === 'string') return entry
  if (typeof entry !== 'function') return own
  const params = value.params && typeof value.params === 'object' ? value.params as Record<string, string | number> : {}
  return entry(params)
}

/** A thrown value as text: the message of an Error (service errors were already localized when they were read), anything else as a string. */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

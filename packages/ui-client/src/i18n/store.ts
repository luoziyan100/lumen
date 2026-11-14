/**
 * [INPUT]: localStorage lumen:locale.v1
 * [OUTPUT]: LOCALE_STORAGE_KEY / normalizeLocale / loadLocale / saveLocale
 * [POS]: the language choice is a local preference like appearance (versioned key, unknown values back to English); first launch is English whatever the system language is
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { DEFAULT_LOCALE, LOCALES, type LocaleId } from './locales/index.ts'

export const LOCALE_STORAGE_KEY = 'lumen:locale.v1'

export function normalizeLocale(raw: unknown): LocaleId {
  const id = raw && typeof raw === 'object' ? (raw as { locale?: unknown }).locale : raw
  return LOCALES.find(entry => entry.id === id)?.id ?? DEFAULT_LOCALE
}

export function loadLocale(): LocaleId {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_LOCALE
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY)
    return raw ? normalizeLocale(JSON.parse(raw)) : DEFAULT_LOCALE
  } catch {
    return DEFAULT_LOCALE
  }
}

export function saveLocale(id: LocaleId): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify({ version: 1, locale: normalizeLocale(id) }))
  } catch {
    /* ignore quota */
  }
}

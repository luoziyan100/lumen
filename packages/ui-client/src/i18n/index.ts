/**
 * [INPUT]: locales registry and catalogs, store (persisted choice), format (Intl), Tauri invoke (optional)
 * [OUTPUT]: t() (non-React accessor), useT() / useLocale() (React), setLocale / bootstrapLocale, localeTag, number/date helpers bound to the active
 *           locale, service error text (errors.ts), and the Messages / LocaleId types
 * [POS]: the single i18n entry: switching re-renders every component that reads messages through useT (no reload), sets <html lang> and tells the
 *        native shell (dialog titles, window titles) through one command
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { useSyncExternalStore } from 'react'
import { en, type Messages } from './locales/en.ts'
import { DEFAULT_LOCALE, LOCALES, localeEntry, type LocaleId } from './locales/index.ts'
import { formatDateTime as dateTimeFor, formatNumber as numberFor, formatRelative as relativeFor, plural as pluralFor, type PluralForms } from './format.ts'
import { loadLocale, normalizeLocale, saveLocale } from './store.ts'

export type { Messages } from './locales/en.ts'
export { LOCALES, DEFAULT_LOCALE, type LocaleId } from './locales/index.ts'
export { LOCALE_STORAGE_KEY, normalizeLocale, loadLocale } from './store.ts'
export { serviceErrorText, errorText } from './errors.ts'

let active: { id: LocaleId; messages: Messages } = { id: DEFAULT_LOCALE, messages: en }
const listeners = new Set<() => void>()
let request = 0

/** The active catalog, for code outside components (read it at call time, not at module load). */
export function t(): Messages { return active.messages }
export function locale(): LocaleId { return active.id }
export function localeTag(): string { return localeEntry(active.id).tag }

function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
/** Components that show text read it through this hook, so a language switch re-renders them in place. */
export function useT(): Messages { return useSyncExternalStore(subscribe, t, t) }
export function useLocale(): LocaleId { return useSyncExternalStore(subscribe, locale, locale) }

async function tellShell(id: LocaleId) {
  try {
    const { invoke, isTauri } = await import('@tauri-apps/api/core')
    if (isTauri()) await invoke('set_locale', { locale: id })
  } catch { /* browser dev or an older shell: native titles stay in their fallback */ }
}

/** Switch language now: load the catalog, swap it in, persist, update <html lang>, tell the shell. Only the latest call wins. */
export async function setLocale(id: unknown, persist = true): Promise<LocaleId> {
  const next = normalizeLocale(id), mine = ++request
  const messages = await localeEntry(next).load()
  if (mine !== request) return active.id
  active = { id: next, messages }
  if (persist) saveLocale(next)
  if (typeof document !== 'undefined') document.documentElement.lang = localeEntry(next).tag
  void tellShell(next)
  for (const listener of listeners) listener()
  return next
}

/** Before the first render: the stored choice, or English on first launch. */
export function bootstrapLocale(): Promise<LocaleId> { return setLocale(loadLocale(), false) }

export const plural = (count: number, forms: PluralForms) => pluralFor(localeTag(), count, forms)
export const formatNumber = (value: number, options?: Intl.NumberFormatOptions) => numberFor(localeTag(), value, options)
export const formatDateTime = (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => dateTimeFor(localeTag(), value, options)
export const formatRelative = (value: number, unit: Intl.RelativeTimeFormatUnit) => relativeFor(localeTag(), value, unit)
export const localeNames = () => LOCALES.map(entry => ({ id: entry.id as LocaleId, nativeName: entry.nativeName }))

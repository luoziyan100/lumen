/**
 * [INPUT]: the locale catalogs in this folder (loaded on demand)
 * [OUTPUT]: LOCALES (id, BCP 47 tag, native name, loader), LocaleId, DEFAULT_LOCALE, localeEntry
 * [POS]: the only list of languages; adding a language is one catalog file plus one entry here
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import type { Messages } from './en.ts'

export interface LocaleEntry { id: string; tag: string; nativeName: string; load: () => Promise<Messages> }

export const LOCALES = [
  { id: 'en', tag: 'en', nativeName: 'English', load: async () => (await import('./en.ts')).en },
  { id: 'zh', tag: 'zh-CN', nativeName: '中文', load: async () => (await import('./zh.ts')).zh },
] as const satisfies readonly LocaleEntry[]

export type LocaleId = typeof LOCALES[number]['id']
export const DEFAULT_LOCALE: LocaleId = 'en'

export function localeEntry(id: LocaleId): LocaleEntry {
  return LOCALES.find(entry => entry.id === id) ?? LOCALES[0]
}

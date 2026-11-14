/**
 * [INPUT]: Intl (PluralRules, NumberFormat, DateTimeFormat, RelativeTimeFormat)
 * [OUTPUT]: plural / formatNumber / formatDateTime / formatRelative, each for an explicit BCP 47 tag
 * [POS]: the only place counts, numbers and dates become text; catalogs call these with their own tag, components through i18n/index
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */

/** `#` in the chosen form becomes the formatted count; `other` is required, the rest follow the language's plural categories. */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }

export function plural(tag: string, count: number, forms: PluralForms): string {
  const form = forms[new Intl.PluralRules(tag).select(count)] ?? forms.other
  return form.replaceAll('#', formatNumber(tag, count))
}

export function formatNumber(tag: string, value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(tag, options).format(value)
}

export function formatDateTime(tag: string, value: Date | string | number, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }): string {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(tag, options).format(date)
}

export function formatRelative(tag: string, value: number, unit: Intl.RelativeTimeFormatUnit): string {
  return new Intl.RelativeTimeFormat(tag, { numeric: 'auto' }).format(value, unit)
}

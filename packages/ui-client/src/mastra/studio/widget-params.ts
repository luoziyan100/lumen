/**
 * [INPUT]: the WidgetParam union a reading widget declares (data/client re-exports the service type), localStorage, MODEL_TEXT.widgetAsk / WIDGET_ASK_TITLE (i18n/locales/model.ts)
 * [OUTPUT]: ParamValues, defaultValues, fitValues (stored values filtered by the current declaration), paramsStoreKey / loadValues / saveValues,
 *           paramsLine (the 「当前参数：…」 line a widget question carries), widgetQuote / widgetTitleOf (the two program lines of a widget question and back)
 * [POS]: the value rules behind the host-drawn widget controls (P2). Values never reach the service: they live in this device's localStorage under
 *        topic, material, section and the widget's title (its position among the section's widgets when it has none), and every read passes the current declaration — an unknown name is dropped,
 *        a number outside the range is clamped, a wrong type or a vanished choice falls back to the default. A rewrite that keeps the names keeps the person's values;
 *        a rewrite that changes the title starts from the defaults, and two widgets with one title in one section share one set of values.
 *        Storage that is full or blocked loses only persistence; the controls keep working for the session. The same filter guards every push into the iframe, so the page only ever sees values its declaration allows. The question's fixed words live in MODEL_TEXT.widgetAsk
 *        like every model-facing string; the service's reading-question.ts reads it back as a quote, never as the person's words
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { MODEL_TEXT, WIDGET_ASK_TITLE } from '../../i18n/locales/model.ts'
import type { WidgetParam } from '../data/client.ts'

export type ParamValue = number | boolean | string
export type ParamValues = Record<string, ParamValue>

const STORE = 'lumen:widgetParams.v1'

export function defaultValues(params: readonly WidgetParam[]): ParamValues {
  return Object.fromEntries(params.map(param => [param.name, param.default]))
}

/** Values allowed by the declaration: every declared name present, nothing undeclared, each in range and of its type. */
export function fitValues(params: readonly WidgetParam[], stored: unknown): ParamValues {
  const given = stored !== null && typeof stored === 'object' ? stored as Record<string, unknown> : {}
  return Object.fromEntries(params.map(param => {
    const value = given[param.name]
    if (param.type === 'range') return [param.name, typeof value === 'number' && Number.isFinite(value) ? Math.min(param.max, Math.max(param.min, value)) : param.default]
    if (param.type === 'toggle') return [param.name, typeof value === 'boolean' ? value : param.default]
    return [param.name, typeof value === 'string' && param.options.some(option => option.value === value) ? value : param.default]
  }))
}

/** A titled widget is keyed by its title, so a widget inserted before it moves nothing; an untitled one falls back to its position among the section's widgets. */
export function paramsStoreKey(topicId: string, itemId: string, sectionId: string, title: string | undefined, ordinal: number) {
  return `${STORE}:${topicId}:${itemId}:${sectionId}:${title || ordinal}`
}

export function loadValues(key: string, params: readonly WidgetParam[]): ParamValues {
  let stored: unknown = null
  try { stored = JSON.parse(localStorage.getItem(key) ?? 'null') } catch { stored = null }
  return fitValues(params, stored)
}

export function saveValues(key: string, values: ParamValues) {
  try { localStorage.setItem(key, JSON.stringify(values)) } catch { return }
}

function shown(param: WidgetParam, value: ParamValue) {
  if (param.type === 'toggle') return value ? MODEL_TEXT.widgetAsk.on : MODEL_TEXT.widgetAsk.off
  if (param.type === 'choice') return param.options.find(option => option.value === value)?.label ?? String(value)
  return `${value}${param.unit ?? ''}`
}

export function paramsLine(params: readonly WidgetParam[], values: ParamValues) {
  const fitted = fitValues(params, values)
  return MODEL_TEXT.widgetAsk.params(params.map(param => `${param.label}=${shown(param, fitted[param.name]!)}`))
}

/** The quote of a question asked from a widget: its title, then its current values when it declares any. */
export function widgetQuote(title: string, params: readonly WidgetParam[] | undefined, values: ParamValues) {
  const head = MODEL_TEXT.widgetAsk.title(title)
  return params?.length ? `${head}\n${paramsLine(params, values)}` : head
}

/** The widget title of a question asked from a widget (its quote read back, lines joined by a space); null for a question about a sentence. */
export function widgetTitleOf(quote: string): string | null {
  return WIDGET_ASK_TITLE.exec(quote)?.[1] ?? null
}

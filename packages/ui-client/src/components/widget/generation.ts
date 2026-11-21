/**
 * [INPUT]: none
 * [OUTPUT]: widgetGeneration: a short content digest of a widget's final html (FNV-1a 32-bit plus length)
 * [POS]: the identity of one generation of a widget's code. A host whose final html can change in place (a reading block patched under the same id) keys WidgetFrame
 *        and its runtime failure by it: a new generation gets a fresh iframe, because a receiver that already ran its scripts would run them twice (top-level const
 *        redeclared, old listeners and timers leaking); values and title changes keep the generation, so the same iframe gets WIDGET_PARAMS
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
export function widgetGeneration(code: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < code.length; i++) hash = Math.imul(hash ^ code.charCodeAt(i), 0x01000193)
  return `${(hash >>> 0).toString(36)}.${code.length.toString(36)}`
}

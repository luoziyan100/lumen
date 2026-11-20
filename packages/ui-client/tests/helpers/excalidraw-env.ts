/**
 * [INPUT]: a JSDOM window the suite already installed on globalThis; Node module hooks
 * [OUTPUT]: loadExcalidraw(): the real @excalidraw/excalidraw module under jsdom, with fixed-width text metrics (10px a character) instead of a canvas
 * [POS]: lets canvas-sync tests run the real reconcile/convert/restore. Two gaps of the test host are closed, nothing in the library is replaced:
 *        its dependencies (roughjs, points-on-curve) import subpaths without the .js extension (a bundler resolves them, Node does not; the retry applies only
 *        inside node_modules), and jsdom has no 2D canvas to measure text
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { register } from 'node:module'

let loaded: Promise<typeof import('@excalidraw/excalidraw')> | null = null

export function loadExcalidraw() {
  loaded ??= (async () => {
    register('data:text/javascript,' + encodeURIComponent(`export async function resolve(specifier, context, next) {
      try { return await next(specifier, context) }
      catch (error) { if (error?.code === 'ERR_MODULE_NOT_FOUND' && context.parentURL?.includes('/node_modules/') && !specifier.endsWith('.js')) return next(specifier + '.js', context); throw error }
    }`), import.meta.url)
    const library = await import('@excalidraw/excalidraw')
    library.setCustomTextMetricsProvider({ getLineWidth: (text: string) => text.length * 10 } as never)
    return library
  })()
  return loaded
}

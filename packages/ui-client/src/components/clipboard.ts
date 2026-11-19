/**
 * [INPUT]: navigator.clipboard, document.execCommand as the fallback, the transcript catalog's copy failure text
 * [OUTPUT]: copyText: put a string on the clipboard, or throw a readable error
 * [POS]: the one clipboard write of the client; message copy and the 「⋯」 menu's Copy ID share it
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { t } from '../i18n/index.ts'

export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return } catch { /* WebKit without clipboard permission: fall back to a copy inside the user's click */ }
  const focus = document.activeElement as HTMLElement | null, input = document.createElement('textarea')
  input.value = text; input.style.position = 'fixed'; input.style.opacity = '0'; document.body.append(input); input.select()
  try { if (!document.execCommand('copy')) throw new Error(t().transcript.copyFailed) }
  finally { input.remove(); focus?.focus({ preventScroll: true }) }
}

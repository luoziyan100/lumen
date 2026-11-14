/**
 * [INPUT]: src/i18n (setLocale) and the zh catalog
 * [OUTPUT]: switches the UI to Chinese as a side effect of being imported; re-exports zh for assertions
 * [POS]: the tests written against the original Chinese UI import this first, so they keep asserting the same words; the i18n tests cover
 *        English, switching and persistence on their own
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { setLocale } from '../../src/i18n/index.ts'

await setLocale('zh', false)

export { zh } from '../../src/i18n/locales/zh.ts'
export { MODEL_TEXT } from '../../src/i18n/locales/model.ts'

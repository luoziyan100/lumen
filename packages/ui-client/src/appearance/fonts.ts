/**
 * [INPUT]: fonts.css 中声明的本地西文字体族名；yan-design-system 默认 --font-serif
 * [OUTPUT]: LATIN_FONTS / CJK_FONTS / coerceLatinFont / coerceCjkFont / readingFontFamily
 * [POS]: 阅读字体注册表真源；西文与中文分别选择，组合成 --font-serif，默认组合不写覆盖
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export interface ReadingFontOption { id: string; name: string; family: string }

/** 西文：首项为设计系统默认(Google Fonts 在线加载)，其余为本地打包的 OFL 可变字体 */
export const LATIN_FONTS: readonly ReadingFontOption[] = [
  { id: 'source-serif', name: 'Source Serif', family: "'Source Serif 4'" },
  { id: 'eb-garamond', name: 'EB Garamond', family: "'Lumen EB Garamond'" },
  { id: 'crimson-pro', name: 'Crimson Pro', family: "'Lumen Crimson Pro'" },
  { id: 'newsreader', name: 'Newsreader', family: "'Lumen Newsreader'" },
  { id: 'literata', name: 'Literata', family: "'Lumen Literata'" },
  { id: 'lora', name: 'Lora', family: "'Lumen Lora'" },
  { id: 'inter', name: 'Inter', family: "'Lumen Inter'" },
]

/** 中文：文楷为设计系统默认；宋体、苹方为 macOS 系统字体，无需下载 */
export const CJK_FONTS: readonly ReadingFontOption[] = [
  { id: 'wenkai', name: 'LXGW WenKai', family: "'LXGW WenKai', 'Kaiti SC', STKaiti, Kaiti" },
  { id: 'song', name: 'Songti', family: "'Songti SC', STSong, 'Noto Serif SC'" },
  { id: 'hei', name: 'PingFang', family: "'PingFang SC', 'Noto Sans SC'" },
]

export const DEFAULT_LATIN_FONT = LATIN_FONTS[0]!.id
export const DEFAULT_CJK_FONT = CJK_FONTS[0]!.id

export function coerceLatinFont(id: unknown): string {
  return LATIN_FONTS.some(font => font.id === id) ? id as string : DEFAULT_LATIN_FONT
}

export function coerceCjkFont(id: unknown): string {
  return CJK_FONTS.some(font => font.id === id) ? id as string : DEFAULT_CJK_FONT
}

/** 组合后的正文字族；默认组合返回 undefined，沿用设计系统的 --font-serif 原值 */
export function readingFontFamily(latinId: string, cjkId: string): string | undefined {
  if (latinId === DEFAULT_LATIN_FONT && cjkId === DEFAULT_CJK_FONT) return undefined
  const latin = LATIN_FONTS.find(font => font.id === latinId) ?? LATIN_FONTS[0]!
  const cjk = CJK_FONTS.find(font => font.id === cjkId) ?? CJK_FONTS[0]!
  return `${latin.family}, ${cjk.family}, serif`
}

/**
 * [INPUT]: 宿主 documentElement 的 computed style / color-scheme
 * [OUTPUT]: hostChromeIsDark;collectThemeVars —— widget 指南 CSS 变量
 * [POS]: widget/ 主题桥;与 receiver 沙箱壳分离,便于 Node 单测
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

/** 解析 css 颜色通道 0–255;失败返回 null */
function rgbChannels(raw: string): [number, number, number] | null {
  const s = raw.trim()
  if (!s) return null
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s)
  if (hex) {
    const h = hex[1]!
    if (h.length === 3) {
      return [parseInt(h[0]! + h[0]!, 16), parseInt(h[1]! + h[1]!, 16), parseInt(h[2]! + h[2]!, 16)]
    }
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(s)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])]
  return null
}

function relativeLuminance(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const x = c / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** 宿主壳是否暗底。优先 color-scheme;WKWebView 偶发空串时回退看 --canvas 亮度。 */
export function hostChromeIsDark(el: HTMLElement | null): boolean {
  if (!el) return false
  const cs = getComputedStyle(el)
  if (cs.colorScheme.split(/\s+/).includes('dark')) return true
  if (cs.colorScheme.split(/\s+/).includes('light')) return false
  const canvas = rgbChannels(cs.getPropertyValue('--canvas').trim())
  if (canvas) return relativeLuminance(...canvas) < 0.45
  return false
}

/** 浅色文档岛:深字 + 浅底。show-widget/HTML 预览一律走这套,不跟玻璃壳浅墨。 */
export const LIGHT_DOC_VARS: Record<string, string> = {
  '--color-background-primary': '#fffeff',
  '--color-background-secondary': '#ffffff',
  '--color-background-tertiary': '#f4f2ec',
  '--color-text-primary': '#211f1c',
  '--color-text-secondary': 'rgba(33,31,28,0.82)',
  '--color-text-tertiary': 'rgba(33,31,28,0.56)',
  '--color-border-tertiary': 'rgba(66,56,42,0.17)',
  '--color-border-secondary': 'rgba(66,56,42,0.17)',
  '--color-border-primary': 'rgba(33,31,28,0.34)',
}

/**
 * widget 主题变量。
 * 暗壳(玻璃)或未知壳:永远浅档文档色——agent 常硬编码白底/彩钮,灌玻璃浅墨会「只剩字」。
 * 浅壳暖纸:仍可镜像宿主 token。
 */
export function collectThemeVars(el: HTMLElement | null): Record<string, string> {
  const fonts = (() => {
    if (!el) {
      return {
        '--border-radius-md': '8px',
        '--border-radius-lg': '12px',
        '--font-sans': 'system-ui,sans-serif',
        '--font-mono': 'ui-monospace,monospace',
      }
    }
    const cs = getComputedStyle(el)
    const pick = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback
    return {
      '--border-radius-md': '8px',
      '--border-radius-lg': '12px',
      '--font-sans': pick('--font-sans', 'system-ui,sans-serif'),
      '--font-mono': pick('--font-mono', 'ui-monospace,monospace'),
    }
  })()

  // 内容岛与壳层解耦:只要宿主是暗底,就不镜像 --ink/--paper
  if (!el || hostChromeIsDark(el)) {
    return { ...LIGHT_DOC_VARS, ...fonts }
  }

  const cs = getComputedStyle(el)
  const pick = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback
  return {
    '--color-background-primary': pick('--paper-solid', '#fffeff'),
    '--color-background-secondary': pick('--card', '#ffffff'),
    '--color-background-tertiary': pick('--paper-deep', '#f4f2ec'),
    '--color-text-primary': pick('--ink', '#211f1c'),
    '--color-text-secondary': pick('--ink-soft', 'rgba(33,31,28,0.82)'),
    '--color-text-tertiary': pick('--ink-mute', 'rgba(33,31,28,0.56)'),
    '--color-border-tertiary': pick('--sand-deep', 'rgba(66,56,42,0.17)'),
    '--color-border-secondary': pick('--sand-deep', 'rgba(66,56,42,0.17)'),
    '--color-border-primary': pick('--ink-faint', 'rgba(33,31,28,0.34)'),
    ...fonts,
  }
}

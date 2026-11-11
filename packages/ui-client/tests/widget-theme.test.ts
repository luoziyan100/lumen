/**
 * [INPUT]: widget 主题桥与宿主明暗、透明壳面及实色伴生 token
 * [OUTPUT]: 暗壳固定浅色文档岛、浅玻璃实色岛与深墨、receiver 滚动合同回归
 * [POS]: widget 与宿主材质的边界验证；内容岛可读性独立于玻璃透明度
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { collectThemeVars, hostChromeIsDark, LIGHT_DOC_VARS } from '../src/components/widget/themeVars.ts'

function withComputedStyle(impl: (el: Element) => Partial<CSSStyleDeclaration>, run: () => void) {
  const prev = globalThis.getComputedStyle
  globalThis.getComputedStyle = ((el: Element) => impl(el)) as typeof getComputedStyle
  try { run() } finally { globalThis.getComputedStyle = prev }
}

describe('widget theme under light/dark chrome', () => {
  it('hostChromeIsDark 读 color-scheme', () => {
    withComputedStyle((el) => {
      const scheme = (el as HTMLElement & { __scheme?: string }).__scheme ?? 'light'
      return { colorScheme: scheme, getPropertyValue: () => '' } as unknown as CSSStyleDeclaration
    }, () => {
      const dark = { __scheme: 'dark' } as unknown as HTMLElement
      const light = { __scheme: 'light' } as unknown as HTMLElement
      assert.equal(hostChromeIsDark(dark), true)
      assert.equal(hostChromeIsDark(light), false)
    })
  })

  it('color-scheme 空串时按 --canvas 亮度回退', () => {
    withComputedStyle(() => ({
      colorScheme: '',
      getPropertyValue: (name: string) => (name === '--canvas' ? '#0B0C10' : ''),
    } as unknown as CSSStyleDeclaration), () => {
      assert.equal(hostChromeIsDark({} as HTMLElement), true)
    })
    withComputedStyle(() => ({
      colorScheme: '',
      getPropertyValue: (name: string) => (name === '--canvas' ? '#fffeff' : ''),
    } as unknown as CSSStyleDeclaration), () => {
      assert.equal(hostChromeIsDark({} as HTMLElement), false)
    })
  })

  it('暗壳注入深字而非浅墨', () => {
    withComputedStyle(() => ({
      colorScheme: 'dark',
      getPropertyValue: (name: string) => {
        if (name === '--ink') return '#E8EAEE'
        if (name === '--font-sans') return 'TestSans'
        return ''
      },
    } as unknown as CSSStyleDeclaration), () => {
      const vars = collectThemeVars({} as HTMLElement)
      assert.equal(vars['--color-text-primary'], LIGHT_DOC_VARS['--color-text-primary'])
      assert.notEqual(vars['--color-text-primary'], '#E8EAEE')
      assert.equal(vars['--color-background-primary'], '#fffeff')
    })
  })

  it('浅玻璃内容岛从实色伴生取底，沿用宿主深墨', () => {
    const tokens: Record<string, string> = {
      '--paper-solid': 'rgba(255, 255, 255, 0.90)', '--card': 'rgba(255, 255, 255, 0.50)', '--paper-deep': 'rgba(224, 232, 242, 0.52)',
      '--surface-elevated': '#FFFFFF', '--surface-base': '#F5F8FC', '--surface-recessed': '#E0E8F1',
      '--ink': '#18212D', '--ink-soft': '#334155', '--ink-mute': '#536272',
    }
    withComputedStyle(() => ({ colorScheme: 'light', getPropertyValue: (name: string) => tokens[name] ?? '' } as unknown as CSSStyleDeclaration), () => {
      assert.equal(hostChromeIsDark({} as HTMLElement), false)
      const vars = collectThemeVars({} as HTMLElement)
      assert.equal(vars['--color-background-primary'], '#FFFFFF')
      assert.equal(vars['--color-background-secondary'], '#F5F8FC')
      assert.equal(vars['--color-background-tertiary'], '#E0E8F1')
      assert.equal(vars['--color-text-primary'], '#18212D')
      assert.equal(vars['--color-text-secondary'], '#334155')
      assert.equal(vars['--color-text-tertiary'], '#536272')
    })
  })
})

describe('receiver fillHeight 滚动契约', () => {
  it('默认 overflow:hidden;脚本含 fillHeight → setFillScroll', () => {
    // 读源模板(避免 node 直引 receiver→sanitize 无扩展名)
    const src = readFileSync(
      new URL('../src/components/widget/receiver.ts', import.meta.url),
      'utf8',
    )
    assert.match(src, /html,body\{[^}]*overflow:hidden/)
    assert.match(src, /fillHeight/)
    assert.match(src, /setFillScroll/)
    assert.match(src, /overflow=.*auto/)
  })
})

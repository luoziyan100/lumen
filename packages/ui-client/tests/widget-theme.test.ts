/**
 * [INPUT]: collectThemeVars / hostChromeIsDark
 * [OUTPUT]: 暗壳 → 浅档文档字色不变式
 * [POS]: ui-client 测试;锁玻璃壳下 widget 对比度
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
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

describe('widget theme under dark chrome', () => {
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

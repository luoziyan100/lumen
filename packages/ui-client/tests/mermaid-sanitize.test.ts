/**
 * [INPUT]: mermaidSanitize (v0–v2)
 * [OUTPUT]: 对比度门禁 / 语义 class / 事故复现 style fill 浅底
 * [POS]: 流程图颜色宿主裁决单测
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  GLASS_PALETTE,
  contrastRatio,
  enforceNodeStyle,
  parseStyleProps,
  sanitizeMermaidSource,
  semanticStyle,
} from '../src/mermaid/mermaidSanitize.ts'

describe('contrastRatio / enforceNodeStyle', () => {
  it('浅底+浅字对比度不足', () => {
    const r = contrastRatio('#f5f5f5', '#E8EAEE')
    assert.ok(r != null && r < 4.5, `got ${r}`)
  })

  it('事故复现 fill:#f5f5f5 无 color → remap 深字且对比度达标', () => {
    const { style, action } = enforceNodeStyle({ fill: '#f5f5f5' })
    assert.equal(style.fill, '#f5f5f5')
    assert.equal(style.color, GLASS_PALETTE.inkOnLight)
    const r = contrastRatio(style.fill!, style.color!)
    assert.ok(r != null && r >= 4.5, `contrast ${r}`)
    assert.ok(action === 'ok' || action === 'fail-remap-text', action)
  })

  it('浅底+显式浅字 → remap-text', () => {
    const { style, action } = enforceNodeStyle({ fill: '#eef2ff', color: '#E8EAEE' })
    assert.equal(style.fill, '#eef2ff')
    assert.equal(style.color, GLASS_PALETTE.inkOnLight)
    assert.equal(action, 'fail-remap-text')
    assert.ok((contrastRatio(style.fill!, style.color!) ?? 0) >= 4.5)
  })

  it('合规暗色对 → ok 保留', () => {
    const { style, action } = enforceNodeStyle({
      fill: GLASS_PALETTE.surface,
      color: GLASS_PALETTE.ink,
    })
    assert.equal(action, 'ok')
    assert.equal(style.fill, GLASS_PALETTE.surface)
    assert.equal(style.color, GLASS_PALETTE.ink)
  })

  it('allowLiteralColors:false → 剥到中性', () => {
    const { style, action } = enforceNodeStyle(
      { fill: '#ff00ff', color: '#00ff00' },
      { allowLiteralColors: false, minContrast: 4.5, onFail: 'remap-text' },
    )
    assert.equal(action, 'strip-literal-disabled')
    assert.equal(style.fill, GLASS_PALETTE.surface)
    assert.equal(style.color, GLASS_PALETTE.ink)
  })

  it('onFail strip-to-neutral', () => {
    const { style, action } = enforceNodeStyle(
      { fill: '#ffffff', color: '#eeeeee' },
      { allowLiteralColors: true, minContrast: 4.5, onFail: 'strip-to-neutral' },
    )
    assert.equal(action, 'fail-strip')
    assert.equal(style.fill, GLASS_PALETTE.surface)
  })
})

describe('parseStyleProps', () => {
  it('解析 fill/color/stroke 与 extra', () => {
    const s = parseStyleProps('fill:#f5f5f5,color:#fff,stroke-width:2px')
    assert.equal(s.fill, '#f5f5f5')
    assert.equal(s.color, '#fff')
    assert.deepEqual(s.extra, ['stroke-width:2px'])
  })
})

describe('sanitizeMermaidSource', () => {
  it('task-435c 事故源码:浅 fill 被补/改成可读字色', () => {
    const src = `flowchart LR
  M[模型<br>越来越强]
  C[拐杖层] -->|内化| M
  M -->|接口| A[放大器层]
  style C fill:#f5f5f5
  style A fill:#eef2ff
`
    const { source } = sanitizeMermaidSource(src)
    assert.match(source, /style C fill:#f5f5f5,color:#211F1C/i)
    assert.match(source, /style A fill:#eef2ff,color:#211F1C/i)
    // 改写后两行均含可读字色
    for (const line of source.split('\n')) {
      if (!/style\s+[CA]\b/.test(line)) continue
      const color = line.match(/color:(#[0-9A-Fa-f]+)/i)?.[1]
      const fill = line.match(/fill:(#[0-9A-Fa-f]+)/i)?.[1]
      assert.ok(fill && color, line)
      assert.ok((contrastRatio(fill, color) ?? 0) >= 4.5, line)
    }
  })

  it('语义 class 注入 classDef', () => {
    const src = `flowchart LR
  A[a] --> B[b]
  class A muted
  class B accent
`
    const { source, actions } = sanitizeMermaidSource(src)
    assert.ok(actions.some((a) => a.startsWith('inject-classDef:muted')))
    assert.ok(actions.some((a) => a.startsWith('inject-classDef:accent')))
    assert.match(source, /classDef muted /)
    assert.match(source, /classDef accent /)
    const muted = semanticStyle('muted')!
    assert.match(source, new RegExp(`fill:${muted.fill}`))
  })

  it('classDef accent 被语义表覆盖(忽略模型乱色)', () => {
    const src = `flowchart LR
  A[a]
  classDef accent fill:#ffffff,color:#ffffff
  class A accent
`
    const { source, actions } = sanitizeMermaidSource(src)
    assert.ok(actions.includes('semantic:accent'))
    assert.doesNotMatch(source, /fill:#ffffff/)
    assert.match(source, /classDef accent fill:#1E322A/)
  })

  it('剥 init 中的 theme 强制', () => {
    const src = `%%{init: {'theme':'default'}}%%
flowchart LR
  A-->B
`
    const { source, actions } = sanitizeMermaidSource(src)
    assert.ok(actions.includes('strip-init-theme'))
    assert.doesNotMatch(source, /theme/)
  })

  it('合规 style 保留 fill+color', () => {
    const src = `flowchart LR
  A[a]
  style A fill:#252833,color:#E8EAEE,stroke:#3A4050
`
    const { source } = sanitizeMermaidSource(src)
    assert.match(source, /style A fill:#252833,color:#E8EAEE/)
  })
})

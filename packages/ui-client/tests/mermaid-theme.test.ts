/**
 * [INPUT]: mermaidTheme 与 appearance 的真实明暗基线 token
 * [OUTPUT]: 调色板随明暗基线变化、半透明 token 压成不透明色、模型颜色被剥离、语义 class 按主题定义
 * [POS]: 流程图颜色宿主裁决单测;取代按暗色写死的 mermaid-sanitize
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { applyHostColors, mermaidThemeVariables, paletteSignature, readMermaidPalette } from '../src/mermaid/mermaidTheme.ts'
import { DARK_BASELINE, LIGHT_BASELINE } from '../src/appearance/resolve.ts'

const light = readMermaidPalette(name => LIGHT_BASELINE[name] ?? '')
const dark = readMermaidPalette(name => DARK_BASELINE[name] ?? '')

describe('readMermaidPalette', () => {
  it('明暗基线得到不同调色板与 darkMode', () => {
    assert.equal(light.dark, false)
    assert.equal(dark.dark, true)
    assert.notEqual(paletteSignature(light), paletteSignature(dark))
    assert.equal(light.ink, '#18212d')
    assert.equal(mermaidThemeVariables(light).darkMode, false)
  })

  it('半透明 tint 压到画布上成为不透明 hex,mermaid 可推导', () => {
    for (const value of Object.values(light).filter(v => typeof v === 'string' && v.startsWith('#'))) {
      assert.match(value as string, /^#[0-9a-f]{6}$/)
    }
    // --success-bg rgba(42,108,83,0.09) 叠在 #F5F8FC 上:接近底色而非深绿
    assert.notEqual(light.okFill, light.ok)
    assert.ok(parseInt(light.okFill.slice(1, 3), 16) > 200, light.okFill)
  })

  it('缺 token 时有确定回退,不抛错', () => {
    const empty = readMermaidPalette(() => '')
    assert.equal(empty.dark, true)
    assert.match(empty.node, /^#[0-9a-f]{6}$/)
  })
})

describe('applyHostColors', () => {
  it('剥掉模型字面色与 init,保留非颜色属性', () => {
    const src = [
      '%%{init: {"theme":"forest"}}%%',
      'flowchart TD',
      '  A["入口"] --> B["出口"]',
      '  style A fill:#f5f5f5,color:#fff,stroke-width:2px',
      '  classDef hot fill:#ff0000,stroke:#000',
      '  linkStyle 0 stroke:#ff0000,stroke-width:3px',
    ].join('\n')
    const { source } = applyHostColors(src, light)
    assert.doesNotMatch(source, /init|forest|#f5f5f5|#ff0000|#fff\b|#000/)
    assert.match(source, /style A stroke-width:2px/)
    assert.match(source, /linkStyle 0 stroke-width:3px/)
    assert.doesNotMatch(source, /classDef hot/)
    assert.match(source, /A\["入口"\] --> B\["出口"\]/)
  })

  it('用到的语义 class 按当前主题定义;模型自带的同名定义被替换', () => {
    const src = 'flowchart TD\n  A --> B\n  C:::warn\n  class A,B ok\n  classDef ok fill:#123456'
    const lightOut = applyHostColors(src, light).source
    const darkOut = applyHostColors(src, dark).source
    assert.match(lightOut, new RegExp(`classDef ok fill:${light.okFill},stroke:${light.ok},color:${light.ink}`))
    assert.match(lightOut, new RegExp(`classDef warn fill:${light.warnFill}`))
    assert.doesNotMatch(lightOut, /#123456/)
    assert.notEqual(lightOut, darkOut)
  })

  it('未使用语义 class 时不追加定义,源码其余部分不变', () => {
    const src = 'sequenceDiagram\n  A->>B: hi\n'
    assert.deepEqual(applyHostColors(src, light), { source: src, actions: [] })
  })
})

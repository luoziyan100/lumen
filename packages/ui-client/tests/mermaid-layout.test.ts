/**
 * [INPUT]: mermaidLayout 固有尺寸政策 + ELK initialize 合同
 * [OUTPUT]: AT1 停拉伸且缓存 SVG 无卡片 max-width; AT2 ELK
 * [POS]: doc/mermaid-readability.md
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  ensureElkLayout,
  mermaidInitializeOptions,
  normalizeSvgIntrinsicSize,
  resetElkLayoutCache,
  SVG_INTRINSIC_SIZE_POLICY,
} from '../src/mermaid/mermaidLayout.ts'

function fakeSvg(initialWidth = '100%', attrWidth = '100%', initialMaxWidth = '100%') {
  const attrs = new Map<string, string>()
  if (attrWidth) attrs.set('width', attrWidth)
  return {
    style: {
      maxWidth: initialMaxWidth,
      height: '',
      width: initialWidth,
      removeProperty(name: string) {
        if (name === 'width') this.width = ''
        if (name === 'max-width') this.maxWidth = ''
      },
    },
    getAttribute(name: string) {
      return attrs.get(name) ?? null
    },
    removeAttribute(name: string) {
      attrs.delete(name)
    },
  }
}

describe('AT1 svg intrinsic size', () => {
  it('policy forbids stretch and card max-width on cached SVG', () => {
    assert.equal(SVG_INTRINSIC_SIZE_POLICY.maxWidth, 'none')
    assert.equal(SVG_INTRINSIC_SIZE_POLICY.height, 'auto')
    assert.equal(SVG_INTRINSIC_SIZE_POLICY.stretchWidth, false)
  })

  it('clears width:100% and inline max-width', () => {
    const svg = fakeSvg('100%', '100%', '100%')
    normalizeSvgIntrinsicSize(svg)
    assert.equal(svg.style.maxWidth, '')
    assert.equal(svg.style.height, 'auto')
    assert.notEqual(svg.style.width, '100%')
    assert.equal(svg.getAttribute('width'), null)
  })

  it('keeps intrinsic pixel width attribute', () => {
    const svg = fakeSvg('', '420', '100%')
    normalizeSvgIntrinsicSize(svg)
    assert.equal(svg.getAttribute('width'), '420')
    assert.equal(svg.style.maxWidth, '')
  })
})

describe('AT2 flowchart ELK contract', () => {
  it('elk ready → layout + defaultRenderer elk, useMaxWidth false', () => {
    const cfg = mermaidInitializeOptions({ fontFamily: 'x' }, true)
    assert.equal(cfg.layout, 'elk')
    assert.equal(cfg.flowchart.defaultRenderer, 'elk')
    assert.equal(cfg.flowchart.useMaxWidth, false)
    assert.equal(cfg.flowchart.htmlLabels, true)
    assert.equal(cfg.flowchart.padding, 8)
  })

  it('elk not ready → dagre fallback, no elk fields', () => {
    const cfg = mermaidInitializeOptions({}, false)
    assert.equal(cfg.layout, undefined)
    assert.equal(cfg.flowchart.defaultRenderer, undefined)
    assert.equal(cfg.flowchart.useMaxWidth, false)
  })

  it('register failure returns false and does not throw', async () => {
    resetElkLayoutCache()
    const mermaid = {
      registerLayoutLoaders() {
        throw new Error('no elk')
      },
    }
    assert.equal(await ensureElkLayout(mermaid), false)
  })

  it('official @mermaid-js/layout-elk exports loaders', async () => {
    const mod = await import('@mermaid-js/layout-elk')
    assert.ok(mod.default)
  })
})

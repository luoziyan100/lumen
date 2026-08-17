/**
 * [INPUT]: mermaidLayout 停拉伸政策 + ELK initialize 合同
 * [OUTPUT]: AT1 / AT2
 * [POS]: doc/mermaid-readability.md
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  applySvgHostSize,
  ensureElkLayout,
  mermaidInitializeOptions,
  resetElkLayoutCache,
  SVG_HOST_SIZE_POLICY,
} from '../src/mermaid/mermaidLayout.ts'

function fakeSvg(initialWidth = '100%', attrWidth = '100%') {
  const attrs = new Map<string, string>()
  if (attrWidth) attrs.set('width', attrWidth)
  return {
    style: {
      maxWidth: '',
      height: '',
      width: initialWidth,
      removeProperty(name: string) {
        if (name === 'width') this.width = ''
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

describe('AT1 svg host size', () => {
  it('policy forbids stretch width', () => {
    assert.equal(SVG_HOST_SIZE_POLICY.maxWidth, '100%')
    assert.equal(SVG_HOST_SIZE_POLICY.height, 'auto')
    assert.equal(SVG_HOST_SIZE_POLICY.stretchWidth, false)
  })

  it('clears width:100% and keeps max-width + auto height', () => {
    const svg = fakeSvg('100%', '100%')
    applySvgHostSize(svg)
    assert.equal(svg.style.maxWidth, '100%')
    assert.equal(svg.style.height, 'auto')
    assert.notEqual(svg.style.width, '100%')
    assert.equal(svg.getAttribute('width'), null)
  })

  it('keeps intrinsic pixel width attribute', () => {
    const svg = fakeSvg('', '420')
    applySvgHostSize(svg)
    assert.equal(svg.getAttribute('width'), '420')
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

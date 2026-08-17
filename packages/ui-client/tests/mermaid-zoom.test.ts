import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  clampZoom,
  panBy,
  panForZoom,
  sizeFromViewBox,
  viewBoxFromBBox,
  wheelZoomFactor,
  zoomByFactor,
  zoomByStep,
  ZOOM_MAX,
  ZOOM_MIN,
} from '../src/mermaid/mermaidZoom.ts'

describe('clampZoom / steps', () => {
  it('clamps to [0.5, 4]', () => {
    assert.equal(clampZoom(0.1), ZOOM_MIN)
    assert.equal(clampZoom(9), ZOOM_MAX)
    assert.equal(clampZoom(1), 1)
  })
  it('steps by 0.25', () => {
    assert.equal(zoomByStep(1, 1), 1.25)
    assert.equal(zoomByStep(0.5, -1), 0.5)
    assert.equal(zoomByStep(3.9, 1), 4)
  })
})

describe('zoomByFactor / wheel', () => {
  it('multiplies and clamps', () => {
    assert.equal(zoomByFactor(1, 2), 2)
    assert.equal(zoomByFactor(3, 2), 4)
    assert.equal(zoomByFactor(1, 0), 1)
  })
  it('wheel down shrinks, up grows', () => {
    assert.ok(wheelZoomFactor(100) < 1)
    assert.ok(wheelZoomFactor(-100) > 1)
  })
})

describe('sizeFromViewBox', () => {
  it('fits a wide mermaid viewBox into the lightbox max box', () => {
    const { w, h } = sizeFromViewBox(1200, 400, 900, 780)
    assert.equal(w, 900)
    assert.equal(h, 300)
  })
  it('zero viewBox does not invent NaN', () => {
    const { w, h } = sizeFromViewBox(0, 0, 800, 600)
    assert.equal(w, 800)
    assert.equal(h, 600)
  })
})

describe('viewBoxFromBBox', () => {
  it('pads ink and rejects empty', () => {
    const vb = viewBoxFromBBox({ x: 10, y: 20, width: 200, height: 80 }, 10)
    assert.deepEqual(vb, { x: 0, y: 10, w: 220, h: 100 })
    assert.equal(viewBoxFromBBox({ x: 0, y: 0, width: 0, height: 10 }), null)
  })
})

describe('panBy', () => {
  it('adds delta', () => {
    assert.deepEqual(panBy({ x: 10, y: -4 }, 3, 8), { x: 13, y: 4 })
  })
})

describe('panForZoom', () => {
  it('keeps origin pinned when doubling zoom', () => {
    const next = panForZoom({ x: 0, y: 0 }, 1, 2, { x: 40, y: -20 })
    assert.equal(next.x, -40)
    assert.equal(next.y, 20)
  })
})

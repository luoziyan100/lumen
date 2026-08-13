import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  clampZoom,
  panForZoom,
  wheelZoomFactor,
  zoomByFactor,
  zoomByStep,
  ZOOM_MAX,
  ZOOM_MIN,
} from '../src/mermaidZoom.ts'

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

describe('panForZoom', () => {
  it('keeps origin pinned when doubling zoom', () => {
    const next = panForZoom({ x: 0, y: 0 }, 1, 2, { x: 40, y: -20 })
    assert.equal(next.x, -40)
    assert.equal(next.y, 20)
  })
})

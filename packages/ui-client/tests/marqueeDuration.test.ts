/**
 * [INPUT]: marqueeDuration
 * [OUTPUT]: 双份无缝轨时长 = cycle / pps
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MARQUEE_PX_PER_SEC, marqueeDurationSec } from '../src/marqueeDuration.ts'

describe('marqueeDurationSec', () => {
  it('cycle 加倍则 duration 加倍', () => {
    const a = marqueeDurationSec(80)
    const b = marqueeDurationSec(160)
    assert.ok(a > 0)
    assert.equal(Number((b / a).toFixed(6)), 2)
  })

  it('像素速度对各 cycle 一致', () => {
    for (const cycle of [40, 160, 600]) {
      assert.equal(Number((cycle / marqueeDurationSec(cycle)).toFixed(6)), MARQUEE_PX_PER_SEC)
    }
  })

  it('零宽不动画', () => {
    assert.equal(marqueeDurationSec(0), 0)
  })
})

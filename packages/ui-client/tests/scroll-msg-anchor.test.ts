/**
 * 无 DOM 环境:测锚定位移算术
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

/** 与 restoreMsgAnchor 同式 */
function anchorScrollDelta(containerTop: number, elementTop: number, savedOffsetTop: number): number {
  return (elementTop - containerTop) - savedOffsetTop
}

describe('msg scroll anchor 算术', () => {
  it('元素下移 60 → scrollTop 应 +60', () => {
    // 曾在视口 offset 20;布局后 top=80(相对 viewport),container top=0
    assert.equal(anchorScrollDelta(0, 80, 20), 60)
  })
  it('元素未动 → 0', () => {
    assert.equal(anchorScrollDelta(0, 20, 20), 0)
  })
})

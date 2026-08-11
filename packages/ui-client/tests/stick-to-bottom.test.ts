/**
 * [INPUT]: stick-to-bottom 纯函数(对标 OpenWork 手势窗/上滑阈值)
 * [POS]: ui-client 对话滚动单测
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  distanceFromBottom,
  isNearBottom,
  shouldFollowScrollHeight,
  shouldResetHeightBaseline,
  isWithinGestureWindow,
  isMeaningfulScrollUp,
  isMeaningfulScrollDown,
  shouldEnterSticky,
  shouldLeaveSticky,
} from '../src/useStickToBottom.ts'

function fakeScroller(partial: {
  scrollHeight: number
  scrollTop: number
  clientHeight: number
}): HTMLElement {
  return partial as HTMLElement
}

describe('distanceFromBottom / isNearBottom', () => {
  it('贴底', () => {
    assert.equal(
      distanceFromBottom(fakeScroller({ scrollHeight: 1000, scrollTop: 900, clientHeight: 100 })),
      0,
    )
    assert.equal(
      isNearBottom(fakeScroller({ scrollHeight: 1000, scrollTop: 900, clientHeight: 100 }), 4),
      true,
    )
  })
  it('上滚离开', () => {
    assert.equal(
      isNearBottom(fakeScroller({ scrollHeight: 1000, scrollTop: 400, clientHeight: 100 }), 64),
      false,
    )
  })
})

describe('shouldFollowScrollHeight', () => {
  it('增高跟随,回缩不追', () => {
    assert.equal(shouldFollowScrollHeight(100, 120, false), true)
    assert.equal(shouldFollowScrollHeight(200, 150, false), false)
  })
  it('force 可追回缩(仅 pin)', () => {
    assert.equal(shouldFollowScrollHeight(200, 150, true), true)
  })
})

describe('shouldResetHeightBaseline', () => {
  it('回缩下移基线', () => {
    assert.equal(shouldResetHeightBaseline(200, 150), true)
    assert.equal(shouldResetHeightBaseline(150, 200), false)
  })
})

describe('OpenWork 手势契约', () => {
  it('手势窗 600ms 内保护', () => {
    assert.equal(isWithinGestureWindow(1000, 1500, 600), true)
    assert.equal(isWithinGestureWindow(1000, 1700, 600), false)
  })

  it('上滑 ≥16px 算明确离开底', () => {
    assert.equal(isMeaningfulScrollUp(100, 80, 16), true) // -20
    assert.equal(isMeaningfulScrollUp(100, 90, 16), false) // -10 抖动
    assert.equal(isMeaningfulScrollUp(100, 120, 16), false) // 下滑
  })

  it('下滑检测', () => {
    assert.equal(isMeaningfulScrollDown(100, 120, 16), true)
    assert.equal(isMeaningfulScrollDown(100, 110, 16), false)
  })
})

describe('V1 sticky 进出(mermaid 高度塌缩)', () => {
  it('仅 gap 变小不进 sticky(布局塌缩)', () => {
    assert.equal(shouldEnterSticky({
      gap: 0,
      bottomGapPx: 4,
      scrolledUp: false,
      scrolledTowardBottom: false,
      heightRecentlyCollapsed: false,
    }), false)
  })

  it('大塌缩护栏内即使下滑也不进(防同帧抽动)', () => {
    assert.equal(shouldEnterSticky({
      gap: 0,
      bottomGapPx: 4,
      scrolledUp: false,
      scrolledTowardBottom: true,
      heightRecentlyCollapsed: true,
    }), false)
  })

  it('用户向下滚到贴底才进 sticky', () => {
    assert.equal(shouldEnterSticky({
      gap: 2,
      bottomGapPx: 4,
      scrolledUp: false,
      scrolledTowardBottom: true,
      heightRecentlyCollapsed: false,
    }), true)
  })

  it('上滑或手势离底离开 sticky', () => {
    assert.equal(shouldLeaveSticky({
      gap: 100,
      bottomGapPx: 4,
      leaveBottomGapPx: 64,
      scrolledUp: true,
      gestured: false,
    }), true)
    assert.equal(shouldLeaveSticky({
      gap: 20,
      bottomGapPx: 4,
      leaveBottomGapPx: 64,
      scrolledUp: false,
      gestured: true,
    }), true)
    assert.equal(shouldLeaveSticky({
      gap: 2,
      bottomGapPx: 4,
      leaveBottomGapPx: 64,
      scrolledUp: false,
      gestured: false,
    }), false)
  })
})

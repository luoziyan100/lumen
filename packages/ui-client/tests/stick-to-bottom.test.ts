/**
 * [INPUT]: isNearBottom / distanceFromBottom
 * [OUTPUT]: 贴底判定与回滞阈值不变式
 * [POS]: ui-client 对话滚动单测
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { distanceFromBottom, isNearBottom } from '../src/useStickToBottom.ts'

function fakeScroller(partial: {
  scrollHeight: number
  scrollTop: number
  clientHeight: number
}): HTMLElement {
  return partial as HTMLElement
}

describe('distanceFromBottom', () => {
  it('贴底为 0', () => {
    assert.equal(
      distanceFromBottom(fakeScroller({ scrollHeight: 1000, scrollTop: 900, clientHeight: 100 })),
      0,
    )
  })
})

describe('isNearBottom', () => {
  it('贴底时为 true', () => {
    assert.equal(
      isNearBottom(fakeScroller({ scrollHeight: 1000, scrollTop: 900, clientHeight: 100 }), 64),
      true,
    )
  })

  it('上滚超过阈值时为 false', () => {
    assert.equal(
      isNearBottom(fakeScroller({ scrollHeight: 1000, scrollTop: 400, clientHeight: 100 }), 64),
      false,
    )
  })

  it('恰好在阈值边界为 true', () => {
    assert.equal(
      isNearBottom(fakeScroller({ scrollHeight: 1000, scrollTop: 836, clientHeight: 100 }), 64),
      true,
    )
  })
})

/**
 * [INPUT]: isSessionMarqueeActive
 * [OUTPUT]: 同时最多一条热;菜单打开优先;悬停他行必须熄灭本行
 * [POS]: 锁住「只有最长那条自己转」的回归
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isSessionMarqueeActive } from '../src/marquee/marqueeActive.ts'

describe('isSessionMarqueeActive', () => {
  const a = 'task-a'
  const b = 'task-b'

  it('闲置不热', () => {
    assert.equal(isSessionMarqueeActive(a, null, false), false)
  })

  it('只热当前悬停行', () => {
    assert.equal(isSessionMarqueeActive(a, a, false), true)
    assert.equal(isSessionMarqueeActive(b, a, false), false)
  })

  it('菜单打开时该行热,他行仍不热', () => {
    assert.equal(isSessionMarqueeActive(a, b, true), true)
    assert.equal(isSessionMarqueeActive(b, b, false), true)
    assert.equal(isSessionMarqueeActive(b, a, false), false)
  })
})

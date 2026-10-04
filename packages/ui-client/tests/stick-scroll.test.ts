/**
 * [INPUT]: conversation/stick 的纯滚动判定
 * [OUTPUT]: 上滑离钉、近底程序滚动不恢复跟随、内容增高才追底的回归
 * [POS]: 对话滚动合同的无浏览器部分；组件路径见 mastra-composer
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { followAfterGrowth, followAfterScroll } from '../src/mastra/views/conversation/stick.ts'

const base = { following: true, programmatic: false, collapseGuard: false, previousTop: 800, scrollTop: 760, gap: 40 }

test('上滑 16px 以上离开跟随，即使离底部仍小于 64px', () => {
  assert.equal(followAfterScroll(base), false)
})

test('程序滚回近底不恢复跟随', () => {
  assert.equal(followAfterScroll({ ...base, following: false, programmatic: true, previousTop: 760, scrollTop: 800, gap: 0 }), false)
})

test('用户向下滚到离底部 64px 内才恢复跟随', () => {
  assert.equal(followAfterScroll({ ...base, following: false, previousTop: 700, scrollTop: 760, gap: 40 }), true)
  assert.equal(followAfterScroll({ ...base, following: false, previousTop: 700, scrollTop: 720, gap: 80 }), false)
})

test('高度塌缩期间不因 gap 变小吸回', () => {
  assert.equal(followAfterScroll({ ...base, following: false, collapseGuard: true, previousTop: 700, scrollTop: 790, gap: 10 }), false)
})

test('手势窗内或已经离开底部时，内容增高不追底', () => {
  assert.equal(followAfterGrowth({ following: true, now: 1000, gestureUntil: 1600, previousHeight: 100, nextHeight: 140 }), false)
  assert.equal(followAfterGrowth({ following: false, now: 2000, gestureUntil: 0, previousHeight: 100, nextHeight: 140 }), false)
  assert.equal(followAfterGrowth({ following: true, now: 2000, gestureUntil: 0, previousHeight: 100, nextHeight: 140 }), true)
  assert.equal(followAfterGrowth({ following: true, now: 2000, gestureUntil: 0, previousHeight: 140, nextHeight: 100 }), false)
})

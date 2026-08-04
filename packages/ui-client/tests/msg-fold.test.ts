/**
 * [INPUT]: msgFold.shouldCollapseUserText
 * [OUTPUT]: 9 行 / 750 字折叠判定不变式
 * [POS]: ui-client 测试;锁用户气泡折叠门槛
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  shouldCollapseUserText,
  USER_FOLD_MAX_CHARS,
  USER_FOLD_MAX_LINES,
} from '../src/msgFold.ts'

describe('shouldCollapseUserText', () => {
  it('短文不折', () => {
    assert.equal(shouldCollapseUserText('你好,帮我综述一下'), false)
  })

  it('超过行数阈值则折', () => {
    const lines = Array.from({ length: USER_FOLD_MAX_LINES + 1 }, (_, i) => `第 ${i + 1} 行`).join('\n')
    assert.equal(shouldCollapseUserText(lines), true)
  })

  it('刚好行数上限不折', () => {
    const lines = Array.from({ length: USER_FOLD_MAX_LINES }, (_, i) => `第 ${i + 1} 行`).join('\n')
    assert.equal(shouldCollapseUserText(lines), false)
  })

  it('单行超字数则折', () => {
    assert.equal(shouldCollapseUserText('字'.repeat(USER_FOLD_MAX_CHARS + 1)), true)
  })

  it('空串不折', () => {
    assert.equal(shouldCollapseUserText('   '), false)
  })
})

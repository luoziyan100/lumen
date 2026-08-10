/**
 * [INPUT]: isLiveTaskEvent
 * [OUTPUT]: 切会话后在途归约必须丢弃(空草稿不串旧研究过程)
 * [POS]: 会话串台防护单测
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isLiveTaskEvent } from '../src/useAgent.ts'

describe('isLiveTaskEvent', () => {
  it('当前会话且 epoch 一致 → 可归约', () => {
    assert.equal(isLiveTaskEvent('task-a', 'task-a', 3, 3), true)
  })

  it('已切到空草稿(taskId=null) → 丢弃', () => {
    assert.equal(isLiveTaskEvent('task-a', null, 3, 4), false)
  })

  it('epoch 过期(清屏后迟到 setItems) → 丢弃', () => {
    assert.equal(isLiveTaskEvent('task-a', 'task-a', 3, 4), false)
  })

  it('事件属于其它 task → 丢弃', () => {
    assert.equal(isLiveTaskEvent('task-old', 'task-new', 5, 5), false)
  })

  it('草稿上任何事件都不归约', () => {
    assert.equal(isLiveTaskEvent('task-a', null, 1, 1), false)
  })
})

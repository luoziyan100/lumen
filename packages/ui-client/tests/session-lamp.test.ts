/**
 * [INPUT]: sessionLamp.*
 * [OUTPUT]: 会话灯优先级与未读置位不变式
 * [POS]: ui-client 测试;锁侧栏 Progressive status 灯
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  sessionLampKind,
  shouldMarkUnreadOnStatus,
} from '../src/sessionLamp.ts'

describe('sessionLampKind', () => {
  it('idle:空心', () => {
    assert.equal(sessionLampKind({ status: 'done', unread: false }), 'idle')
  })

  it('unread:实心', () => {
    assert.equal(sessionLampKind({ status: 'done', unread: true }), 'unread')
  })

  it('running 压过 unread', () => {
    assert.equal(sessionLampKind({ status: 'running', unread: true }), 'running')
  })

  it('queued 视作运行态', () => {
    assert.equal(sessionLampKind({ status: 'queued', unread: false }), 'running')
  })
})

describe('shouldMarkUnreadOnStatus', () => {
  it('后台 running→done → 未读', () => {
    assert.equal(shouldMarkUnreadOnStatus({
      prevStatus: 'running', status: 'done', taskId: 'a', activeTaskId: 'b',
    }), true)
  })

  it('当前会话终态 → 不标未读', () => {
    assert.equal(shouldMarkUnreadOnStatus({
      prevStatus: 'running', status: 'done', taskId: 'a', activeTaskId: 'a',
    }), false)
  })

  it('已是终态的 meta 更新(如 pin) → 不标', () => {
    assert.equal(shouldMarkUnreadOnStatus({
      prevStatus: 'done', status: 'done', taskId: 'a', activeTaskId: 'b',
    }), false)
  })

  it('列表新出现的终态 → 不标', () => {
    assert.equal(shouldMarkUnreadOnStatus({
      prevStatus: undefined, status: 'done', taskId: 'a', activeTaskId: 'b',
    }), false)
  })

  it('仍在跑 → 不标', () => {
    assert.equal(shouldMarkUnreadOnStatus({
      prevStatus: 'queued', status: 'running', taskId: 'a', activeTaskId: 'b',
    }), false)
  })
})

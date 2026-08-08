/**
 * [INPUT]: visibleSessions / SESSION_PREVIEW_N
 * [OUTPUT]: 项目树会话截断 + active 保底不变式
 * [POS]: ui-client 测试;锁 Sidebar Progressive Disclosure
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SESSION_PREVIEW_N, visibleSessions } from '../src/visibleSessions.ts'

function ids(n: number): { id: string }[] {
  return Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}` }))
}

describe('visibleSessions', () => {
  it('≤N 条无 toggle、全量', () => {
    const tasks = ids(SESSION_PREVIEW_N)
    const r = visibleSessions(tasks, { expanded: false, activeId: null })
    assert.equal(r.canToggle, false)
    assert.equal(r.capped, false)
    assert.deepEqual(r.visible.map((t) => t.id), ['t1', 't2', 't3', 't4'])
  })

  it('5+ 收起:只见前 N + 展开 toggle', () => {
    const tasks = ids(6)
    const r = visibleSessions(tasks, { expanded: false, activeId: null })
    assert.equal(r.canToggle, true)
    assert.equal(r.capped, true)
    assert.deepEqual(r.visible.map((t) => t.id), ['t1', 't2', 't3', 't4'])
  })

  it('展开:全量 + 可收起', () => {
    const tasks = ids(6)
    const r = visibleSessions(tasks, { expanded: true, activeId: null })
    assert.equal(r.canToggle, true)
    assert.equal(r.capped, false)
    assert.equal(r.visible.length, 6)
  })

  it('active 在窗内:不追加', () => {
    const tasks = ids(6)
    const r = visibleSessions(tasks, { expanded: false, activeId: 't2' })
    assert.deepEqual(r.visible.map((t) => t.id), ['t1', 't2', 't3', 't4'])
  })

  it('active 在窗外:追加为第 N+1(保底可见)', () => {
    const tasks = ids(8)
    const r = visibleSessions(tasks, { expanded: false, activeId: 't8' })
    assert.equal(r.capped, true)
    assert.deepEqual(r.visible.map((t) => t.id), ['t1', 't2', 't3', 't4', 't8'])
  })

  it('active 不在列表:忽略保底', () => {
    const tasks = ids(6)
    const r = visibleSessions(tasks, { expanded: false, activeId: 'missing' })
    assert.deepEqual(r.visible.map((t) => t.id), ['t1', 't2', 't3', 't4'])
  })

  it('自定义 n', () => {
    const tasks = ids(5)
    const r = visibleSessions(tasks, { expanded: false, activeId: null, n: 3 })
    assert.deepEqual(r.visible.map((t) => t.id), ['t1', 't2', 't3'])
    assert.equal(r.canToggle, true)
  })
})

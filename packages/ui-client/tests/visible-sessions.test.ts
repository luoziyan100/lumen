/**
 * [INPUT]: visibleSessions / SESSION_PREVIEW_N / SESSION_RECENT_N
 * [OUTPUT]: 项目树与最近截断 + active 保底;无展开全量
 * [POS]: ui-client 测试;锁 Sidebar 可见窗
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  SESSION_PREVIEW_N, SESSION_RECENT_N, visibleSessions,
} from '../src/sessions/visibleSessions.ts'

function ids(n: number): { id: string }[] {
  return Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}` }))
}

describe('visibleSessions', () => {
  it('≤N 条无 toggle、全量', () => {
    const tasks = ids(SESSION_PREVIEW_N)
    const r = visibleSessions(tasks, { activeId: null })
    assert.equal(r.canToggle, false)
    assert.equal(r.capped, false)
    assert.deepEqual(r.visible.map((t) => t.id), ['t1', 't2', 't3', 't4'])
  })

  it('5+ 只见前 N + 查看全部', () => {
    const tasks = ids(6)
    const r = visibleSessions(tasks, { activeId: null })
    assert.equal(r.canToggle, true)
    assert.equal(r.capped, true)
    assert.deepEqual(r.visible.map((t) => t.id), ['t1', 't2', 't3', 't4'])
  })

  it('active 在窗内:不追加', () => {
    const tasks = ids(6)
    const r = visibleSessions(tasks, { activeId: 't2' })
    assert.deepEqual(r.visible.map((t) => t.id), ['t1', 't2', 't3', 't4'])
  })

  it('active 在窗外:追加为第 N+1(保底可见)', () => {
    const tasks = ids(8)
    const r = visibleSessions(tasks, { activeId: 't8' })
    assert.equal(r.capped, true)
    assert.deepEqual(r.visible.map((t) => t.id), ['t1', 't2', 't3', 't4', 't8'])
  })

  it('active 不在列表:忽略保底', () => {
    const tasks = ids(6)
    const r = visibleSessions(tasks, { activeId: 'missing' })
    assert.deepEqual(r.visible.map((t) => t.id), ['t1', 't2', 't3', 't4'])
  })

  it('自定义 n', () => {
    const tasks = ids(5)
    const r = visibleSessions(tasks, { activeId: null, n: 3 })
    assert.deepEqual(r.visible.map((t) => t.id), ['t1', 't2', 't3'])
    assert.equal(r.canToggle, true)
  })

  it('最近窗 n=20:第 21 条起不在窗;canToggle 即底钮', () => {
    const tasks = ids(22)
    const r = visibleSessions(tasks, { activeId: null, n: SESSION_RECENT_N })
    assert.equal(SESSION_RECENT_N, 20)
    assert.equal(r.canToggle, true)
    assert.equal(r.visible.length, 20)
    assert.ok(!r.visible.some((t) => t.id === 't21'))
  })

  it('最近恰 20 条无底钮', () => {
    const r = visibleSessions(ids(20), { activeId: null, n: SESSION_RECENT_N })
    assert.equal(r.canToggle, false)
    assert.equal(r.visible.length, 20)
  })
})
